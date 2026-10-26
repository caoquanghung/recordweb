'use client';

import type { CSSProperties } from 'react';
import type { MediaSource } from '@/hooks/useMediaDevices';
import { useMediaSession } from './MediaSessionProvider';
import { usePersistentPanelPosition } from './usePersistentPanelPosition';
import styles from './GlobalMediaControl.module.css';

const POSITION_STORAGE_KEY = 'recordweb-device-control-position';

function SourceIcon({ source, inactive = false }: { source: MediaSource; inactive?: boolean }) {
  if (source === 'microphone') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="3" width="8" height="12" rx="4" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
        {inactive && <path d="M2 2l20 20" />}
      </svg>
    );
  }

  if (source === 'camera') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="13" height="12" rx="3" />
        <path d="m16 10 5-3v10l-5-3" />
        {inactive && <path d="M2 2l20 20" />}
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function GlobalMediaControl() {
  const {
    screenStream,
    cameraStream,
    microphoneStream,
    stopScreen,
    stopCamera,
    stopMicrophone,
    stopAll,
    micMuted,
    cameraVisible,
  } = useMediaSession();

  const sources = [
    { source: 'screen' as const, label: 'Screen', stream: screenStream, stop: stopScreen, inactive: false },
    { source: 'camera' as const, label: cameraVisible ? 'Camera' : 'Camera off', stream: cameraStream, stop: stopCamera, inactive: !cameraVisible },
    { source: 'microphone' as const, label: micMuted ? 'Mic muted' : 'Mic', stream: microphoneStream, stop: stopMicrophone, inactive: micMuted },
  ].filter(({ stream }) => Boolean(stream));
  const {
    panelRef,
    position,
    isDragging,
    resetPosition,
    startDragging,
    dragPanel,
    stopDragging,
    moveWithKeyboard,
  } = usePersistentPanelPosition({
    isVisible: sources.length > 0,
    storageKey: POSITION_STORAGE_KEY,
  });

  if (sources.length === 0) return null;

  const panelStyle = position
    ? ({ left: `${position.x}px`, top: `${position.y}px` } satisfies CSSProperties)
    : undefined;

  return (
    <aside
      ref={panelRef}
      className={`${styles.control} ${position ? styles.positioned : ''} ${isDragging ? styles.dragging : ''}`}
      style={panelStyle}
      aria-label="Active media sources"
    >
      <div className={styles.heading}>
        <div
          className={styles.dragHandle}
          role="button"
          tabIndex={0}
          aria-label="Move devices in use panel. Drag, use arrow keys, or press Home to reset."
          title="Drag to move · Arrow keys to nudge · Home to reset"
          onPointerDown={startDragging}
          onPointerMove={dragPanel}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onKeyDown={moveWithKeyboard}
        >
          <span className={styles.grip} aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </span>
          <span className={styles.liveDot} aria-hidden="true" />
          <span className={styles.headingLabel}>Devices in use</span>
          <span className={styles.dragHint} aria-hidden="true">Drag to move</span>
        </div>
        <button
          className={styles.resetPosition}
          type="button"
          onClick={resetPosition}
          disabled={!position}
          aria-label="Reset device panel position"
          title="Reset position"
        >
          ↙
        </button>
      </div>
      <div className={styles.sources}>
        {sources.map(({ source, label, stop, inactive }) => (
          <button
            className={styles.sourceButton}
            key={source}
            type="button"
            onClick={stop}
            aria-label={`Disconnect ${source}`}
            title={`Disconnect ${source}`}
          >
            <SourceIcon source={source} inactive={inactive} />
            <span>{label}</span>
            <span className={styles.close} aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      <button className={styles.disconnectAll} type="button" onClick={stopAll}>
        Disconnect all
      </button>
    </aside>
  );
}
