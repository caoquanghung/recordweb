'use client';

import { upload } from '@vercel/blob/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppNavigation } from '@/components/app/AppNavigation';
import { useMediaSession } from '@/components/media/MediaSessionProvider';
import { RecordedAudioWaveforms } from '@/components/review/RecordedAudioWaveforms';
import { RecordedCursorTrajectory } from '@/components/review/RecordedCursorTrajectory';
import { AudioMeterPanel } from '@/components/studio/AudioMeterPanel';
import { useCanvasCompositor } from '@/hooks/useCanvasCompositor';
import { useCursorTrajectory } from '@/hooks/useCursorTrajectory';
import { useAudioDSP } from '@/hooks/useAudioDSP';
import type { AudioDspPreset } from '@/hooks/useAudioDSP';
import { useNormalizedVideoStream } from '@/hooks/useNormalizedVideoStream';
import { useRecordingSession } from '@/hooks/useRecordingSession';
import { useVisionSegmentation } from '@/hooks/useVisionSegmentation';
import { repairWebmDuration } from '@/lib/ebmlPatcher';
import { decodeRecordedWaveform } from '@/lib/audioWaveform';
import {
  deleteRecordingDraft,
  getRecordingDrafts,
  saveLocalRecording,
  type RecordingDraft,
} from '@/lib/idb';
import type { DbRecording, DbStudioPreset } from '@/types/database';
import type {
  AudioFilterConfig,
  BackgroundRemovalMode,
  PipShape,
  PipSize,
  RecordingMode,
} from '@/types/media';
import type { RecordingAssetKind, RecordingAssetMetadata, RecordingMetadata } from '@/types/recording';
import styles from './StudioShell.module.css';

type SessionState = 'setup' | 'countdown' | 'recording' | 'paused' | 'processing' | 'review';
type CheckState = 'idle' | 'checking' | 'ready' | 'error';
type Theme = 'light' | 'dark';
type UploadState = 'idle' | 'uploading' | 'saving' | 'ready' | 'error';

const MEDIA_ASSET_KINDS: Exclude<RecordingAssetKind, 'cursor'>[] = [
  'composite',
  'webcam',
  'screen',
  'audio',
  'microphone-audio',
  'system-audio',
];
const SOURCE_DOWNLOAD_KINDS: Exclude<RecordingAssetKind, 'composite'>[] = [
  'webcam',
  'screen',
  'audio',
  'microphone-audio',
  'system-audio',
  'cursor',
];

interface HealthResponse {
  auth: 'authenticated';
  database: 'connected' | 'not-configured' | 'error';
  blob: 'configured' | 'not-configured';
  checkedAt: string;
}

interface BrowserCapabilities {
  screenCapture: boolean;
  cameraAndMic: boolean;
  mediaRecorder: boolean;
  indexedDb: boolean;
  fileSystemSave: boolean;
}

const modes: Array<{ value: RecordingMode; label: string; detail: string }> = [
  { value: 'screen-pip', label: 'Studio', detail: 'Screen + camera' },
  { value: 'screen-only', label: 'Screen', detail: 'Display only' },
  { value: 'webcam-only', label: 'Camera', detail: 'Webcam only' },
];

const backgrounds: Array<{ value: BackgroundRemovalMode; label: string }> = [
  { value: 'original', label: 'Original' },
  { value: 'blur', label: 'Blur' },
  { value: 'cutout', label: 'Cutout' },
];

const audioModes = ['Natural', 'Voice clarity', 'Noise reduction', 'Podcast', 'Custom'];
const audioPresetByLabel: Record<string, AudioDspPreset> = {
  Natural: 'natural',
  'Voice clarity': 'voice-clarity',
  'Noise reduction': 'noise-reduction',
  Podcast: 'podcast',
  Custom: 'custom',
};

type BlobContentType = 'video/mp4' | 'video/webm' | 'audio/mp4' | 'audio/webm' | 'application/json';

function getBlobContentType(mimeType: string): BlobContentType {
  const baseType = mimeType.split(';', 1)[0].trim().toLowerCase();
  if (
    baseType === 'video/mp4'
    || baseType === 'video/webm'
    || baseType === 'audio/mp4'
    || baseType === 'audio/webm'
    || baseType === 'application/json'
  ) {
    return baseType;
  }
  throw new Error(`Unsupported recording content type: ${mimeType || 'unknown'}`);
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.split(';', 1)[0].trim().toLowerCase() === 'application/json') return 'json';
  const baseType = getBlobContentType(mimeType);
  if (baseType === 'audio/mp4') return 'm4a';
  if (baseType.endsWith('/mp4')) return 'mp4';
  return 'webm';
}

function compositeAssetFor(recording: RecordingMetadata): RecordingAssetMetadata | null {
  if (recording.assets?.composite) return recording.assets.composite;
  if (!recording.blob) return null;
  return {
    kind: 'composite',
    blob: recording.blob,
    fileSizeBytes: recording.fileSizeBytes,
    mimeType: recording.mimeType,
    resolution: recording.resolution,
    fps: recording.fps,
  };
}

function recordingAssetLabel(kind: RecordingAssetKind) {
  if (kind === 'webcam') return 'Webcam 720p';
  if (kind === 'screen') return 'Screen 1080p';
  if (kind === 'audio') return 'Mixed audio';
  if (kind === 'microphone-audio') return 'Microphone audio';
  if (kind === 'system-audio') return 'System audio';
  if (kind === 'cursor') return 'Cursor path 24 Hz';
  return 'Composite';
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function Icon({ name }: { name: 'grid' | 'record' | 'library' | 'settings' | 'spark' | 'screen' | 'camera' | 'mic' | 'pause' | 'stop' | 'play' | 'cloud' | 'check' | 'refresh' | 'shield' | 'sun' | 'moon' }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    record: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,
    library: <><path d="M4 5.5h16v14H4z"/><path d="M8 5.5V3h8v2.5M8 10h8M8 14h6"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    spark: <><path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 3Z"/><path d="m5 14 .7 2.3L8 17.5l-2.3 1.2L5 21l-.7-2.3L2 17.5l2.3-1.2L5 14ZM19 13l.5 1.7 1.5.8-1.5.8L19 18l-.5-1.7-1.5-.8 1.5-.8L19 13Z"/></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
    camera: <><path d="M15 8h4l2-2v12l-2-2h-4"/><rect x="3" y="6" width="12" height="12" rx="2"/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2"/>,
    play: <path d="m8 5 11 7-11 7V5Z"/>,
    cloud: <path d="M7 18h11a4 4 0 0 0 .7-7.9A7 7 0 0 0 5.3 8.3 5 5 0 0 0 7 18Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M20.2 15.5A8.5 8.5 0 0 1 8.5 3.8 8.5 8.5 0 1 0 20.2 15.5Z"/>,
  };

  return (
    <svg aria-hidden="true" className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={ok ? styles.statusDotOk : styles.statusDotIdle} />;
}

export function StudioShell() {
  const [mode, setMode] = useState<RecordingMode>('screen-pip');
  const [background, setBackground] = useState<BackgroundRemovalMode>('blur');
  const [pipShape, setPipShape] = useState<PipShape>('rounded');
  const [pipSize, setPipSize] = useState<PipSize>('medium');
  const [audioMode, setAudioMode] = useState('Voice clarity');
  const [resolution, setResolution] = useState('1920x1080');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(true);
  const [healthState, setHealthState] = useState<CheckState>('idle');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [presets, setPresets] = useState<DbStudioPreset[]>([]);
  const [presetName, setPresetName] = useState('My studio preset');
  const [presetMessage, setPresetMessage] = useState('');
  const [theme, setTheme] = useState<Theme>('dark');
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [effectsTab, setEffectsTab] = useState<'camera' | 'audio' | 'preset'>('camera');
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('');
  const [isConnectingSources, setIsConnectingSources] = useState(false);
  const [sourceCaptureEnabled, setSourceCaptureEnabled] = useState(false);
  const [recoveredRecording, setRecoveredRecording] = useState<RecordingMetadata | null>(null);
  const [recoveryDrafts, setRecoveryDrafts] = useState<RecordingDraft[]>([]);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState('');
  const [cloudRecording, setCloudRecording] = useState<DbRecording | null>(null);
  const recoveredPreviewUrlRef = useRef<string | null>(null);
  const [micGain, setMicGain] = useState(1);
  const [systemVolume, setSystemVolume] = useState(1);
  const [customAudioConfig, setCustomAudioConfig] = useState<AudioFilterConfig>({
    highPassEnabled: true,
    vocalBoostEnabled: true,
    lowPassEnabled: true,
    compressorEnabled: true,
    noiseGateEnabled: true,
    micGain: 1,
  });
  const {
    screenStream,
    cameraStream,
    microphoneStream,
    systemAudioStream,
    cameras,
    microphones,
    statuses: mediaStatuses,
    error: mediaError,
    hasSystemAudio,
    acquireScreen,
    acquireCamera,
    acquireMicrophone,
    stopAll: stopAllMedia,
    stopScreen,
    stopCamera,
    clearError: clearMediaError,
    tabCapture,
  } = useMediaSession();

  const {
    outputStream: mixedAudioStream,
    microphoneOutputStream,
    systemAudioOutputStream,
    state: audioState,
    microphoneLevel,
    microphoneLevelDb,
    systemAudioLevel,
    systemAudioLevelDb,
    error: audioError,
    resume: resumeAudio,
  } = useAudioDSP({
    microphoneStream,
    systemAudioStream,
    preset: audioPresetByLabel[audioMode] ?? 'voice-clarity',
    muted: micMuted,
    micGain,
    systemGain: systemVolume,
    monitorSystemAudio: tabCapture.connected,
    customConfig: customAudioConfig,
  });

  const {
    effectCanvas,
    state: segmentationState,
    error: segmentationError,
    inferenceFps,
  } = useVisionSegmentation(
    mode === 'screen-only' || !cameraVisible ? null : cameraStream,
    background,
  );

  const compositorResolution = resolution === '1920x1080'
    ? { width: 1920, height: 1080 }
    : { width: 1280, height: 720 };
  const {
    canvasRef,
    outputStream: compositeStream,
    fps: compositorFps,
    isRendering: compositorRunning,
    pipPosition,
    warning: compositorWarning,
    setPipPosition,
    canvasPointerHandlers,
  } = useCanvasCompositor({
    screenStream,
    cameraStream,
    mode,
    resolution: compositorResolution,
    pipShape,
    pipSize,
    cameraVisible,
    cameraEffectCanvas: segmentationState === 'running' ? effectCanvas : null,
  });

  const normalizedWebcamStream = useNormalizedVideoStream(
    cameraStream,
    1280,
    720,
    sourceCaptureEnabled,
  );
  const normalizedScreenStream = useNormalizedVideoStream(
    screenStream,
    1920,
    1080,
    sourceCaptureEnabled,
  );
  const legacyCursorTrajectory = useCursorTrajectory(screenStream);
  const cursorCapture = tabCapture.connected
    ? tabCapture.cursorController
    : legacyCursorTrajectory.controller;

  const {
    status: recordingStatus,
    elapsedMs,
    warning: recordingWarning,
    error: recordingError,
    recording: completedRecording,
    start: startRecording,
    pause: pauseRecording,
    resume: resumeRecording,
    stop: stopRecording,
    reset: resetRecording,
  } = useRecordingSession({
    videoStream: compositeStream,
    webcamStream: normalizedWebcamStream,
    screenStream: normalizedScreenStream,
    audioStream: mixedAudioStream,
    microphoneAudioStream: microphoneOutputStream,
    systemAudioStream: systemAudioOutputStream,
    resolution,
    fps: 30,
    cursorCapture,
  });

  const activeRecording = completedRecording ?? recoveredRecording;
  const session: SessionState = countdown !== null
    ? 'countdown'
    : activeRecording
      ? 'review'
      : recordingStatus === 'recording' || recordingStatus === 'paused' || recordingStatus === 'processing'
        ? recordingStatus
        : 'setup';
  const elapsed = activeRecording?.durationSeconds ?? elapsedMs / 1000;

  useEffect(() => {
    if (recordingStatus !== 'ready' && recordingStatus !== 'error') return;
    const releaseSourceCanvases = window.setTimeout(() => setSourceCaptureEnabled(false), 0);
    return () => window.clearTimeout(releaseSourceCanvases);
  }, [recordingStatus]);

  const activeMode = useMemo(
    () => modes.find((item) => item.value === mode) ?? modes[0],
    [mode]
  );

  const loadPresets = useCallback(async () => {
    try {
      const presetResponse = await fetch('/api/presets', { cache: 'no-store' });
      const presetJson = await presetResponse.json();

      if (!presetResponse.ok) throw new Error(presetJson.error ?? 'Could not load presets.');

      setPresets(presetJson.presets ?? []);
    } catch {
      setPresets([]);
    }
  }, []);

  useEffect(() => {
    const syncTheme = window.setTimeout(() => {
      const activeTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      setTheme(activeTheme);
    }, 0);
    return () => window.clearTimeout(syncTheme);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadPresets(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadPresets]);

  useEffect(() => {
    const applyPendingSetup = window.setTimeout(() => {
      try {
        const quickStart = localStorage.getItem('recordweb-quick-start');
        if (quickStart) {
          const configuration = JSON.parse(quickStart) as {
            mode?: RecordingMode;
            background?: BackgroundRemovalMode;
            audioMode?: string;
          };
          if (configuration.mode && modes.some((item) => item.value === configuration.mode)) setMode(configuration.mode);
          if (configuration.background && backgrounds.some((item) => item.value === configuration.background)) setBackground(configuration.background);
          if (configuration.audioMode && audioModes.includes(configuration.audioMode)) setAudioMode(configuration.audioMode);
          localStorage.removeItem('recordweb-quick-start');
        }

        const pendingPreset = localStorage.getItem('recordweb-pending-preset');
        if (pendingPreset) {
          const preset = JSON.parse(pendingPreset) as DbStudioPreset;
          setPipShape(preset.pip_shape as PipShape);
          setPipSize(preset.pip_size as PipSize);
          setBackground(preset.bg_removal_mode as BackgroundRemovalMode);
          const filters = preset.filters_config as { mode?: string; resolution?: string };
          if (filters.mode) setAudioMode(filters.mode);
          if (filters.resolution) setResolution(filters.resolution);
          setPresetMessage(`Loaded “${preset.preset_name}” from Dashboard.`);
          localStorage.removeItem('recordweb-pending-preset');
        }
      } catch {
        localStorage.removeItem('recordweb-quick-start');
        localStorage.removeItem('recordweb-pending-preset');
      }
    }, 0);
    return () => window.clearTimeout(applyPendingSetup);
  }, []);

  useEffect(() => {
    const loadDrafts = window.setTimeout(() => {
      void getRecordingDrafts()
        .then(setRecoveryDrafts)
        .catch((error) => setRecoveryMessage(`Could not inspect recovery data: ${(error as Error).message}`));
    }, 0);
    return () => window.clearTimeout(loadDrafts);
  }, []);

  useEffect(() => () => {
    if (recoveredPreviewUrlRef.current) URL.revokeObjectURL(recoveredPreviewUrlRef.current);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem('recordweb-theme', nextTheme);
    setTheme(nextTheme);
  };

  const connectSources = async () => {
    setIsConnectingSources(true);
    clearMediaError();

    try {
      if (mode === 'webcam-only') stopScreen();
      else if (!tabCapture.available && legacyCursorTrajectory.available) await acquireScreen();

      if (mode === 'screen-only') stopCamera();
      else await acquireCamera(selectedCameraId || undefined);

      await acquireMicrophone(selectedMicrophoneId || undefined);
      if (mode === 'webcam-only' || screenStream) setSourcesOpen(false);
    } finally {
      setIsConnectingSources(false);
    }
  };

  const sourcesConnected = Boolean(screenStream || cameraStream || microphoneStream);
  const visualSourcesConnected = Boolean(screenStream || cameraStream);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && diagnosticsOpen) {
        setDiagnosticsOpen(false);
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;

      if ((event.code === 'Space' || (event.altKey && event.key.toLowerCase() === 'p')) && (session === 'recording' || session === 'paused')) {
        event.preventDefault();
        if (session === 'paused') resumeRecording();
        else pauseRecording();
      }
      if (event.altKey && event.key.toLowerCase() === 's' && (session === 'recording' || session === 'paused')) {
        event.preventDefault();
        stopRecording();
      }
      if (event.altKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        setMicMuted((value) => !value);
      }
      if (event.altKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setCameraVisible((value) => !value);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [diagnosticsOpen, pauseRecording, resumeRecording, session, stopRecording]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        void startRecording();
      } else {
        setCountdown((value) => value === null ? null : value - 1);
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [countdown, startRecording]);

  const startUiTest = async () => {
    if (!compositeStream?.getVideoTracks().length) {
      setRecoveryMessage('Connect a screen or camera source before recording.');
      setSourcesOpen(true);
      return;
    }
    if (recoveredPreviewUrlRef.current) {
      URL.revokeObjectURL(recoveredPreviewUrlRef.current);
      recoveredPreviewUrlRef.current = null;
    }
    setRecoveredRecording(null);
    resetRecording();
    setCloudRecording(null);
    setUploadState('idle');
    setUploadMessage('');
    setRecoveryMessage('');
    setSourceCaptureEnabled(true);
    await resumeAudio();
    setCountdown(3);
    setSourcesOpen(false);
    setEffectsOpen(false);
  };

  const recoverLatestDraft = async () => {
    const draft = recoveryDrafts[0];
    if (!draft) return;
    setRecoveryMessage('Recovering the latest recording…');
    try {
      const draftAssets = draft.assets ?? (draft.chunks?.length ? {
        composite: {
          mimeType: draft.mimeType || 'video/webm',
          chunks: draft.chunks,
          resolution,
          fps: 30,
        },
      } : {});
      const assets: Partial<Record<RecordingAssetKind, RecordingAssetMetadata>> = {};
      for (const kind of MEDIA_ASSET_KINDS) {
        const draftAsset = draftAssets[kind];
        if (!draftAsset?.chunks.length) continue;
        const rawBlob = new Blob(draftAsset.chunks, { type: draftAsset.mimeType });
        const blob = rawBlob.type.includes('webm')
          ? await repairWebmDuration(rawBlob, draft.durationMs)
          : rawBlob;
        assets[kind] = {
          kind,
          blob,
          fileSizeBytes: blob.size,
          mimeType: blob.type || draftAsset.mimeType,
          resolution: draftAsset.resolution,
          fps: draftAsset.fps,
          sampleRateHz: draftAsset.sampleRateHz,
        };
      }
      for (const kind of ['audio', 'microphone-audio', 'system-audio'] as const) {
        const recoveredAudio = assets[kind];
        if (!recoveredAudio?.blob) continue;
        try {
          recoveredAudio.waveformPeaks = (await decodeRecordedWaveform(recoveredAudio.blob)).peaks;
        } catch {
          setRecoveryMessage('Recovery succeeded, but this browser could not decode the audio waveform.');
        }
      }
      const composite = assets.composite;
      if (!composite?.blob) throw new Error('The recovery checkpoint does not contain a composite video.');
      if (recoveredPreviewUrlRef.current) URL.revokeObjectURL(recoveredPreviewUrlRef.current);
      const previewUrl = URL.createObjectURL(composite.blob);
      recoveredPreviewUrlRef.current = previewUrl;
      const recording: RecordingMetadata = {
        id: draft.id,
        localId: draft.id,
        title: `Recovered recording ${new Date(draft.startedAt).toLocaleString()}`,
        durationSeconds: draft.durationMs / 1000,
        fileSizeBytes: composite.fileSizeBytes,
        resolution: composite.resolution ?? resolution,
        fps: composite.fps ?? 30,
        mimeType: composite.mimeType,
        createdAt: draft.startedAt,
        blob: composite.blob,
        previewUrl,
        assets,
      };
      await saveLocalRecording(recording);
      await deleteRecordingDraft(draft.id);
      setRecoveredRecording(recording);
      setRecoveryDrafts((current) => current.filter((item) => item.id !== draft.id));
      setRecoveryMessage('Recovery complete. The recording is saved locally.');
    } catch (error) {
      setRecoveryMessage(`Recovery failed: ${(error as Error).message}`);
    }
  };

  const resetReview = () => {
    if (recoveredPreviewUrlRef.current) {
      URL.revokeObjectURL(recoveredPreviewUrlRef.current);
      recoveredPreviewUrlRef.current = null;
    }
    setRecoveredRecording(null);
    setSourceCaptureEnabled(false);
    resetRecording();
    setCloudRecording(null);
    setUploadState('idle');
    setUploadProgress(0);
    setUploadMessage('');
  };

  const downloadRecordingAsset = (kind: RecordingAssetKind) => {
    if (!activeRecording) return;
    const asset = kind === 'composite'
      ? compositeAssetFor(activeRecording)
      : activeRecording.assets?.[kind] ?? null;
    if (!asset?.blob) return;
    const temporaryUrl = kind === 'composite' && activeRecording.previewUrl
      ? activeRecording.previewUrl
      : URL.createObjectURL(asset.blob);
    const anchor = document.createElement('a');
    anchor.href = temporaryUrl;
    anchor.download = kind === 'cursor'
      ? `${activeRecording.id}-cursor.json`
      : `recordweb-${activeRecording.id}-${kind}.${extensionForMimeType(asset.mimeType)}`;
    anchor.click();
    if (temporaryUrl !== activeRecording.previewUrl) URL.revokeObjectURL(temporaryUrl);
  };

  const uploadRecording = async () => {
    if (!activeRecording) return;
    const composite = compositeAssetFor(activeRecording);
    if (!composite?.blob) return;
    setUploadState('uploading');
    setUploadProgress(0);
    setUploadMessage('Uploading composite and source assets directly to Vercel Blob…');
    try {
      const localAssets = [
        composite,
        activeRecording.assets?.webcam,
        activeRecording.assets?.screen,
        activeRecording.assets?.audio,
        activeRecording.assets?.['microphone-audio'],
        activeRecording.assets?.['system-audio'],
        activeRecording.assets?.cursor,
      ].filter((asset): asset is RecordingAssetMetadata & { blob: Blob } => Boolean(asset?.blob));
      const progressByKind = new Map<RecordingAssetKind, number>();
      const updateTotalProgress = () => {
        const total = localAssets.reduce((sum, asset) => sum + (progressByKind.get(asset.kind) ?? 0), 0);
        setUploadProgress(Math.round(total / localAssets.length));
      };
      const uploadedAssets = await Promise.all(localAssets.map(async (asset) => {
        const contentType = getBlobContentType(asset.mimeType);
        const extension = extensionForMimeType(asset.mimeType);
        const uploaded = await upload(`recordings/${activeRecording.id}/${asset.kind}.${extension}`, asset.blob, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          contentType,
          multipart: true,
          onUploadProgress: ({ percentage }) => {
            progressByKind.set(asset.kind, percentage);
            updateTotalProgress();
          },
        });
        return {
          kind: asset.kind,
          storage_url: uploaded.url,
          blob_pathname: uploaded.pathname,
          mime_type: asset.mimeType,
          file_size_bytes: asset.fileSizeBytes,
          resolution: asset.resolution ?? null,
          fps: asset.fps ?? null,
          sample_rate_hz: asset.sampleRateHz ?? null,
          metadata: ['audio', 'microphone-audio', 'system-audio'].includes(asset.kind) && asset.waveformPeaks
            ? { waveformPeaks: asset.waveformPeaks, waveformVersion: 1 }
            : {},
        };
      }));
      const uploadedComposite = uploadedAssets.find((asset) => asset.kind === 'composite');
      if (!uploadedComposite) throw new Error('The composite upload did not complete.');
      setUploadState('saving');
      setUploadMessage('Uploads complete. Saving asset metadata to Neon…');
      const response = await fetch('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeRecording.title,
          duration_seconds: activeRecording.durationSeconds,
          file_size_bytes: activeRecording.fileSizeBytes,
          resolution: activeRecording.resolution,
          fps: activeRecording.fps,
          mime_type: activeRecording.mimeType,
          local_id: activeRecording.localId,
          storage_url: uploadedComposite.storage_url,
          blob_pathname: uploadedComposite.blob_pathname,
          is_public: false,
          assets: uploadedAssets,
          settings: {
            recordingMode: mode,
            pipShape,
            pipSize,
            pipPosition,
            bgRemovalMode: background,
            audioMode,
            waveformPeaks: activeRecording.assets?.audio?.waveformPeaks ?? [],
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.recording) {
        throw new Error(data.error ?? data.message ?? 'Neon did not return the saved metadata.');
      }
      setCloudRecording(data.recording);
      setUploadState('ready');
      setUploadProgress(100);
      setUploadMessage(`${uploadedAssets.length} assets stored in Vercel Blob and indexed in Neon. Sharing is private by default.`);
    } catch (error) {
      setUploadState('error');
      setUploadMessage(`Cloud save failed: ${(error as Error).message}`);
    }
  };

  const publishAndCopyLink = async () => {
    if (!cloudRecording) return;
    setUploadMessage('Enabling the public share link…');
    try {
      const response = await fetch('/api/recordings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cloudRecording.id, is_public: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not update sharing access.');
      setCloudRecording(data.recording);
      const shareUrl = `${window.location.origin}/share/${cloudRecording.id}`;
      await navigator.clipboard.writeText(shareUrl);
      setUploadMessage('Public share link copied to the clipboard.');
    } catch (error) {
      setUploadMessage(`Could not publish: ${(error as Error).message}`);
    }
  };

  const runSystemCheck = async () => {
    setHealthState('checking');
    setCapabilities({
      screenCapture: Boolean(navigator.mediaDevices?.getDisplayMedia),
      cameraAndMic: Boolean(navigator.mediaDevices?.getUserMedia),
      mediaRecorder: 'MediaRecorder' in window,
      indexedDb: 'indexedDB' in window,
      fileSystemSave: 'showSaveFilePicker' in window,
    });

    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok && response.status !== 503) {
        throw new Error(data.error ?? 'Health check failed.');
      }
      setHealth(data);
      setHealthState(response.ok ? 'ready' : 'error');
    } catch {
      setHealth(null);
      setHealthState('error');
    }
  };

  const savePreset = async () => {
    const cleanName = presetName.trim();
    if (!cleanName) {
      setPresetMessage('Enter a preset name first.');
      return;
    }

    setPresetMessage('Saving…');
    try {
      const response = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset_name: cleanName,
          pip_shape: pipShape,
          pip_size: pipSize,
          pip_position: 'bottom-right',
          bg_removal_mode: background,
          filters_config: { mode: audioMode, resolution },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not save preset.');
      setPresetMessage('Saved to Neon.');
      await loadPresets();
    } catch (error) {
      setPresetMessage((error as Error).message);
    }
  };

  const applyPreset = (preset: DbStudioPreset) => {
    setPipShape(preset.pip_shape as PipShape);
    setPipSize(preset.pip_size as PipSize);
    setBackground(preset.bg_removal_mode as BackgroundRemovalMode);
    const filters = preset.filters_config as { mode?: string; resolution?: string };
    if (filters.mode) setAudioMode(filters.mode);
    if (filters.resolution) setResolution(filters.resolution);
    setPresetMessage(`Loaded “${preset.preset_name}”.`);
  };

  const sessionLabel = {
    setup: 'Ready',
    countdown: 'Starting',
    recording: 'Recording',
    paused: 'Paused',
    processing: 'Finalizing',
    review: 'Review',
  }[session];

  return (
    <main className={styles.appShell}>
      <AppNavigation active="studio" />

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <div className={styles.eyebrow}>RecordWeb studio</div>
            <h1>Recording workspace</h1>
          </div>
          <div className={styles.topbarActions}>
            <button
              className={styles.themeButton}
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <div className={styles.privacyPill}><Icon name="shield" /> Local until you upload</div>
            <button
              className={styles.secondaryButton}
              onClick={() => {
                setDiagnosticsOpen(true);
                if (healthState === 'idle') void runSystemCheck();
              }}
            >
              <Icon name="shield" />
              Diagnostics
            </button>
          </div>
        </header>

        <div className={styles.workspaceToolbar}>
          <div className={styles.drawerActions} aria-label="Workspace panels">
            <button
              className={`${styles.drawerButton} ${sourcesOpen ? styles.drawerButtonActive : ''}`}
              onClick={() => {
                setSourcesOpen((value) => !value);
                if (!sourcesOpen && window.innerWidth < 1440) setEffectsOpen(false);
              }}
              aria-pressed={sourcesOpen}
            >
              <Icon name="screen" /> Sources
            </button>
            <button
              className={`${styles.drawerButton} ${effectsOpen ? styles.drawerButtonActive : ''}`}
              onClick={() => {
                setEffectsOpen((value) => !value);
                if (!effectsOpen && window.innerWidth < 1440) setSourcesOpen(false);
              }}
              aria-pressed={effectsOpen}
            >
              <Icon name="spark" /> Effects
            </button>
          </div>
          <div className={styles.liveSummary}>
            <span className={sourcesConnected ? styles.summaryReady : styles.summaryIdle} />
            {sourcesConnected ? 'Sources connected' : 'Connect sources to begin'}
          </div>
        </div>

        {(recoveryDrafts.length > 0 || recoveryMessage || recordingWarning || recordingError) && (
          <div className={styles.sessionNotice} role="status">
            <div>
              <strong>
                {recoveryDrafts.length > 0
                  ? `${recoveryDrafts.length} recoverable recording${recoveryDrafts.length === 1 ? '' : 's'} found`
                  : recordingError ? 'Recording error' : 'Session update'}
              </strong>
              <span>{recordingError ?? recordingWarning ?? recoveryMessage ?? 'Restore the newest IndexedDB checkpoint.'}</span>
            </div>
            {recoveryDrafts.length > 0 && (
              <button type="button" onClick={() => void recoverLatestDraft()}>Recover latest</button>
            )}
          </div>
        )}

        {session === 'review' ? (
          <section className={styles.reviewWorkspace}>
            <div className={styles.reviewHero}>
              <div className={styles.reviewIcon}><Icon name="check" /></div>
              <div>
                <span className={styles.reviewEyebrow}>Recording complete</span>
                <h2>Your recording is ready to review</h2>
                <p>{formatDuration(elapsed)} captured in {resolution} at 30 FPS.</p>
              </div>
            </div>
            <div className={styles.reviewPreview}>
              {activeRecording?.previewUrl ? (
                <video
                  className={styles.reviewVideo}
                  src={activeRecording.previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : (
                <><div><Icon name="play" /></div><strong>Preparing preview…</strong></>
              )}
            </div>
            {activeRecording?.assets?.audio?.blob && (
              <RecordedAudioWaveforms
                durationSeconds={activeRecording.durationSeconds}
                mixed={activeRecording.assets.audio}
                microphone={activeRecording.assets['microphone-audio']}
                systemAudio={activeRecording.assets['system-audio']}
              />
            )}
            {activeRecording?.assets?.cursor?.blob && (
              <RecordedCursorTrajectory blob={activeRecording.assets.cursor.blob} />
            )}
            {activeRecording?.assets && (
              <div className={styles.sourceAssets}>
                <div>
                  <span>Separate source files</span>
                  <strong>Ready for editing</strong>
                </div>
                {SOURCE_DOWNLOAD_KINDS.map((kind) => {
                  const asset = activeRecording.assets?.[kind];
                  if (!asset?.blob) return null;
                  return (
                    <button key={kind} type="button" onClick={() => downloadRecordingAsset(kind)}>
                      <Icon name={kind.includes('audio') ? 'mic' : kind === 'webcam' ? 'camera' : 'screen'} />
                      <span><strong>{recordingAssetLabel(kind)}</strong><small>{asset.mimeType.split(';')[0]}</small></span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className={styles.reviewActions}>
              <div className={styles.reviewStatus} aria-live="polite">
                {uploadState === 'uploading' && <progress max="100" value={uploadProgress} />}
                <span>{uploadMessage || 'This recording is available locally until you upload it.'}</span>
              </div>
              <button className={styles.reviewSecondary} onClick={resetReview}>Record another</button>
              <button className={styles.reviewSecondary} onClick={() => downloadRecordingAsset('composite')}>Download composite</button>
              {cloudRecording ? (
                <button className={styles.reviewPrimary} onClick={() => void publishAndCopyLink()}>
                  {cloudRecording.is_public ? 'Copy public link' : 'Make public & copy link'}
                </button>
              ) : (
                <button
                  className={styles.reviewPrimary}
                  onClick={() => void uploadRecording()}
                  disabled={uploadState === 'uploading' || uploadState === 'saving'}
                >
                  {uploadState === 'uploading' ? `Uploading ${uploadProgress}%` : uploadState === 'saving' ? 'Saving metadata…' : 'Upload to cloud'}
                </button>
              )}
            </div>
          </section>
        ) : (
        <div className={`${styles.studioGrid} ${!sourcesOpen ? styles.sourcesClosed : ''} ${!effectsOpen ? styles.effectsClosed : ''}`}>
          {sourcesOpen && <aside className={styles.leftPanel}>
            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <div><span>01</span><h2>Capture mode</h2></div>
                <span className={styles.readyLabel}>Ready</span>
              </div>
              <div className={styles.modeList}>
                {modes.map((item) => (
                  <button
                    key={item.value}
                    className={`${styles.modeButton} ${mode === item.value ? styles.modeButtonActive : ''}`}
                    onClick={() => {
                      setMode(item.value);
                      if (item.value === 'screen-only' && effectsTab === 'camera') setEffectsTab('audio');
                    }}
                    aria-pressed={mode === item.value}
                  >
                    <span className={styles.modeIcon}><Icon name={item.value === 'webcam-only' ? 'camera' : 'screen'} /></span>
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    <span className={styles.radioMark} />
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <div><span>02</span><h2>Sources</h2></div>
              </div>
              <label className={styles.fieldLabel}>
                Camera
                <select value={selectedCameraId} onChange={(event) => setSelectedCameraId(event.target.value)}>
                  <option value="">Default camera</option>
                  {cameras.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldLabel}>
                Microphone
                <select value={selectedMicrophoneId} onChange={(event) => setSelectedMicrophoneId(event.target.value)}>
                  <option value="">Default microphone</option>
                  {microphones.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>
                  ))}
                </select>
              </label>
              <div className={styles.sourceActions}>
                <button className={styles.sourceButton} type="button" onClick={connectSources} disabled={isConnectingSources}>
                  {isConnectingSources ? 'Requesting access…' : sourcesConnected ? 'Update sources' : 'Connect sources'}
                </button>
                {sourcesConnected && <button className={styles.sourceStopButton} type="button" onClick={stopAllMedia}>Disconnect</button>}
              </div>
              <div className={styles.sourceStatus}>
                <StatusDot ok={mediaStatuses.camera === 'ready' || mediaStatuses.screen === 'ready'} />
                <span>Screen {mediaStatuses.screen} · camera {mediaStatuses.camera} · mic {mediaStatuses.microphone}</span>
              </div>
              {screenStream && <div className={styles.sourceStatus}><StatusDot ok={hasSystemAudio} /><span>{hasSystemAudio ? 'System audio shared' : 'No system audio in this share'}</span></div>}
              {tabCapture.connected && tabCapture.target && (
                <div className={styles.sourceStatus}>
                  <StatusDot ok />
                  <span>Tab: {tabCapture.target.title}</span>
                </div>
              )}
              {!tabCapture.available && legacyCursorTrajectory.available && (
                <label className={styles.fieldLabel}>
                  Legacy cursor display
                  <select value={legacyCursorTrajectory.selectedDisplayId} onChange={(event) => legacyCursorTrajectory.setSelectedDisplayId(event.target.value)}>
                    {legacyCursorTrajectory.displays.map((display) => (
                      <option key={display.id} value={display.id}>{display.label}{display.primary ? ' (Primary)' : ''}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className={styles.sourceStatus}>
                <StatusDot ok={tabCapture.connected || (!tabCapture.available && legacyCursorTrajectory.available)} />
                <span>{tabCapture.available ? tabCapture.message : legacyCursorTrajectory.message}</span>
              </div>
              {mode !== 'webcam-only' && !screenStream && (
                <p className={styles.sourceError}>
                  Open the tab you want to record and click the RecordWeb extension once. That tab will provide screen video, system audio, and cursor tracking.
                </p>
              )}
              {mediaError && <p className={styles.sourceError} role="alert">{mediaError.message}</p>}
            </section>

            <section className={styles.panelSection}>
              <div className={styles.sectionHeading}>
                <div><span>03</span><h2>Output</h2></div>
              </div>
              <div className={styles.segmented}>
                {['1280x720', '1920x1080'].map((value) => (
                  <button key={value} onClick={() => setResolution(value)} className={resolution === value ? styles.segmentActive : ''}>
                    {value === '1920x1080' ? '1080p' : '720p'}
                  </button>
                ))}
              </div>
              <div className={styles.outputMeta}>
                <span>30 FPS</span><span>16:9</span><span>30 min max</span>
              </div>
            </section>
          </aside>}

          <section className={styles.stageColumn}>
            <div className={styles.stageToolbar}>
              <div className={styles.stageMode}><StatusDot ok={session === 'recording'} /> {sessionLabel}</div>
              <div className={styles.stageTags}><span>{activeMode.label}</span><span>{resolution}</span><span>{compositorRunning ? `${compositorFps || '—'} FPS` : '30 FPS target'}</span></div>
            </div>

            <div className={`${styles.stage} ${session === 'recording' ? styles.stageRecording : ''}`}>
              {visualSourcesConnected ? (
                <canvas
                  ref={canvasRef}
                  className={styles.compositorCanvas}
                  width={compositorResolution.width}
                  height={compositorResolution.height}
                  tabIndex={0}
                  aria-label="Composite recording preview. Drag the camera overlay or use arrow keys to reposition it."
                  {...canvasPointerHandlers}
                />
              ) : (
                <div className={styles.screenMock}>
                  <div className={styles.mockTop}><i /><i /><i /><span>recordweb.app / presentation</span></div>
                  <div className={styles.mockContent}>
                    <span className={styles.mockKicker}>YOUR SCREEN APPEARS HERE</span>
                    <strong>Ready when you are.</strong>
                    <p>Choose your sources, run the preflight check, then start a UI flow test.</p>
                    <div className={styles.mockLines}><i /><i /><i /></div>
                  </div>
                </div>
              )}

              {!visualSourcesConnected && mode !== 'screen-only' && cameraVisible && (
                <div className={`${styles.cameraMock} ${styles[`camera${pipShape}`]}`}>
                  <div className={styles.avatarShape}><span>RW</span></div>
                  <div><strong>Camera preview</strong><small>{background}</small></div>
                </div>
              )}

              {session === 'countdown' && countdown !== null && <div className={styles.countdownOverlay}><span>{countdown}</span><small>Get ready</small></div>}

              <div className={styles.stageCorner}>Preview · {activeMode.detail}{compositeStream ? ' · composite stream ready' : ''}</div>
            </div>

            {session !== 'processing' && (
              <AudioMeterPanel
                key={session === 'setup' ? 'setup-meters' : 'recording-meters'}
                compact={session !== 'setup'}
                state={audioState}
                onResume={() => void resumeAudio()}
                microphone={{
                  level: microphoneLevel,
                  levelDb: microphoneLevelDb,
                  available: Boolean(microphoneStream),
                }}
                systemAudio={{
                  level: systemAudioLevel,
                  levelDb: systemAudioLevelDb,
                  available: hasSystemAudio,
                }}
              />
            )}

            <div className={styles.controlDock} aria-label="Recording controls">
              <div className={styles.timerBlock}>
                <span className={session === 'recording' ? styles.recDot : styles.idleDot} />
                <div><strong>{formatDuration(elapsed)}</strong><small>/ 30:00</small></div>
              </div>
              <div className={styles.controlDivider} />
              {session === 'setup' ? (
                <button className={styles.recordButton} onClick={() => void startUiTest()}><Icon name="record" /> Start recording</button>
              ) : (
                <>
                  <button
                    className={styles.roundControl}
                    onClick={session === 'paused' ? resumeRecording : pauseRecording}
                    disabled={session === 'countdown' || session === 'processing'}
                    aria-label={session === 'paused' ? 'Resume' : 'Pause'}
                  >
                    <Icon name={session === 'paused' ? 'play' : 'pause'} />
                  </button>
                  <button className={styles.stopControl} onClick={stopRecording} disabled={session === 'countdown' || session === 'processing'} aria-label="Stop">
                    <Icon name="stop" />
                  </button>
                </>
              )}
              <div className={styles.controlDivider} />
              <button className={`${styles.roundControl} ${micMuted ? styles.controlOff : ''}`} onClick={() => setMicMuted((value) => !value)} aria-label="Toggle microphone"><Icon name="mic" /></button>
              <button className={`${styles.roundControl} ${!cameraVisible ? styles.controlOff : ''}`} onClick={() => setCameraVisible((value) => !value)} aria-label="Toggle camera"><Icon name="camera" /></button>
            </div>
            <div className={styles.shortcutHint}>Space pause/resume · Alt+S finish · video is checkpointed to IndexedDB</div>
          </section>

          {effectsOpen && <aside className={styles.rightPanel}>
            <div className={styles.effectTabs} role="tablist" aria-label="Effect controls">
              {(['camera', 'audio', 'preset'] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={effectsTab === tab}
                  className={effectsTab === tab ? styles.effectTabActive : ''}
                  onClick={() => setEffectsTab(tab)}
                  disabled={tab === 'camera' && mode === 'screen-only'}
                >
                  {tab}
                </button>
              ))}
            </div>
            {effectsTab === 'camera' && <section className={styles.inspectorSection}>
              <div className={styles.inspectorTitle}><div><Icon name="spark" /><h2>Camera style</h2></div><span>Live</span></div>
              <label className={styles.fieldLabel}>Background</label>
              <div className={styles.choiceGrid}>
                {backgrounds.map((item) => (
                  <button key={item.value} className={background === item.value ? styles.choiceActive : ''} onClick={() => setBackground(item.value)}>
                    <span className={`${styles.choicePreview} ${styles[`preview${item.value}`]}`} />
                    {item.label}
                  </button>
                ))}
              </div>
              <label className={styles.fieldLabel}>Frame</label>
              <div className={styles.segmented}>
                {(['circle', 'rounded', 'cutout'] as PipShape[]).map((shape) => (
                  <button key={shape} onClick={() => setPipShape(shape)} className={pipShape === shape ? styles.segmentActive : ''}>{shape}</button>
                ))}
              </div>
              <label className={styles.fieldLabel}>Position</label>
              <div className={styles.positionGrid}>
                {([
                  ['top-left', '↖'],
                  ['top-right', '↗'],
                  ['bottom-left', '↙'],
                  ['bottom-right', '↘'],
                ] as const).map(([position, label]) => (
                  <button
                    key={position}
                    onClick={() => setPipPosition(position)}
                    className={pipPosition === position ? styles.positionActive : ''}
                    aria-label={`Move camera to ${position.replace('-', ' ')}`}
                    title={`Move camera to ${position.replace('-', ' ')}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {compositorRunning && <p className={styles.compositorHint}>Drag the camera on the canvas, or focus it and use arrow keys. Hold Shift for larger steps.</p>}
              {compositorWarning && <p className={styles.compositorWarning}>{compositorWarning}</p>}
              {background !== 'original' && (
                <p className={segmentationError ? styles.compositorWarning : styles.compositorHint}>
                  AI background: {segmentationError ?? (segmentationState === 'running' ? `${inferenceFps || '—'} inference FPS` : segmentationState)}
                </p>
              )}
              <label className={styles.fieldLabel}>Size</label>
              <div className={styles.segmented}>
                {(['small', 'medium', 'large'] as PipSize[]).map((size) => (
                  <button key={size} onClick={() => setPipSize(size)} className={pipSize === size ? styles.segmentActive : ''}>{size[0].toUpperCase()}</button>
                ))}
              </div>
            </section>}

            {effectsTab === 'audio' && <section className={styles.inspectorSection}>
              <div className={styles.inspectorTitle}><div><Icon name="mic" /><h2>Voice</h2></div><span>{audioState === 'running' ? 'Live' : 'DSP'}</span></div>
              <div className={styles.audioModes}>
                {audioModes.map((item) => (
                  <button key={item} onClick={() => setAudioMode(item)} className={audioMode === item ? styles.audioModeActive : ''}>
                    <span>{item}</span>{audioMode === item && <Icon name="check" />}
                  </button>
                ))}
              </div>
              {audioMode === 'Custom' && (
                <div className={styles.filterToggles}>
                  {([
                    ['highPassEnabled', '80 Hz rumble cut'],
                    ['vocalBoostEnabled', '2.8 kHz presence'],
                    ['lowPassEnabled', '12 kHz hiss cut'],
                    ['compressorEnabled', 'Compressor'],
                    ['noiseGateEnabled', 'Noise gate'],
                  ] as Array<[keyof AudioFilterConfig, string]>).map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={Boolean(customAudioConfig[key])}
                        onChange={(event) => setCustomAudioConfig((current) => ({ ...current, [key]: event.target.checked }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className={styles.audioControls}>
                <label>
                  <span>Mic gain</span><small>{Math.round(micGain * 100)}%</small>
                  <input type="range" min="0" max="2" step="0.05" value={micGain} onChange={(event) => setMicGain(Number(event.target.value))} />
                </label>
                <label>
                  <span>System audio</span><small>{hasSystemAudio ? `${Math.round(systemVolume * 100)}%` : 'Unavailable'}</small>
                  <input type="range" min="0" max="2" step="0.05" value={systemVolume} onChange={(event) => setSystemVolume(Number(event.target.value))} disabled={!hasSystemAudio} />
                </label>
              </div>
              {mixedAudioStream && <p className={styles.audioReady}>Mixed audio track ready for recording</p>}
              {audioError && <p className={styles.sourceError} role="alert">{audioError}</p>}
            </section>}

            {effectsTab === 'preset' && <section className={styles.inspectorSection}>
              <div className={styles.inspectorTitle}><div><Icon name="cloud" /><h2>Preset test</h2></div><span>{presets.length}</span></div>
              <input className={styles.textInput} value={presetName} onChange={(event) => setPresetName(event.target.value)} aria-label="Preset name" />
              <button className={styles.savePresetButton} onClick={savePreset}>Save current setup</button>
              {presetMessage && <p className={styles.inlineMessage} aria-live="polite">{presetMessage}</p>}
              <div className={styles.presetList}>
                {presets.slice(0, 3).map((preset) => (
                  <button key={preset.id} onClick={() => applyPreset(preset)}><span>{preset.preset_name}</span><small>Load</small></button>
                ))}
              </div>
            </section>}
          </aside>}
        </div>
        )}

        {diagnosticsOpen && (
          <div className={styles.drawerBackdrop} role="presentation" onMouseDown={() => setDiagnosticsOpen(false)}>
            <aside className={styles.diagnosticsDrawer} role="dialog" aria-modal="true" aria-labelledby="diagnostics-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className={styles.diagnosticsHeader}>
                <div><span>Preflight</span><h2 id="diagnostics-title">System diagnostics</h2><p>Confirm browser and cloud readiness before recording.</p></div>
                <button onClick={() => setDiagnosticsOpen(false)} aria-label="Close diagnostics">×</button>
              </div>
              <div className={styles.diagnosticsList}>
                <div><StatusDot ok={health?.auth === 'authenticated'} /><span>Clerk session</span><strong>{health?.auth === 'authenticated' ? 'Connected' : 'Not checked'}</strong></div>
                <div><StatusDot ok={health?.database === 'connected'} /><span>Neon database</span><strong>{health?.database ?? 'Not checked'}</strong></div>
                <div><StatusDot ok={health?.blob === 'configured'} /><span>Vercel Blob</span><strong>{health?.blob ?? 'Not checked'}</strong></div>
                <div><StatusDot ok={Boolean(capabilities?.screenCapture)} /><span>Screen capture</span><strong>{capabilities ? (capabilities.screenCapture ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
                <div><StatusDot ok={Boolean(capabilities?.cameraAndMic)} /><span>Camera and microphone</span><strong>{capabilities ? (capabilities.cameraAndMic ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
                <div><StatusDot ok={Boolean(capabilities?.mediaRecorder)} /><span>MediaRecorder</span><strong>{capabilities ? (capabilities.mediaRecorder ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
                <div><StatusDot ok={Boolean(capabilities?.indexedDb)} /><span>Local recovery</span><strong>{capabilities ? (capabilities.indexedDb ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
                <div><StatusDot ok={Boolean(capabilities?.fileSystemSave)} /><span>Direct file save</span><strong>{capabilities ? (capabilities.fileSystemSave ? 'Supported' : 'Download fallback') : 'Not checked'}</strong></div>
              </div>
              <button className={styles.diagnosticsRefresh} onClick={runSystemCheck} disabled={healthState === 'checking'}>
                <Icon name="refresh" /> {healthState === 'checking' ? 'Checking…' : 'Run checks again'}
              </button>
            </aside>
          </div>
        )}

        <div className={styles.srOnly} aria-live="polite">Session status: {sessionLabel}</div>
      </section>
    </main>
  );
}
