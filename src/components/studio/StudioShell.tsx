'use client';

import { UserButton } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCanvasCompositor } from '@/hooks/useCanvasCompositor';
import { useAudioDSP } from '@/hooks/useAudioDSP';
import type { AudioDspPreset } from '@/hooks/useAudioDSP';
import { useMediaDevices } from '@/hooks/useMediaDevices';
import type { DbRecording, DbStudioPreset } from '@/types/database';
import type {
  AudioFilterConfig,
  BackgroundRemovalMode,
  PipShape,
  PipSize,
  RecordingMode,
} from '@/types/media';
import styles from './StudioShell.module.css';

type SessionState = 'setup' | 'countdown' | 'recording' | 'paused' | 'review';
type CheckState = 'idle' | 'checking' | 'ready' | 'error';
type Theme = 'light' | 'dark';

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

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 MB';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
  const [session, setSession] = useState<SessionState>('setup');
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(true);
  const [healthState, setHealthState] = useState<CheckState>('idle');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [presets, setPresets] = useState<DbStudioPreset[]>([]);
  const [recordings, setRecordings] = useState<DbRecording[]>([]);
  const [presetName, setPresetName] = useState('My studio preset');
  const [presetMessage, setPresetMessage] = useState('');
  const [dataError, setDataError] = useState('');
  const [theme, setTheme] = useState<Theme>('dark');
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('');
  const [isConnectingSources, setIsConnectingSources] = useState(false);
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
  } = useMediaDevices();

  const {
    outputStream: mixedAudioStream,
    state: audioState,
    level: audioLevel,
    levelDb: audioLevelDb,
    error: audioError,
    resume: resumeAudio,
  } = useAudioDSP({
    microphoneStream,
    systemAudioStream,
    preset: audioPresetByLabel[audioMode] ?? 'voice-clarity',
    muted: micMuted,
    micGain,
    systemGain: systemVolume,
    customConfig: customAudioConfig,
  });

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
    paused: session === 'paused',
  });

  const activeMode = useMemo(
    () => modes.find((item) => item.value === mode) ?? modes[0],
    [mode]
  );

  const loadCloudData = useCallback(async () => {
    setDataError('');
    try {
      const [presetResponse, recordingResponse] = await Promise.all([
        fetch('/api/presets', { cache: 'no-store' }),
        fetch('/api/recordings', { cache: 'no-store' }),
      ]);
      const presetJson = await presetResponse.json();
      const recordingJson = await recordingResponse.json();

      if (!presetResponse.ok) throw new Error(presetJson.error ?? 'Could not load presets.');
      if (!recordingResponse.ok) throw new Error(recordingJson.error ?? 'Could not load recordings.');

      setPresets(presetJson.presets ?? []);
      setRecordings(recordingJson.recordings ?? []);
    } catch (error) {
      setDataError((error as Error).message);
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
    const initialLoad = window.setTimeout(() => void loadCloudData(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadCloudData]);

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
      else await acquireScreen();

      if (mode === 'screen-only') stopCamera();
      else await acquireCamera(selectedCameraId || undefined);

      await acquireMicrophone(selectedMicrophoneId || undefined);
    } finally {
      setIsConnectingSources(false);
    }
  };

  const sourcesConnected = Boolean(screenStream || cameraStream || microphoneStream);
  const visualSourcesConnected = Boolean(screenStream || cameraStream);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;

      if ((event.code === 'Space' || (event.altKey && event.key.toLowerCase() === 'p')) && (session === 'recording' || session === 'paused')) {
        event.preventDefault();
        setSession(session === 'paused' ? 'recording' : 'paused');
      }
      if (event.altKey && event.key.toLowerCase() === 's' && (session === 'recording' || session === 'paused')) {
        event.preventDefault();
        setSession('review');
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
  }, [session]);

  useEffect(() => {
    if (session !== 'recording') return;
    const timer = window.setInterval(() => {
      setElapsed((current) => {
        if (current >= 1799) {
          setSession('review');
          return 1800;
        }
        return current + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (session !== 'countdown') return;
    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        setSession('recording');
        setCountdown(3);
      } else {
        setCountdown((value) => value - 1);
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [countdown, session]);

  const startUiTest = () => {
    setElapsed(0);
    setCountdown(3);
    setSession('countdown');
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
      await loadCloudData();
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
    review: 'Review',
  }[session];

  return (
    <main className={styles.appShell}>
      <aside className={styles.navigation} aria-label="Primary navigation">
        <div className={styles.brandMark} aria-label="RecordWeb">R</div>
        <nav className={styles.navStack}>
          <button className={`${styles.navButton} ${styles.navButtonActive}`} aria-label="Studio" title="Studio"><Icon name="record" /></button>
          <button className={styles.navButton} aria-label="Dashboard (coming soon)" title="Dashboard — coming soon" disabled><Icon name="grid" /></button>
          <button className={styles.navButton} aria-label="Library (coming soon)" title="Library — coming soon" disabled><Icon name="library" /></button>
        </nav>
        <div className={styles.navBottom}>
          <button className={styles.navButton} aria-label="Settings (coming soon)" title="Settings — coming soon" disabled><Icon name="settings" /></button>
          <UserButton />
        </div>
      </aside>

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
            <button className={styles.secondaryButton} onClick={runSystemCheck} disabled={healthState === 'checking'}>
              <Icon name="refresh" />
              {healthState === 'checking' ? 'Checking…' : 'Run system check'}
            </button>
          </div>
        </header>

        <div className={styles.prototypeNotice} role="note">
          <span>UI test harness</span>
          Live source previews are connected. Recording controls still simulate state until the compositor and recorder are added.
        </div>

        <div className={styles.studioGrid}>
          <aside className={styles.leftPanel}>
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
                    onClick={() => setMode(item.value)}
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
          </aside>

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

              {session === 'countdown' && <div className={styles.countdownOverlay}><span>{countdown}</span><small>Get ready</small></div>}
              {session === 'review' && (
                <div className={styles.reviewOverlay}>
                  <div className={styles.reviewIcon}><Icon name="check" /></div>
                  <strong>UI flow complete</strong>
                  <p>{formatDuration(elapsed)} simulated · no media was recorded</p>
                  <button onClick={() => setSession('setup')}>Return to setup</button>
                </div>
              )}

              <div className={styles.stageCorner}>Preview · {activeMode.detail}{compositeStream ? ' · composite stream ready' : ''}</div>
            </div>

            <div className={styles.controlDock} aria-label="Recording controls">
              <div className={styles.timerBlock}>
                <span className={session === 'recording' ? styles.recDot : styles.idleDot} />
                <div><strong>{formatDuration(elapsed)}</strong><small>/ 30:00</small></div>
              </div>
              <div className={styles.controlDivider} />
              {session === 'setup' || session === 'review' ? (
                <button className={styles.recordButton} onClick={startUiTest}><Icon name="record" /> Start UI test</button>
              ) : (
                <>
                  <button
                    className={styles.roundControl}
                    onClick={() => setSession(session === 'paused' ? 'recording' : 'paused')}
                    disabled={session === 'countdown'}
                    aria-label={session === 'paused' ? 'Resume' : 'Pause'}
                  >
                    <Icon name={session === 'paused' ? 'play' : 'pause'} />
                  </button>
                  <button className={styles.stopControl} onClick={() => setSession('review')} disabled={session === 'countdown'} aria-label="Stop">
                    <Icon name="stop" />
                  </button>
                </>
              )}
              <div className={styles.controlDivider} />
              <button className={`${styles.roundControl} ${micMuted ? styles.controlOff : ''}`} onClick={() => setMicMuted((value) => !value)} aria-label="Toggle microphone"><Icon name="mic" /></button>
              <button className={`${styles.roundControl} ${!cameraVisible ? styles.controlOff : ''}`} onClick={() => setCameraVisible((value) => !value)} aria-label="Toggle camera"><Icon name="camera" /></button>
            </div>
            <div className={styles.shortcutHint}>Space pause/resume · Alt+S finish · controls are simulation-only</div>
          </section>

          <aside className={styles.rightPanel}>
            <section className={styles.inspectorSection}>
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
              <label className={styles.fieldLabel}>Size</label>
              <div className={styles.segmented}>
                {(['small', 'medium', 'large'] as PipSize[]).map((size) => (
                  <button key={size} onClick={() => setPipSize(size)} className={pipSize === size ? styles.segmentActive : ''}>{size[0].toUpperCase()}</button>
                ))}
              </div>
            </section>

            <section className={styles.inspectorSection}>
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
              {audioState === 'suspended' && (
                <button className={styles.audioStartButton} type="button" onClick={() => void resumeAudio()}>Start audio processing</button>
              )}
              <div className={styles.meterHeader}>
                <span>Mixed output meter</span>
                <small>{audioState === 'running' ? `${Math.max(-60, Math.round(audioLevelDb))} dB` : microphoneStream || hasSystemAudio ? audioState : 'Awaiting input'}</small>
              </div>
              <div className={styles.meterTrack} role="meter" aria-label="Mixed audio level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(audioLevel * 100)}>
                <span style={{ width: `${audioLevel * 100}%` }} />
              </div>
              {mixedAudioStream && <p className={styles.audioReady}>Mixed audio track ready for recording</p>}
              {audioError && <p className={styles.sourceError} role="alert">{audioError}</p>}
            </section>

            <section className={styles.inspectorSection}>
              <div className={styles.inspectorTitle}><div><Icon name="cloud" /><h2>Preset test</h2></div><span>{presets.length}</span></div>
              <input className={styles.textInput} value={presetName} onChange={(event) => setPresetName(event.target.value)} aria-label="Preset name" />
              <button className={styles.savePresetButton} onClick={savePreset}>Save current setup</button>
              {presetMessage && <p className={styles.inlineMessage} aria-live="polite">{presetMessage}</p>}
              <div className={styles.presetList}>
                {presets.slice(0, 3).map((preset) => (
                  <button key={preset.id} onClick={() => applyPreset(preset)}><span>{preset.preset_name}</span><small>Load</small></button>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <section className={styles.bottomGrid}>
          <div className={styles.healthCard}>
            <div className={styles.cardHeader}>
              <div><span className={styles.cardIcon}><Icon name="shield" /></span><div><h2>System readiness</h2><p>Authenticated server and browser checks</p></div></div>
              <button onClick={runSystemCheck}>{healthState === 'checking' ? 'Checking…' : 'Refresh'}</button>
            </div>
            <div className={styles.checkGrid}>
              <div><StatusDot ok={health?.auth === 'authenticated'} /><span>Clerk session</span><strong>{health?.auth === 'authenticated' ? 'Connected' : 'Not checked'}</strong></div>
              <div><StatusDot ok={health?.database === 'connected'} /><span>Neon database</span><strong>{health?.database ?? 'Not checked'}</strong></div>
              <div><StatusDot ok={health?.blob === 'configured'} /><span>Vercel Blob</span><strong>{health?.blob ?? 'Not checked'}</strong></div>
              <div><StatusDot ok={Boolean(capabilities?.screenCapture)} /><span>Screen capture</span><strong>{capabilities ? (capabilities.screenCapture ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
              <div><StatusDot ok={Boolean(capabilities?.cameraAndMic)} /><span>Camera + microphone</span><strong>{capabilities ? (capabilities.cameraAndMic ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
              <div><StatusDot ok={Boolean(capabilities?.mediaRecorder)} /><span>MediaRecorder</span><strong>{capabilities ? (capabilities.mediaRecorder ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
              <div><StatusDot ok={Boolean(capabilities?.indexedDb)} /><span>IndexedDB</span><strong>{capabilities ? (capabilities.indexedDb ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
              <div><StatusDot ok={Boolean(capabilities?.fileSystemSave)} /><span>Direct file save</span><strong>{capabilities ? (capabilities.fileSystemSave ? 'Supported' : 'Download fallback') : 'Not checked'}</strong></div>
            </div>
          </div>

          <div className={styles.libraryCard}>
            <div className={styles.cardHeader}>
              <div><span className={styles.cardIcon}><Icon name="library" /></span><div><h2>Cloud recordings</h2><p>Live data from your Neon account</p></div></div>
              <button onClick={loadCloudData}>Reload</button>
            </div>
            {dataError ? (
              <div className={styles.emptyState}><strong>Cloud data unavailable</strong><span>{dataError}</span></div>
            ) : recordings.length === 0 ? (
              <div className={styles.emptyState}><strong>No recordings yet</strong><span>Your first uploaded recording will appear here.</span></div>
            ) : (
              <div className={styles.recordingList}>
                {recordings.slice(0, 3).map((recording) => (
                  <div key={recording.id}>
                    <span className={styles.recordingThumb}><Icon name="play" /></span>
                    <span><strong>{recording.title}</strong><small>{formatDuration(recording.duration_seconds)} · {formatBytes(recording.file_size_bytes)}</small></span>
                    <em>{recording.storage_url ? 'Cloud' : 'Metadata'}</em>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className={styles.srOnly} aria-live="polite">Session status: {sessionLabel}</div>
      </section>
    </main>
  );
}
