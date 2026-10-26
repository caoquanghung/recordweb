import { useEffect, useRef } from 'react';
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
    recordingReady,
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
    startRecordingAttention,
    startUiTest,
    resumeRecording,
    pauseRecording,
    stopRecording,
    micMuted,
    setMicMuted,
    setCameraVisible,
  } = studio;
  const startButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!startRecordingAttention) return;
    startButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    startButtonRef.current?.focus({ preventScroll: true });
  }, [startRecordingAttention]);

  return (
    <section className={styles.stageColumn}>
      <div className={styles.stageToolbar}>
        <div className={styles.stageMode}><StatusDot ok={recordingReady || session === 'recording'} /> {session === 'setup' ? (recordingReady ? 'Preview ready' : 'Live preview') : sessionLabel}</div>
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
            <div className={styles.mockSlideHeader}>
              <span>Học phần: Toán ứng dụng</span>
              <strong>Chương 4: Ma trận và Không gian Véc-tơ</strong>
            </div>
            <div className={styles.mockLesson}>
              <div className={styles.mockLessonCard}>
                <strong>1. Định lý Phân rã Trị riêng</strong>
                <p>Cho ma trận đối xứng thực A, tồn tại ma trận trực giao Q sao cho:</p>
                <div className={styles.mockFormula}>A = Q Λ Qᵀ = Σ λᵢ uᵢ uᵢᵀ</div>
                <div className={styles.mockLegend}><span><i />Không gian Cột Col(A)</span><span><i />Không gian Hạt nhân Null(A)</span></div>
              </div>
              <div className={styles.mockDiagram} aria-hidden="true">
                <span className={styles.diagramAxisX} />
                <span className={styles.diagramAxisY} />
                <span className={styles.diagramVectorOne} />
                <span className={styles.diagramVectorTwo} />
                <small>λ₁ · u₁</small>
              </div>
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

        <div className={styles.stageCorner}>Xem trước · {activeMode.detail}{compositeStream ? ' · luồng tổng hợp đã sẵn sàng' : ''}</div>
      </div>

      {session === 'setup' && startRecordingAttention > 0 && (
        <div className={styles.startRecordingPrompt} role="status">
          Your Slides tab is connected. Click Start recording to begin the countdown.
        </div>
      )}
      <div className={styles.controlDock} aria-label="Recording controls">
        <div className={styles.timerBlock}>
          <span className={session === 'recording' ? styles.recDot : styles.idleDot} />
          <div><strong>{formatDuration(elapsed)}</strong><small>/ 30:00</small></div>
        </div>
        <div className={styles.controlDivider} />
        {session === 'setup' ? (
          <button
            ref={startButtonRef}
            className={`${styles.recordButton} ${recordingReady ? (startRecordingAttention > 0 ? styles.recordButtonAttention : styles.nextStepPulse) : ''}`}
            onClick={() => void startUiTest()}
            disabled={!recordingReady || session !== 'setup'}
            title={!recordingReady ? mode === 'webcam-only' ? 'Connect the camera and microphone before recording' : 'Connect the required devices and Google Slides before recording' : undefined}
          >
            <StudioIcon name="record" /> Start recording
          </button>
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
      <div className={styles.shortcutHint}>Space pause/resume · Alt+S finish · video is checkpointed to IndexedDB</div>
    </section>
  );
}
