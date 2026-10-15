import { AudioMeterPanel } from './AudioMeterPanel';
import { formatDuration } from './studioConfig';
import { StatusDot, StudioIcon } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioShell.module.css';

export function StudioStage({ studio }: { studio: StudioController }) {
  const {
    session,
    sessionLabel,
    activeMode,
    resolution,
    compositorRunning,
    compositorFps,
    visualSourcesConnected,
    canvasRef,
    compositorResolution,
    canvasPointerHandlers,
    mode,
    cameraVisible,
    pipShape,
    background,
    countdown,
    compositeStream,
    audioState,
    resumeAudio,
    microphoneLevel,
    microphoneLevelDb,
    microphoneStream,
    systemAudioLevel,
    systemAudioLevelDb,
    hasSystemAudio,
    elapsed,
    startUiTest,
    resumeRecording,
    pauseRecording,
    stopRecording,
    micMuted,
    setMicMuted,
    setCameraVisible,
  } = studio;

  return (
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
          <button className={styles.recordButton} onClick={() => void startUiTest()}><StudioIcon name="record" /> Start recording</button>
        ) : (
          <>
            <button
              className={styles.roundControl}
              onClick={session === 'paused' ? resumeRecording : pauseRecording}
              disabled={session === 'countdown' || session === 'processing'}
              aria-label={session === 'paused' ? 'Resume' : 'Pause'}
            >
              <StudioIcon name={session === 'paused' ? 'play' : 'pause'} />
            </button>
            <button className={styles.stopControl} onClick={stopRecording} disabled={session === 'countdown' || session === 'processing'} aria-label="Stop">
              <StudioIcon name="stop" />
            </button>
          </>
        )}
        <div className={styles.controlDivider} />
        <button className={`${styles.roundControl} ${micMuted ? styles.controlOff : ''}`} onClick={() => setMicMuted((value) => !value)} aria-label="Toggle microphone"><StudioIcon name="mic" /></button>
        <button className={`${styles.roundControl} ${!cameraVisible ? styles.controlOff : ''}`} onClick={() => setCameraVisible((value) => !value)} aria-label="Toggle camera"><StudioIcon name="camera" /></button>
      </div>
      <div className={styles.shortcutHint}>Space pause/resume · Alt+S finish · video is checkpointed to IndexedDB</div>
    </section>
  );
}
