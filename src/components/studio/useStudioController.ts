'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMediaSession } from '@/components/media/MediaSessionProvider';
import { useAudioDSP } from '@/hooks/useAudioDSP';
import { useCanvasCompositor } from '@/hooks/useCanvasCompositor';
import { useCursorTrajectory } from '@/hooks/useCursorTrajectory';
import { useNormalizedVideoStream } from '@/hooks/useNormalizedVideoStream';
import { usePresentationDeck } from '@/hooks/usePresentationDeck';
import { usePresentationRecordingSource } from '@/hooks/usePresentationRecordingSource';
import { useRecordingSession } from '@/hooks/useRecordingSession';
import { useVisionSegmentation } from '@/hooks/useVisionSegmentation';
import { decodeRecordedWaveform } from '@/lib/audioWaveform';
import { waitForCaptureHandle } from '@/lib/captureHandle';
import { repairWebmDuration } from '@/lib/ebmlPatcher';
import {
  deleteRecordingDraft,
  getRecordingDraft,
  getRecordingDraftSummaries,
  saveLocalRecording,
  type RecordingDraftSummary,
} from '@/lib/idb';
import {
  downloadRecordingArchive,
  RECORDING_ARCHIVE_KINDS,
} from '@/lib/recordingArchive';
import { getRecordingTitleError, normalizeRecordingTitle } from '@/lib/recordingTitle';
import { getRecordingLeaveWarning } from './recordingLeaveWarning';
import { createRecordingUploadJob, type RecordingUploadJob } from '@/lib/recordingUploadClient';
import type { DbRecording, DbStudioPreset } from '@/types/database';
import type {
  AudioFilterConfig,
  BackgroundRemovalMode,
  PipShape,
  PipSize,
  RecordingMode,
} from '@/types/media';
import type { RecordingAssetKind, RecordingAssetMetadata, RecordingMetadata } from '@/types/recording';
import {
  RECORDWEB_PRESENTATION_COMMAND_EVENT,
  type ExtensionPresentationCommand,
} from '@/types/tabCaptureExtension';
import {
  audioModes,
  audioPresetByLabel,
  compositeAssetFor,
  MEDIA_ASSET_KINDS,
  modes,
  type BrowserCapabilities,
  type CheckState,
  type EffectsTab,
  type HealthResponse,
  type SessionState,
  type Theme,
  type UploadState,
} from './studioConfig';

export type StudioWorkspaceKind = 'studio' | 'presentation';

interface UseStudioControllerOptions {
  workspace?: StudioWorkspaceKind;
}

const RECORDING_RESOLUTION = '1920x1080';
const COMPOSITOR_RESOLUTION = { width: 1920, height: 1080 } as const;

export function useStudioController({ workspace = 'studio' }: UseStudioControllerOptions = {}) {
  const { userId: ownerUserId } = useAuth();
  const presentationWorkspace = workspace === 'presentation';
  const [mode, setMode] = useState<RecordingMode>('screen-pip');
  const [background, setBackground] = useState<BackgroundRemovalMode>('original');
  const [pipShape, setPipShape] = useState<PipShape>('rounded');
  const [pipSize, setPipSize] = useState<PipSize>('medium');
  const [audioMode, setAudioMode] = useState('Voice clarity');
  const [countdown, setCountdown] = useState<number | null>(null);
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
  const [effectsTab, setEffectsTab] = useState<EffectsTab>(workspace === 'presentation' ? 'audio' : 'camera');
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('');
  const [isConnectingSources, setIsConnectingSources] = useState(false);
  const [isConnectingSlideSource, setIsConnectingSlideSource] = useState(false);
  const [sourceCaptureEnabled, setSourceCaptureEnabled] = useState(false);
  const [recoveredRecording, setRecoveredRecording] = useState<RecordingMetadata | null>(null);
  const [recoveryDrafts, setRecoveryDrafts] = useState<RecordingDraftSummary[]>([]);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState('');
  const [cloudRecording, setCloudRecording] = useState<DbRecording | null>(null);
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState('');
  const recoveredPreviewUrlRef = useRef<string | null>(null);
  const recoveredDraftIdRef = useRef<string | null>(null);
  const uploadStartedForRef = useRef<string | null>(null);
  const uploadJobRef = useRef<RecordingUploadJob | null>(null);
  const requestedRecoveryRef = useRef<string | null>(null);
  const endSessionRequestedRef = useRef(false);
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
  const [presentationElement, setPresentationElement] = useState<HTMLElement | null>(null);
  const [startRecordingAttention, setStartRecordingAttention] = useState(0);

  const {
    screenStream,
    cameraStream,
    microphoneStream,
    systemAudioStream,
    cameras,
    microphones,
    statuses: mediaStatuses,
    error: mediaError,
    acquireScreen,
    acquireCamera,
    acquireMicrophone,
    stopAll: stopAllMedia,
    stopScreen,
    stopCamera,
    clearError: clearMediaError,
    tabCapture,
    micMuted,
    setMicMuted,
    cameraVisible,
    setCameraVisible,
  } = useMediaSession();
  const tabCaptureConnected = tabCapture.connected;
  const focusRecordWebApp = tabCapture.focusApp;
  const focusTabCaptureTarget = tabCapture.focusTarget;

  const presentationDeck = usePresentationDeck();
  const presentationSource = usePresentationRecordingSource({
    presentationElement,
    presentationTitle: presentationDeck.metadata?.name,
  });
  const {
    capture: presentationCapture,
    stop: stopPresentationCapture,
    videoStream: presentationVideoStream,
    presentationAudioStream,
    cursorController: presentationCursorController,
  } = presentationSource;
  const activeSystemAudioStream = presentationWorkspace ? presentationAudioStream : systemAudioStream;
  const hasActiveSystemAudio = Boolean(activeSystemAudioStream?.getAudioTracks().length);

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
    systemAudioStream: activeSystemAudioStream,
    preset: audioPresetByLabel[audioMode] ?? 'voice-clarity',
    muted: micMuted,
    micGain,
    systemGain: systemVolume,
    monitorSystemAudio: false,
    customConfig: customAudioConfig,
  });

  const {
    effectCanvas,
    state: segmentationState,
    error: segmentationError,
    inferenceFps,
  } = useVisionSegmentation(
    presentationWorkspace || presentationCapture || mode === 'screen-only' || !cameraVisible ? null : cameraStream,
    background,
  );

  const compositorResolution = COMPOSITOR_RESOLUTION;
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
    screenStream: presentationWorkspace || presentationCapture ? null : screenStream,
    cameraStream: presentationWorkspace || presentationCapture ? null : cameraStream,
    mode,
    resolution: compositorResolution,
    pipShape,
    pipSize,
    cameraVisible,
    cameraEffectCanvas: segmentationState === 'running' ? effectCanvas : null,
  });

  const normalizedWebcamStream = useNormalizedVideoStream(cameraStream, 1280, 720, sourceCaptureEnabled);
  const normalizedScreenStream = useNormalizedVideoStream(
    presentationWorkspace || presentationCapture ? null : screenStream,
    1920,
    1080,
    sourceCaptureEnabled,
  );
  const legacyCursorTrajectory = useCursorTrajectory(presentationWorkspace ? null : screenStream);
  const cursorCapture = presentationCapture
    ? presentationCursorController
    : mode !== 'webcam-only' && tabCapture.connected
      ? tabCapture.cursorController
      : legacyCursorTrajectory.controller;
  const recordingVideoStream = presentationVideoStream ?? compositeStream;

  const {
    status: recordingStatus,
    elapsedMs,
    warning: recordingWarning,
    error: recordingError,
    recording: completedRecording,
    start: startRecording,
    stop: stopRecording,
    saveTitle: saveCompletedRecordingTitle,
    reset: resetRecording,
  } = useRecordingSession({
    ownerUserId: ownerUserId ?? undefined,
    videoStream: recordingVideoStream,
    webcamStream: normalizedWebcamStream,
    screenStream: presentationWorkspace || presentationCapture ? null : normalizedScreenStream,
    audioStream: mixedAudioStream,
    microphoneAudioStream: microphoneOutputStream,
    systemAudioStream: systemAudioOutputStream,
    resolution: RECORDING_RESOLUTION,
    fps: 30,
    cursorCapture,
  });

  const activeRecording = completedRecording ?? recoveredRecording;
  const titleRequired = Boolean(activeRecording && !activeRecording.title);
  const session: SessionState = countdown !== null
    ? 'countdown'
    : activeRecording
      ? 'review'
      : recordingStatus === 'recording' || recordingStatus === 'paused' || recordingStatus === 'processing'
        ? recordingStatus
        : 'setup';
  const elapsed = activeRecording?.durationSeconds ?? elapsedMs / 1000;
  const leaveWarning = getRecordingLeaveWarning({ session, uploadState, titleRequired, titleSaving });
  const activeMode = useMemo(() => modes.find((item) => item.value === mode) ?? modes[0], [mode]);
  const sourcesConnected = Boolean(
    screenStream
    || cameraStream
    || microphoneStream
    || presentationCapture
    || (workspace === 'presentation' && presentationDeck.status === 'ready'),
  );
  const visualSourcesConnected = Boolean(screenStream || cameraStream);
  const requiredDevicesConnected = mediaStatuses.microphone === 'ready'
    && (mode === 'screen-only' || mediaStatuses.camera === 'ready');
  const recordingReady = requiredDevicesConnected && (mode === 'webcam-only' || Boolean(
    screenStream?.getVideoTracks().some((track) => track.readyState === 'live') && tabCapture.connected,
  ));

  useEffect(() => {
    if (recordingStatus !== 'ready' && recordingStatus !== 'error') return;
    const releaseSourceCanvases = window.setTimeout(() => setSourceCaptureEnabled(false), 0);
    if (endSessionRequestedRef.current) {
      endSessionRequestedRef.current = false;
      stopAllMedia();
    } else if (presentationCapture) stopPresentationCapture();
    else if (!presentationWorkspace) stopScreen();
    return () => window.clearTimeout(releaseSourceCanvases);
  }, [presentationCapture, presentationWorkspace, recordingStatus, stopAllMedia, stopPresentationCapture, stopScreen]);

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
      setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
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
          // Standard Studio now exposes only the original camera feed.
          setBackground('original');
          if (configuration.audioMode && audioModes.includes(configuration.audioMode)) setAudioMode(configuration.audioMode);
          localStorage.removeItem('recordweb-quick-start');
        }

        const pendingPreset = localStorage.getItem('recordweb-pending-preset');
        if (pendingPreset) {
          const preset = JSON.parse(pendingPreset) as DbStudioPreset;
          setPipShape(preset.pip_shape === 'cutout' ? 'circle' : preset.pip_shape as PipShape);
          setPipSize(preset.pip_size as PipSize);
          setBackground('original');
          const filters = preset.filters_config as { mode?: string };
          if (filters.mode) setAudioMode(filters.mode);
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
      if (!ownerUserId) return;
      void getRecordingDraftSummaries(ownerUserId)
        .then(setRecoveryDrafts)
        .catch((error) => setRecoveryMessage(`Could not inspect recovery data: ${(error as Error).message}`))
        .finally(() => setRecoveryLoaded(true));
    }, 0);
    return () => window.clearTimeout(loadDrafts);
  }, [ownerUserId]);

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
    setRecoveryMessage('');
    try {
      if (workspace === 'presentation' || mode === 'webcam-only') stopScreen();

      if (mode === 'screen-only') stopCamera();
      else await acquireCamera(selectedCameraId || undefined);

      await acquireMicrophone(selectedMicrophoneId || undefined);
      if (workspace === 'presentation') setSourcesOpen(false);
    } finally {
      setIsConnectingSources(false);
    }
  };

  const connectSlideSource = async () => {
    if (workspace !== 'studio' || mode === 'webcam-only') return;
    if (!requiredDevicesConnected) {
      setRecoveryMessage(mode === 'screen-only'
        ? 'Connect the microphone before connecting Google Slides.'
        : 'Connect the camera and microphone before connecting Google Slides.');
      setSourcesOpen(true);
      return;
    }

    setIsConnectingSlideSource(true);
    clearMediaError();
    setRecoveryMessage('');
    try {
      if (!tabCapture.available) {
        setRecoveryMessage('Install or enable the RecordWeb extension, then reload this page.');
        setSourcesOpen(true);
        return;
      }

      void resumeAudio();
      // Do not await extension work here. getDisplayMedia() must remain in the
      // original Connect click's transient user-activation chain.
      tabCapture.prepareCaptureHandles();
      const capture = await acquireScreen();
      const videoTrack = capture?.getVideoTracks()[0];
      if (!capture || !videoTrack) {
        setRecoveryMessage('Chrome could not open tab sharing. Open your presentation, then click Connect Google Slides and choose its tab.');
        setSourcesOpen(true);
        return;
      }
      const displaySurface = videoTrack.getSettings().displaySurface;
      if (displaySurface && displaySurface !== 'browser') {
        stopScreen();
        setRecoveryMessage('Choose a Google Slides browser tab, not a window or an entire screen.');
        setSourcesOpen(true);
        return;
      }

      const captureHandle = await waitForCaptureHandle(videoTrack);
      if (!captureHandle) {
        stopScreen();
        setRecoveryMessage('RecordWeb could not verify the shared tab. Choose an open Google Slides tab in Chrome and click Share.');
        setSourcesOpen(true);
        return;
      }
      const selectedTarget = await tabCapture.resolveCaptureTarget(captureHandle);
      if (!selectedTarget) {
        stopScreen();
        setRecoveryMessage('The selected source is not a trackable Google Slides tab. Reload that Slides tab, then connect it again.');
        setSourcesOpen(true);
        return;
      }
      focusRecordWebApp();
    } finally {
      setIsConnectingSlideSource(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && diagnosticsOpen) {
        setDiagnosticsOpen(false);
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;

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
  }, [diagnosticsOpen, session, setCameraVisible, setMicMuted, stopRecording]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        if (!presentationWorkspace && tabCaptureConnected) focusTabCaptureTarget();
        void startRecording();
      } else {
        setCountdown((value) => value === null ? null : value - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, focusTabCaptureTarget, presentationWorkspace, startRecording, tabCaptureConnected]);

  useEffect(() => {
    if (!startRecordingAttention) return;
    const timer = window.setTimeout(() => setStartRecordingAttention(0), 6000);
    return () => window.clearTimeout(timer);
  }, [startRecordingAttention]);

  const startUiTest = useCallback(async () => {
    let presentationCaptureStarted = false;
    if (workspace === 'presentation') {
      if (presentationDeck.status !== 'ready' || !presentationDeck.metadata) {
        setRecoveryMessage('Upload a PDF or PPTX presentation before recording.');
        return;
      }
      if (!presentationElement) {
        setRecoveryMessage('The presentation area is not ready yet. Please try again.');
        return;
      }
      const capture = await presentationSource.start(presentationElement);
      if (!capture?.videoStream.getVideoTracks().length) {
        setRecoveryMessage('Current-tab capture did not start. Select “This Tab” in the browser picker.');
        return;
      }
      presentationCaptureStarted = true;
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
      });
    }

    if (workspace !== 'presentation' && mode !== 'webcam-only') {
      if (!tabCapture.available) {
        setRecoveryMessage('Install or enable the RecordWeb extension, then reload this page.');
        setSourcesOpen(true);
        return;
      }
      if (!tabCapture.connected) {
        setRecoveryMessage('Connect the required devices, then connect Google Slides and wait for cursor tracking to become ready.');
        setSourcesOpen(true);
        return;
      }
      if (!screenStream?.getVideoTracks().length) {
        setRecoveryMessage('Click Connect Google Slides and choose your open presentation tab before starting the recording.');
        setSourcesOpen(true);
        return;
      }
    }

    if (!recordingVideoStream?.getVideoTracks().length && !presentationCaptureStarted) {
      if (workspace !== 'presentation') {
        setRecoveryMessage('Connect a screen, camera, or presentation source before recording.');
        setSourcesOpen(true);
      }
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
    if (!presentationWorkspace && tabCaptureConnected) focusRecordWebApp();
    setCountdown(3);
    setSourcesOpen(false);
    setEffectsOpen(false);
  }, [
    focusRecordWebApp,
    mode,
    presentationDeck.metadata,
    presentationDeck.status,
    presentationElement,
    presentationSource,
    presentationWorkspace,
    recordingVideoStream,
    resetRecording,
    resumeAudio,
    screenStream,
    tabCapture.available,
    tabCapture.connected,
    tabCaptureConnected,
    workspace,
  ]);

  useEffect(() => {
    const handlePresentationCommand = (event: Event) => {
      const command = (event as CustomEvent<ExtensionPresentationCommand>).detail;
      if (command === 'start' && workspace === 'studio' && session === 'setup') {
        void startUiTest();
      }
      if (command === 'return-to-start' && workspace === 'studio' && session === 'setup') {
        setStartRecordingAttention((value) => value + 1);
      }
      if (command === 'stop' && (session === 'recording' || session === 'paused')) stopRecording();
      if (command === 'end-session' && (session === 'recording' || session === 'paused')) {
        endSessionRequestedRef.current = true;
        stopRecording();
      }
      if (command === 'toggle-microphone') setMicMuted((value) => !value);
      if (command === 'toggle-camera') setCameraVisible((value) => !value);
    };
    window.addEventListener(RECORDWEB_PRESENTATION_COMMAND_EVENT, handlePresentationCommand);
    return () => {
      window.removeEventListener(RECORDWEB_PRESENTATION_COMMAND_EVENT, handlePresentationCommand);
    };
  }, [session, setCameraVisible, setMicMuted, startUiTest, stopRecording, workspace]);

  const recoverLatestDraft = useCallback(async (requestedId?: string) => {
    const id = requestedId ?? recoveryDrafts[0]?.id;
    if (!id || !ownerUserId) return;
    setRecoveryMessage('Recovering the latest recording…');
    try {
      const consumeRecoveryRequest = () => {
        const url = new URL(window.location.href);
        if (url.searchParams.get('recover') !== id) return;
        url.searchParams.delete('recover');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      };
      const draft = await getRecordingDraft(id);
      if (!draft || (draft.ownerUserId && draft.ownerUserId !== ownerUserId)) throw new Error('Không tìm thấy bản sao lưu của tài khoản này.');
      if (draft.recording?.blob) {
        if (recoveredPreviewUrlRef.current) URL.revokeObjectURL(recoveredPreviewUrlRef.current);
        const previewUrl = URL.createObjectURL(draft.recording.blob);
        recoveredPreviewUrlRef.current = previewUrl;
        recoveredDraftIdRef.current = draft.id;
        setRecoveredRecording({ ...draft.recording, previewUrl });
        consumeRecoveryRequest();
        setRecoveryDrafts((current) => current.filter((item) => item.id !== draft.id));
        setTitleError('');
        setRecoveryMessage('Đã phục hồi đầy đủ bản ghi. Đang lưu trữ lại…');
        return;
      }
      const draftAssets = draft.assets ?? (draft.chunks?.length ? {
        composite: {
          mimeType: draft.mimeType || 'video/webm',
          chunks: draft.chunks,
          resolution: RECORDING_RESOLUTION,
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
        title: '',
        durationSeconds: draft.durationMs / 1000,
        fileSizeBytes: composite.fileSizeBytes,
        resolution: composite.resolution ?? RECORDING_RESOLUTION,
        fps: composite.fps ?? 30,
        mimeType: composite.mimeType,
        createdAt: draft.startedAt,
        blob: composite.blob,
        previewUrl,
        assets,
      };
      recoveredDraftIdRef.current = draft.id;
      setRecoveredRecording(recording);
      consumeRecoveryRequest();
      setRecoveryDrafts((current) => current.filter((item) => item.id !== draft.id));
      setTitleError('');
      setRecoveryMessage('Recovery complete. Your recording is being saved.');
    } catch (error) {
      setRecoveryMessage(`Recovery failed: ${(error as Error).message}`);
    }
  }, [ownerUserId, recoveryDrafts]);

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get('recover');
    if (!requestedId || requestedRecoveryRef.current === requestedId || !recoveryLoaded) return;
    const restore = window.setTimeout(() => {
      requestedRecoveryRef.current = requestedId;
      if (!recoveryDrafts.some((draft) => draft.id === requestedId)) {
        setRecoveryMessage('Không tìm thấy bản sao lưu được chọn.');
        return;
      }
      void recoverLatestDraft(requestedId);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [recoverLatestDraft, recoveryDrafts, recoveryLoaded]);

  const cancelPendingUpload = useCallback(async () => {
    await uploadJobRef.current?.cancel();
  }, []);

  useEffect(() => {
    const cancelOnExit = () => uploadJobRef.current?.cancelOnExit();
    window.addEventListener('pagehide', cancelOnExit);
    return () => {
      window.removeEventListener('pagehide', cancelOnExit);
      cancelOnExit();
    };
  }, []);

  const saveRecordingTitle = async (value: string) => {
    const validationError = getRecordingTitleError(value);
    if (validationError) {
      setTitleError(validationError);
      return false;
    }
    if (!activeRecording) {
      setTitleError('The finalized recording is unavailable.');
      return false;
    }
    if (!cloudRecording || uploadState !== 'ready') {
      setTitleError('Wait for the recording to finish saving, then try again.');
      return false;
    }

    setTitleSaving(true);
    setTitleError('');
    try {
      const title = normalizeRecordingTitle(value);
      const response = await fetch('/api/recordings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cloudRecording.id, title }),
      });
      const data = await response.json();
      if (!response.ok || !data.recording) {
        throw new Error(data.error ?? 'Could not update the recording.');
      }
      setCloudRecording((current) => current ? { ...current, ...data.recording } : current);
      if (recoveredRecording) {
        const titledRecording = { ...recoveredRecording, title };
        await saveLocalRecording(titledRecording);
        const draftId = recoveredDraftIdRef.current ?? titledRecording.id;
        await deleteRecordingDraft(draftId);
        recoveredDraftIdRef.current = null;
        setRecoveredRecording(titledRecording);
      } else {
        await saveCompletedRecordingTitle(title);
      }
      setRecoveryMessage('');
      setUploadMessage('Recording ready.');
      return true;
    } catch (cause) {
      setTitleError(`Could not save the recording title: ${(cause as Error).message}`);
      return false;
    } finally {
      setTitleSaving(false);
    }
  };

  const downloadRecordingFiles = async () => {
    if (!activeRecording?.title) return;
    const recordingAssets = RECORDING_ARCHIVE_KINDS.flatMap((kind) => {
      const asset = kind === 'composite'
        ? compositeAssetFor(activeRecording)
        : activeRecording.assets?.[kind];
      return asset?.blob ? [{ kind, mimeType: asset.mimeType, blob: asset.blob }] : [];
    });
    setUploadMessage('Preparing recording ZIP…');
    try {
      await downloadRecordingArchive(activeRecording.title, recordingAssets);
      setUploadMessage(`${recordingAssets.length} recording files downloaded as one ZIP.`);
    } catch (cause) {
      setUploadMessage(`Recording ZIP failed: ${(cause as Error).message}`);
    }
  };

  const uploadRecording = useCallback(async () => {
    if (!activeRecording || !ownerUserId || uploadJobRef.current) return;
    setUploadState('uploading');
    setUploadProgress(0);
    setUploadMessage('Đang sao lưu và lưu trữ bản ghi…');
    let job: RecordingUploadJob | null = null;
    try {
      job = createRecordingUploadJob({
        recording: activeRecording, ownerUserId,
        settings: {
          recordingMode: mode, pipShape, pipSize, pipPosition, bgRemovalMode: background, audioMode,
          waveformPeaks: activeRecording.assets?.audio?.waveformPeaks ?? [],
        },
        onPhase: (phase) => {
          setUploadState(phase);
          setUploadMessage(phase === 'saving' ? 'Đang hoàn tất lưu trữ bản ghi…' : 'Đang tải bản ghi lên…');
        },
        onProgress: setUploadProgress,
      });
      uploadJobRef.current = job;
      const saved = await job.run();
      setCloudRecording(saved);
      setUploadState('ready');
      setUploadProgress(100);
      setUploadMessage(activeRecording.title ? 'Bản ghi đã được lưu.' : 'Bản ghi đã được lưu. Hãy đặt tiêu đề để tiếp tục.');
    } catch (error) {
      console.error('Recording save failed', error);
      setUploadState('error');
      setUploadMessage(job?.cancelled
        ? 'Quá trình lưu đã bị gián đoạn. Bản sao lưu trên thiết bị vẫn còn; hãy thử lưu lại.'
        : (error as Error).message || 'Không thể lưu bản ghi. Hãy kiểm tra kết nối và thử lại.');
    } finally {
      if (uploadJobRef.current === job) uploadJobRef.current = null;
    }
  }, [activeRecording, ownerUserId, audioMode, background, mode, pipPosition, pipShape, pipSize]);

  useEffect(() => {
    if (!activeRecording || !ownerUserId || uploadStartedForRef.current === activeRecording.id) return;
    uploadStartedForRef.current = activeRecording.id;
    void uploadRecording();
  }, [activeRecording, ownerUserId, uploadRecording]);

  const retryRecordingSave = () => {
    if (!activeRecording || uploadState !== 'error') return;
    void uploadRecording();
  };

  const inspectBrowserCapabilities = () => {
    const nextCapabilities: BrowserCapabilities = {
      screenCapture: Boolean(navigator.mediaDevices?.getDisplayMedia),
      cameraAndMic: Boolean(navigator.mediaDevices?.getUserMedia),
      mediaRecorder: 'MediaRecorder' in window,
      indexedDb: 'indexedDB' in window,
      fileSystemSave: 'showSaveFilePicker' in window,
    };
    setCapabilities(nextCapabilities);
    return nextCapabilities;
  };

  const runDevicePreflight = () => {
    setHealthState('checking');
    inspectBrowserCapabilities();
    setHealthState('ready');
  };

  const runSystemCheck = async () => {
    setHealthState('checking');
    inspectBrowserCapabilities();
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok && response.status !== 503) throw new Error(data.error ?? 'Health check failed.');
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
          filters_config: { mode: audioMode },
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
    setPipShape(preset.pip_shape === 'cutout' ? 'circle' : preset.pip_shape as PipShape);
    setPipSize(preset.pip_size as PipSize);
    setBackground('original');
    const filters = preset.filters_config as { mode?: string };
    if (filters.mode) setAudioMode(filters.mode);
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

  return {
    workspace,
    mode, setMode,
    background, setBackground,
    pipShape, setPipShape,
    pipSize, setPipSize,
    audioMode, setAudioMode,
    countdown,
    micMuted, setMicMuted,
    cameraVisible, setCameraVisible,
    healthState,
    health,
    capabilities,
    presets,
    presetName, setPresetName,
    presetMessage,
    theme,
    sourcesOpen, setSourcesOpen,
    effectsOpen, setEffectsOpen,
    diagnosticsOpen, setDiagnosticsOpen,
    effectsTab, setEffectsTab,
    selectedCameraId, setSelectedCameraId,
    selectedMicrophoneId, setSelectedMicrophoneId,
    isConnectingSources,
    isConnectingSlideSource,
    recoveryDrafts,
    recoveryMessage,
    uploadState,
    uploadProgress,
    uploadMessage,
    cloudRecording,
    titleRequired,
    titleSaving,
    titleError,
    leaveWarning,
    cancelPendingUpload,
    micGain, setMicGain,
    systemVolume, setSystemVolume,
    customAudioConfig, setCustomAudioConfig,
    screenStream,
    cameraStream,
    microphoneStream,
    cameras,
    microphones,
    mediaStatuses,
    mediaError,
    hasSystemAudio: hasActiveSystemAudio,
    stopAllMedia,
    tabCapture,
    mixedAudioStream,
    audioState,
    microphoneLevel,
    microphoneLevelDb,
    systemAudioLevel,
    systemAudioLevelDb,
    audioError,
    resumeAudio,
    segmentationState,
    segmentationError,
    inferenceFps,
    compositorResolution,
    canvasRef,
    compositeStream,
    compositorFps,
    compositorRunning,
    pipPosition,
    compositorWarning,
    setPipPosition,
    canvasPointerHandlers,
    presentationDeck,
    presentationSource,
    presentationElement,
    setPresentationElement,
    recordingVideoStream,
    legacyCursorTrajectory,
    recordingWarning,
    recordingError,
    startRecordingAttention,
    stopRecording,
    activeRecording,
    session,
    elapsed,
    activeMode,
    sourcesConnected,
    visualSourcesConnected,
    requiredDevicesConnected,
    recordingReady,
    sessionLabel,
    toggleTheme,
    connectSources,
    connectSlideSource,
    startUiTest,
    recoverLatestDraft,
    saveRecordingTitle,
    downloadRecordingFiles,
    retryRecordingSave,
    runSystemCheck,
    runDevicePreflight,
    savePreset,
    applyPreset,
  };
}

export type StudioController = ReturnType<typeof useStudioController>;
