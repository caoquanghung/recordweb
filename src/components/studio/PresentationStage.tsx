'use client';

import { useEffect, useRef, type ChangeEvent } from 'react';
import { AudioMeterPanel } from './AudioMeterPanel';
import { formatDuration } from './studioConfig';
import { StatusDot, StudioIcon } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioShell.module.css';

function RawWebcam({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

  return <video ref={videoRef} className={styles.presentationWebcam} autoPlay muted playsInline aria-label="Webcam preview" />;
}

export function PresentationStage({ studio }: { studio: StudioController }) {
  const {
    session,
    sessionLabel,
    resolution,
    presentationDeck: {
      status: deckStatus,
      metadata,
      currentPageIndex,
      progress,
      progressMessage,
      isRendering: deckIsRendering,
      canAdvance: canAdvanceDeck,
      error: deckError,
      canvasRef,
      load: loadPresentation,
      nextPage,
      previousPage,
    },
    presentationSource,
    setPresentationElement,
    cameraStream,
    cameraVisible,
    countdown,
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
  const cursor = presentationSource.cursor;
  const cleanTabCapture = presentationSource.capture?.scope === 'tab';
  const recordingLocked = session !== 'setup';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        nextPage();
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        previousPage();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nextPage, previousPage]);

  const loadFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadPresentation(file);
    event.target.value = '';
  };

  return (
    <section className={styles.stageColumn}>
      <div className={styles.stageToolbar}>
        <div className={styles.stageMode}><StatusDot ok={session === 'recording'} /> {sessionLabel}</div>
        <div className={styles.stageTags}>
          <span>Presentation</span><span>{resolution}</span><span>30 FPS target</span>
        </div>
      </div>

      <div className={`${styles.stage} ${session === 'recording' ? styles.stageRecording : ''}`}>
        <div
          ref={setPresentationElement}
          className={`${styles.presentationSurface} ${cleanTabCapture ? styles.presentationSurfaceClean : ''}`}
          aria-label="Presentation capture area"
        >
          {metadata ? (
            <canvas ref={canvasRef} className={styles.presentationCanvas} aria-label={`Slide ${currentPageIndex + 1} of ${metadata.pageCount}`} />
          ) : (
            <div className={styles.presentationEmpty}>
              <span className={styles.mockKicker}>PRESENT FROM RECORDWEB</span>
              <strong>Upload your lecture slides</strong>
              <p>PDF and PPTX files stay in this browser. Maximum 50 MB and 300 slides.</p>
              <label className={styles.presentationUploadButton}>
                <StudioIcon name="cloud" /> Choose PDF or PPTX
                <input type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={loadFile} disabled={recordingLocked} />
              </label>
              {(deckStatus === 'validating' || deckStatus === 'loading') && (
                <div className={styles.presentationProgress} role="status">
                  <progress max="100" value={progress} />
                  <span>{progressMessage}</span>
                </div>
              )}
              {deckError && <p className={styles.presentationError} role="alert">{deckError}</p>}
            </div>
          )}

          {cameraVisible && cameraStream && <RawWebcam stream={cameraStream} />}
          {cursor.visible && (
            <span
              className={`${styles.presentationCursor} ${cursor.pressed ? styles.presentationCursorPressed : ''}`}
              style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
              aria-hidden="true"
            />
          )}
          {session === 'countdown' && countdown !== null && (
            <div className={styles.countdownOverlay}><span>{countdown}</span><small>Get ready</small></div>
          )}
        </div>
      </div>

      {metadata && (
        <div className={styles.presentationControls} aria-label="Slide controls">
          <label className={styles.presentationReplaceButton}>
            Replace file
            <input type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={loadFile} disabled={recordingLocked} />
          </label>
          <div>
            <button type="button" onClick={previousPage} disabled={deckIsRendering || currentPageIndex === 0} aria-label="Previous slide">←</button>
            <span>{currentPageIndex + 1} / {metadata.pageCount}</span>
            <button type="button" onClick={nextPage} disabled={deckIsRendering || !canAdvanceDeck} aria-label="Next animation or slide">→</button>
          </div>
          <span className={styles.presentationFileName} title={metadata.name}>{metadata.name}</span>
        </div>
      )}

      {session !== 'processing' && (
        <AudioMeterPanel
          key={session === 'setup' ? 'setup-meters' : 'recording-meters'}
          compact={session !== 'setup'}
          state={audioState}
          onResume={() => void resumeAudio()}
          microphone={{ level: microphoneLevel, levelDb: microphoneLevelDb, available: Boolean(microphoneStream) }}
          systemAudio={{ level: systemAudioLevel, levelDb: systemAudioLevelDb, available: hasSystemAudio }}
        />
      )}

      <div className={styles.controlDock} aria-label="Recording controls">
        <div className={styles.timerBlock}>
          <span className={session === 'recording' ? styles.recDot : styles.idleDot} />
          <div><strong>{formatDuration(elapsed)}</strong><small>/ 30:00</small></div>
        </div>
        <div className={styles.controlDivider} />
        {session === 'setup' ? (
          <button className={styles.recordButton} onClick={() => void startUiTest()} disabled={deckStatus !== 'ready'}>
            <StudioIcon name="record" /> Start presentation
          </button>
        ) : (
          <>
            <button className={styles.roundControl} onClick={session === 'paused' ? resumeRecording : pauseRecording} disabled={session === 'countdown' || session === 'processing'} aria-label={session === 'paused' ? 'Resume' : 'Pause'}>
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
      <div className={styles.shortcutHint}>Arrow keys change slides · Space pause/resume · Alt+S finish</div>
    </section>
  );
}
