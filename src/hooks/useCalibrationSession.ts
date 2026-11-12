'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useCalibrationCamera } from '@/hooks/useCalibrationCamera';
import { usePoseCutout, type CapturedPosture } from '@/hooks/usePoseCutout';
import {
  acceptCalibrationConsent,
  commitCalibrationPostures,
  deleteCalibrationProfile,
  fetchCalibrationProfile,
  fetchCalibrationUploadConfig,
  uploadCalibrationImage,
} from '@/lib/calibration/client';
import { QUALITY_MESSAGES } from '@/lib/calibration/geometry';
import {
  CALIBRATION_CELL_ORDER,
  CALIBRATION_CONSENT_VERSION,
  CALIBRATION_COUNTDOWN_OPTIONS,
  CALIBRATION_DEFAULT_COUNTDOWN,
  calibrationCellKey,
} from '@/lib/calibration/policy';
import type { CalibrationProfile, CalibrationSaveMode } from '@/types/calibration';

const COUNTDOWN_STORAGE_KEY = 'recordweb-calibration-countdown';
const RETRY_PAUSE_MS = 1800;

type CaptureFn = ReturnType<typeof usePoseCutout>['capture'];

export type CalibrationStep = 'ready' | 'capturing' | 'review' | 'saving';
export type Cell = readonly [row: number, col: number];

export interface LocalCapture {
  key: string;
  row: number;
  col: number;
  url: string;
  posture: CapturedPosture;
  capturedAt: string;
  /** Set once the image is on Blob; cleared if the commit fails so a retry uploads fresh paths. */
  pathname?: string;
  uploaded: boolean;
}

function readCountdown(): number {
  try {
    const stored = Number(window.localStorage.getItem(COUNTDOWN_STORAGE_KEY));
    return (CALIBRATION_COUNTDOWN_OPTIONS as readonly number[]).includes(stored) ? stored : CALIBRATION_DEFAULT_COUNTDOWN;
  } catch {
    return CALIBRATION_DEFAULT_COUNTDOWN;
  }
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** Orchestrates profile loading, consent, the capture queue and saving for /calibration. */
export function useCalibrationSession(overlayRef: RefObject<HTMLCanvasElement | null>) {
  const [profile, setProfile] = useState<CalibrationProfile | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const [active, setActive] = useState(false);
  const [step, setStep] = useState<CalibrationStep>('ready');
  const [saveMode, setSaveMode] = useState<CalibrationSaveMode>('replace-all');
  const [captures, setCaptures] = useState<Record<string, LocalCapture>>({});
  const [queue, setQueue] = useState<Cell[]>([]);
  const [activeCell, setActiveCell] = useState<Cell | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [seconds, setSecondsState] = useState(CALIBRATION_DEFAULT_COUNTDOWN);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const capturesRef = useRef(captures);
  const runRef = useRef(0);
  const secondsRef = useRef(seconds);
  const sessionIdRef = useRef('');
  const saveModeRef = useRef(saveMode);
  const abortRef = useRef<AbortController | null>(null);
  const deviceRef = useRef('');

  const camera = useCalibrationCamera();
  const { start: startCamera, stop: stopCamera } = camera;
  const pose = usePoseCutout({ video: camera.video, active, overlayRef });
  const captureRef = useRef(pose.capture);

  useEffect(() => { captureRef.current = pose.capture; }, [pose.capture]);
  useEffect(() => { secondsRef.current = seconds; }, [seconds]);
  useEffect(() => { saveModeRef.current = saveMode; }, [saveMode]);
  useEffect(() => { deviceRef.current = camera.deviceId; }, [camera.deviceId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
  useEffect(() => { setSecondsState(readCountdown()); }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the load state must reset when a retry begins
    setLoadState('loading');
    setLoadError(null);
    fetchCalibrationProfile(controller.signal).then((loaded) => {
      setProfile(loaded);
      setLoadState('ready');
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      setLoadError(message(cause, 'Không thể tải profile calibration.'));
      setLoadState('error');
    });
    return () => controller.abort();
  }, [loadAttempt]);

  const replaceCaptures = useCallback((next: Record<string, LocalCapture>) => {
    for (const [key, old] of Object.entries(capturesRef.current)) {
      if (next[key]?.url !== old.url) URL.revokeObjectURL(old.url);
    }
    capturesRef.current = next;
    setCaptures(next);
  }, []);

  const patchCapture = useCallback((key: string, patch: Partial<LocalCapture>) => {
    const current = capturesRef.current[key];
    if (!current) return;
    const next = { ...capturesRef.current, [key]: { ...current, ...patch } };
    capturesRef.current = next;
    setCaptures(next);
  }, []);

  useEffect(() => () => {
    runRef.current += 1;
    abortRef.current?.abort();
    for (const capture of Object.values(capturesRef.current)) URL.revokeObjectURL(capture.url);
  }, []);

  const wait = useCallback((ms: number, run: number) => new Promise<boolean>((resolve) => {
    window.setTimeout(() => resolve(runRef.current === run), ms);
  }), []);

  const runQueue = useCallback(async (cells: readonly Cell[]) => {
    const run = ++runRef.current;
    setStep('capturing');
    setNotice(null);
    for (const cell of cells) {
      const [row, col] = cell;
      setActiveCell(cell);
      for (;;) {
        for (let remaining = secondsRef.current; remaining > 0; remaining -= 1) {
          setCountdown(remaining);
          if (!(await wait(1000, run))) return;
        }
        setCountdown(0);
        let outcome: Awaited<ReturnType<CaptureFn>> | null = null;
        let failure: string | null = null;
        try {
          outcome = await captureRef.current();
        } catch (cause) {
          failure = message(cause, 'Không thể chụp ảnh. Đang thử lại.');
        }
        if (runRef.current !== run) return;
        if (outcome?.ok) {
          const key = calibrationCellKey(row, col);
          replaceCaptures({
            ...capturesRef.current,
            [key]: {
              key, row, col, posture: outcome.posture, uploaded: false,
              url: URL.createObjectURL(outcome.posture.blob), capturedAt: new Date().toISOString(),
            },
          });
          setNotice(null);
          break;
        }
        setCountdown(null);
        setNotice(failure ?? (outcome && !outcome.ok ? QUALITY_MESSAGES[outcome.issues[0]] : 'Không thể chụp ảnh.'));
        if (!(await wait(RETRY_PAUSE_MS, run))) return;
        setNotice(null);
      }
    }
    setActiveCell(null);
    setCountdown(null);
    setStep('review');
  }, [replaceCaptures, wait]);

  const openSession = useCallback((mode: CalibrationSaveMode, cells: readonly Cell[]) => {
    runRef.current += 1;
    replaceCaptures({});
    sessionIdRef.current = crypto.randomUUID();
    setSaveMode(mode);
    setQueue([...cells]);
    setActiveCell(null);
    setCountdown(null);
    setNotice(null);
    setSaveError(null);
    setStatus(null);
    setStep('ready');
    setActive(true);
    void startCamera(deviceRef.current || undefined);
  }, [startCamera, replaceCaptures]);

  /** "Chụp lại toàn bộ": all nine cells; saving replaces the whole profile. */
  const startFull = useCallback(() => openSession('replace-all', CALIBRATION_CELL_ORDER), [openSession]);

  /** "Chụp lại ô" from the saved profile: saving replaces only that cell. */
  const startRetake = useCallback((cell: Cell) => openSession('replace-cells', [cell]), [openSession]);

  const begin = useCallback(() => { void runQueue(queue); }, [queue, runQueue]);

  /** Retake one cell during review, keeping the same capture session. */
  const retake = useCallback((cell: Cell) => {
    if (camera.status !== 'ready' || pose.modelState !== 'ready') {
      setNotice('Camera hoặc model chưa sẵn sàng để chụp lại.');
      return;
    }
    void runQueue([cell]);
  }, [camera.status, pose.modelState, runQueue]);

  const cancelCapture = useCallback(() => {
    runRef.current += 1;
    setCountdown(null);
    setActiveCell(null);
    setNotice(null);
    setStep(Object.keys(capturesRef.current).length ? 'review' : 'ready');
  }, []);

  const exitSession = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    replaceCaptures({});
    setActive(false);
    setStep('ready');
    setActiveCell(null);
    setCountdown(null);
    setNotice(null);
    setSaveProgress(null);
    stopCamera();
  }, [stopCamera, replaceCaptures]);

  useEffect(() => {
    if (camera.status === 'error' && step === 'capturing') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a lost camera must stop the capture loop immediately
      cancelCapture();
    }
  }, [camera.status, step, cancelCapture]);

  const setSeconds = useCallback((value: number) => {
    setSecondsState(value);
    try { window.localStorage.setItem(COUNTDOWN_STORAGE_KEY, String(value)); } catch { /* optional */ }
  }, []);

  const save = useCallback(async () => {
    const ordered = CALIBRATION_CELL_ORDER
      .map(([row, col]) => capturesRef.current[calibrationCellKey(row, col)])
      .filter((capture): capture is LocalCapture => Boolean(capture));
    if (!ordered.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep('saving');
    setSaveError(null);
    setSaveProgress({ done: ordered.filter((capture) => capture.uploaded).length, total: ordered.length });
    try {
      const config = await fetchCalibrationUploadConfig(controller.signal);
      let done = ordered.filter((capture) => capture.uploaded).length;
      for (const capture of ordered) {
        if (!capture.uploaded) {
          const pathname = `${config.prefix}${crypto.randomUUID()}.png`;
          await uploadCalibrationImage(config, pathname, capture.posture.blob, controller.signal);
          patchCapture(capture.key, { pathname, uploaded: true });
          done += 1;
          setSaveProgress({ done, total: ordered.length });
        }
      }
      const latest = CALIBRATION_CELL_ORDER
        .map(([row, col]) => capturesRef.current[calibrationCellKey(row, col)])
        .filter((capture): capture is LocalCapture => Boolean(capture));
      let updated: CalibrationProfile;
      try {
        updated = await commitCalibrationPostures({
          mode: saveModeRef.current,
          captureSessionId: sessionIdRef.current,
          postures: latest.map((capture) => ({
            cellRow: capture.row, cellCol: capture.col, pathname: capture.pathname!,
            widthPx: capture.posture.widthPx, heightPx: capture.posture.heightPx,
            sourceWidth: capture.posture.sourceWidth, sourceHeight: capture.posture.sourceHeight,
            sourceBbox: capture.posture.sourceBbox, scaleFactor: capture.posture.scaleFactor,
            mirrored: false as const, poseModel: capture.posture.poseModel, capturedAt: capture.capturedAt,
          })),
        });
      } catch (cause) {
        // Upload tokens may have expired; a retry uploads under fresh pathnames.
        for (const capture of latest) patchCapture(capture.key, { uploaded: false, pathname: undefined });
        throw cause;
      }
      setProfile(updated);
      setStatus(`Đã lưu ${updated.completeness}/9 ô calibration.`);
      exitSession();
    } catch (cause) {
      if (controller.signal.aborted) {
        setStep('review');
        return;
      }
      setSaveError(message(cause, 'Không thể lưu calibration. Ảnh của bạn vẫn còn trên trang, hãy thử lại.'));
      setStep('review');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [exitSession, patchCapture]);

  const cancelSave = useCallback(() => abortRef.current?.abort(), []);

  const acceptConsent = useCallback(async () => {
    setConsentBusy(true);
    setConsentError(null);
    try {
      setProfile(await acceptCalibrationConsent());
    } catch (cause) {
      setConsentError(message(cause, 'Không thể ghi nhận xác nhận.'));
    } finally {
      setConsentBusy(false);
    }
  }, []);

  const removeProfile = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      await deleteCalibrationProfile();
      setProfile(null);
      setStatus('Đã xoá toàn bộ profile calibration.');
    } catch (cause) {
      setStatus(message(cause, 'Không thể xoá profile.'));
    } finally {
      setBusy(false);
    }
  }, []);

  const needsConsent = loadState === 'ready' && (!profile || profile.consentVersion !== CALIBRATION_CONSENT_VERSION);
  const capturedCount = Object.keys(captures).length;
  const leaveWarning = step === 'saving' && active
    ? 'Ảnh calibration đang được lưu. Rời trang lúc này có thể làm gián đoạn việc lưu.'
    : active && capturedCount > 0
      ? `Bạn có ${capturedCount} ảnh calibration chưa lưu. Nếu rời trang, các ảnh này sẽ bị mất.`
      : null;

  return {
    profile, loadState, loadError, retryLoad: () => setLoadAttempt((value) => value + 1),
    needsConsent, consentBusy, consentError, acceptConsent,
    active, step, saveMode, captures, queue, activeCell, countdown, notice, seconds, setSeconds,
    saveProgress, saveError, status, busy, leaveWarning,
    camera, pose,
    canBegin: camera.status === 'ready' && pose.modelState === 'ready',
    startFull, startRetake, begin, retake, cancelCapture, exitSession, save, cancelSave, removeProfile,
  };
}
