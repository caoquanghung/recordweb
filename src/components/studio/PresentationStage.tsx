'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
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
      isReplacing: deckIsReplacing,
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
  const presentationElementRef = useRef<HTMLDivElement | null>(null);
  const replacementInputRef = useRef<HTMLInputElement>(null);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const deckBusy = deckIsReplacing || (!metadata && (deckStatus === 'validating' || deckStatus === 'loading'));
  const fileSelectionAllowed = ['setup', 'recording', 'paused'].includes(session) && !deckBusy && !deckIsRendering;

  const handlePresentationElement = useCallback((element: HTMLDivElement | null) => {
    presentationElementRef.current = element;
    setPresentationElement(element);
  }, [setPresentationElement]);

  const toggleFullscreen = useCallback(async () => {
    const presentationElement = presentationElementRef.current;
    if (!presentationElement || !document.fullscreenEnabled || !presentationElement.requestFullscreen) {
      setFullscreenError('Fullscreen presentation is not supported by this browser.');
      return;
    }

    try {
      setFullscreenError(null);
      if (document.fullscreenElement === presentationElement) {
        await document.exitFullscreen();
        return;
      }
      if (document.fullscreenElement) {
        setFullscreenError('Exit the current fullscreen view before opening the presentation.');
        return;
      }
      await presentationElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      setFullscreenError('Fullscreen could not start. Try the button again or check browser permissions.');
    }
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === presentationElementRef.current);
    };
    const handleFullscreenError = () => {
      setFullscreenError('Fullscreen could not start. Try the button again or check browser permissions.');
    };

    setFullscreenSupported(Boolean(
      document.fullscreenEnabled && presentationElementRef.current?.requestFullscreen,
    ));
    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('fullscreenerror', handleFullscreenError);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('fullscreenerror', handleFullscreenError);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.altKey && event.key.toLowerCase() === 'r' && metadata && fileSelectionAllowed) {
        event.preventDefault();
        replacementInputRef.current?.click();
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === 'f' && metadata) {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (deckBusy) return;
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
  }, [deckBusy, fileSelectionAllowed, metadata, nextPage, previousPage, toggleFullscreen]);

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
          ref={handlePresentationElement}
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
                <input type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={loadFile} disabled={!fileSelectionAllowed} />
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
        <div className={styles.presentationControls} aria-label="Slide controls" aria-busy={deckIsReplacing}>
          <div className={styles.presentationControlActions}>
            <label className={`${styles.presentationReplaceButton} ${!fileSelectionAllowed ? styles.presentationFileButtonDisabled : ''}`}>
              {deckIsReplacing ? 'Preparing file…' : 'Replace file'}
              <input ref={replacementInputRef} type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={loadFile} disabled={!fileSelectionAllowed} />
            </label>
            <button
              type="button"
              className={styles.presentationFullscreenButton}
              onClick={() => void toggleFullscreen()}
              disabled={!fullscreenSupported}
              aria-pressed={isFullscreen}
              title={fullscreenSupported ? 'Press Escape to exit fullscreen' : 'Fullscreen is unavailable in this browser'}
            >
              <StudioIcon name="screen" /> Full screen presentation
            </button>
          </div>
          <div>
            <button type="button" onClick={previousPage} disabled={deckBusy || deckIsRendering || currentPageIndex === 0} aria-label="Previous slide">←</button>
            <span>{currentPageIndex + 1} / {metadata.pageCount}</span>
            <button type="button" onClick={nextPage} disabled={deckBusy || deckIsRendering || !canAdvanceDeck} aria-label="Next animation or slide">→</button>
          </div>
          <span className={styles.presentationFileName} title={metadata.name}>{metadata.name}</span>
        </div>
      )}
      {metadata && fullscreenError && <p className={styles.presentationFullscreenError} role="alert">{fullscreenError}</p>}

      {metadata && deckIsReplacing && (
        <div className={styles.presentationReplacementStatus} role="status">
          <progress max="100" value={progress} />
          <span>{progressMessage || 'Preparing replacement material…'}</span>
        </div>
      )}
      {metadata && deckError && <p className={styles.presentationReplacementError} role="alert">{deckError}</p>}

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
      <div className={styles.shortcutHint}>Arrow keys change slides · Shift+F full screen · Alt+R replace material · Space pause/resume · Alt+S finish</div>
    </section>
  );
}
