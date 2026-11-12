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
const FULLSCREEN_WARNING = 'Không bật được toàn màn hình, vẫn tiếp tục chụp.';

type CaptureFn = ReturnType<typeof usePoseCutout>['capture'];

/** `idle` is the main screen: no capture run and no unsaved captures. */
export type CalibrationStep = 'idle' | 'capturing' | 'review' | 'saving';
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

/**
 * Orchestrates profile loading, consent, the camera, the capture run (fullscreen), review and
 * saving for /calibration. The camera is independent of the capture run: it is switched on from
 * the main screen and switched off automatically when a run ends (saved or discarded).
 */
export function useCalibrationSession(
  overlayRef: RefObject<HTMLCanvasElement | null>,
  fullscreenRef: RefObject<HTMLElement | null>,
) {
  const [profile, setProfile] = useState<CalibrationProfile | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const [step, setStep] = useState<CalibrationStep>('idle');
  const [saveMode, setSaveMode] = useState<CalibrationSaveMode>('replace-all');
  const [captures, setCaptures] = useState<Record<string, LocalCapture>>({});
  const [queue, setQueue] = useState<Cell[]>([]);
  const [activeCell, setActiveCell] = useState<Cell | null>(null);
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [seconds, setSecondsState] = useState(CALIBRATION_DEFAULT_COUNTDOWN);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenWarning, setFullscreenWarning] = useState<string | null>(null);

  const capturesRef = useRef(captures);
  const runRef = useRef(0);
  const secondsRef = useRef(seconds);
  const sessionIdRef = useRef('');
  const saveModeRef = useRef(saveMode);
  const stepRef = useRef(step);
  const abortRef = useRef<AbortController | null>(null);
  const deviceRef = useRef('');
  const programmaticExitRef = useRef(false);
  const cancelCaptureRef = useRef<() => void>(() => undefined);

  const camera = useCalibrationCamera();
  const { start: startCamera, stop: stopCamera } = camera;
  const cameraRunning = camera.status === 'starting' || camera.status === 'ready';
  const pose = usePoseCutout({ video: camera.video, enabled: cameraRunning, overlayRef });
  const captureRef = useRef<CaptureFn>(pose.capture);

  const active = step !== 'idle';

  useEffect(() => { captureRef.current = pose.capture; }, [pose.capture]);
  useEffect(() => { secondsRef.current = seconds; }, [seconds]);
  useEffect(() => { saveModeRef.current = saveMode; }, [saveMode]);
  useEffect(() => { stepRef.current = step; }, [step]);
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
      setLoadError(message(cause, 'Không thể tải thiết lập đã lưu.'));
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

  // Fullscreen: entered from the click that starts a run, left when the run ends. Leaving it any
  // other way (Esc, browser UI) while capturing cancels the run and keeps what was captured.
  useEffect(() => {
    const onChange = () => {
      const open = Boolean(document.fullscreenElement);
      setIsFullscreen(open);
      if (open) return;
      if (programmaticExitRef.current) { programmaticExitRef.current = false; return; }
      if (stepRef.current === 'capturing') cancelCaptureRef.current();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const enterFullscreen = useCallback(() => {
    const element = fullscreenRef.current;
    if (!element || typeof element.requestFullscreen !== 'function') {
      setFullscreenWarning(FULLSCREEN_WARNING);
      return;
    }
    setFullscreenWarning(null);
    // Must be called synchronously inside the user's click; a refusal is not an error.
    element.requestFullscreen().catch(() => setFullscreenWarning(FULLSCREEN_WARNING));
  }, [fullscreenRef]);

  const exitFullscreen = useCallback(() => {
    if (!document.fullscreenElement) return;
    programmaticExitRef.current = true;
    document.exitFullscreen().catch(() => { programmaticExitRef.current = false; });
  }, []);

  useEffect(() => () => {
    runRef.current += 1;
    abortRef.current?.abort();
    for (const capture of Object.values(capturesRef.current)) URL.revokeObjectURL(capture.url);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
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
    exitFullscreen();
    setStep('review');
  }, [exitFullscreen, replaceCaptures, wait]);

  const canBegin = camera.status === 'ready' && pose.modelState === 'ready';

  const beginRun = useCallback((mode: CalibrationSaveMode, cells: readonly Cell[]) => {
    runRef.current += 1;
    replaceCaptures({});
    sessionIdRef.current = crypto.randomUUID();
    setSaveMode(mode);
    setQueue([...cells]);
    setSaveError(null);
    setStatus(null);
    void runQueue(cells);
  }, [replaceCaptures, runQueue]);

  /** "Bắt đầu chụp" / "Thiết lập lại toàn bộ": all nine cells; saving replaces the whole profile. */
  const startFull = useCallback(() => {
    if (!canBegin || stepRef.current !== 'idle') return;
    enterFullscreen();
    beginRun('replace-all', CALIBRATION_CELL_ORDER);
  }, [beginRun, canBegin, enterFullscreen]);

  /** "Chụp lại ô r,c" from the main screen: saving replaces only that cell. */
  const startRetakeSelected = useCallback(() => {
    if (!canBegin || !selectedCell || stepRef.current !== 'idle') return;
    enterFullscreen();
    beginRun('replace-cells', [selectedCell]);
  }, [beginRun, canBegin, enterFullscreen, selectedCell]);

  /** Retake one cell from review, keeping the same capture session. */
  const retake = useCallback((cell: Cell) => {
    if (!canBegin) {
      setNotice('Camera hoặc model chưa sẵn sàng để chụp lại.');
      return;
    }
    enterFullscreen();
    void runQueue([cell]);
  }, [canBegin, enterFullscreen, runQueue]);

  const exitSession = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    replaceCaptures({});
    exitFullscreen();
    setStep('idle');
    setActiveCell(null);
    setSelectedCell(null);
    setCountdown(null);
    setNotice(null);
    setSaveProgress(null);
    setFullscreenWarning(null);
    // The camera is only needed while a run (or its review) is open.
    stopCamera();
  }, [exitFullscreen, replaceCaptures, stopCamera]);

  const cancelCapture = useCallback(() => {
    runRef.current += 1;
    setCountdown(null);
    setActiveCell(null);
    setNotice(null);
    exitFullscreen();
    // Nothing captured yet: back to the main screen with the camera still on for another try.
    setStep(Object.keys(capturesRef.current).length ? 'review' : 'idle');
  }, [exitFullscreen]);

  useEffect(() => { cancelCaptureRef.current = cancelCapture; }, [cancelCapture]);

  useEffect(() => {
    if (camera.status === 'error' && step === 'capturing') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a lost camera must stop the capture run immediately
      cancelCapture();
    }
  }, [camera.status, step, cancelCapture]);

  const setSeconds = useCallback((value: number) => {
    setSecondsState(value);
    try { window.localStorage.setItem(COUNTDOWN_STORAGE_KEY, String(value)); } catch { /* optional */ }
  }, []);

  const enableCamera = useCallback(() => {
    setStatus(null);
    void startCamera(deviceRef.current || undefined);
  }, [startCamera]);

  const disableCamera = useCallback(() => {
    if (stepRef.current !== 'idle') return;
    stopCamera();
  }, [stopCamera]);

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
            mirrored: false as const, bodyCoverage: capture.posture.bodyCoverage,
            headToHipPx: capture.posture.headToHipPx, poseModel: capture.posture.poseModel,
            capturedAt: capture.capturedAt,
          })),
        });
      } catch (cause) {
        // Upload tokens may have expired; a retry uploads under fresh pathnames.
        for (const capture of latest) patchCapture(capture.key, { uploaded: false, pathname: undefined });
        throw cause;
      }
      setProfile(updated);
      setStatus(`Đã lưu thiết lập (${updated.completeness}/9 ô).`);
      exitSession();
    } catch (cause) {
      if (controller.signal.aborted) {
        setStep('review');
        return;
      }
      setSaveError(message(cause, 'Không thể lưu thiết lập. Ảnh của bạn vẫn còn trên trang, hãy thử lại.'));
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
      setStatus('Đã xoá thiết lập đã lưu.');
    } catch (cause) {
      setStatus(message(cause, 'Không thể xoá thiết lập.'));
    } finally {
      setBusy(false);
    }
  }, []);

  const needsConsent = loadState === 'ready' && (!profile || profile.consentVersion !== CALIBRATION_CONSENT_VERSION);
  const capturedCount = Object.keys(captures).length;
  const leaveWarning = step === 'saving'
    ? 'Ảnh thiết lập đang được lưu. Rời trang lúc này có thể làm gián đoạn việc lưu.'
    : active && capturedCount > 0
      ? `Bạn có ${capturedCount} ảnh thiết lập chưa lưu. Nếu rời trang, các ảnh này sẽ bị mất.`
      : null;

  return {
    profile, loadState, loadError, retryLoad: () => setLoadAttempt((value) => value + 1),
    needsConsent, consentBusy, consentError, acceptConsent,
    active, step, saveMode, captures, queue, activeCell, selectedCell, selectCell: setSelectedCell,
    countdown, notice, seconds, setSeconds,
    saveProgress, saveError, status, busy, leaveWarning, isFullscreen, fullscreenWarning,
    camera, pose, cameraRunning, canBegin,
    enableCamera, disableCamera, startFull, startRetakeSelected, retake, cancelCapture, exitSession,
    save, cancelSave, removeProfile,
  };
}
