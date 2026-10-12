'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useMediaSession } from './MediaSessionProvider';
import styles from './GlobalMediaControl.module.css';

type SourceName = 'screen' | 'camera' | 'microphone';
type PanelPosition = { x: number; y: number };

const POSITION_STORAGE_KEY = 'recordweb-device-control-position';
const VIEWPORT_MARGIN = 12;

function clampPosition(x: number, y: number, width: number, height: number): PanelPosition {
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);

  return {
    x: Math.min(Math.max(x, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(y, VIEWPORT_MARGIN), maxY),
  };
}

function SourceIcon({ source }: { source: SourceName }) {
  if (source === 'microphone') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="3" width="8" height="12" rx="4" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
      </svg>
    );
  }

  if (source === 'camera') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="13" height="12" rx="3" />
        <path d="m16 10 5-3v10l-5-3" />
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
  const controlRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const positionRef = useRef<PanelPosition | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const {
    screenStream,
    cameraStream,
    microphoneStream,
    stopScreen,
    stopCamera,
    stopMicrophone,
    stopAll,
  } = useMediaSession();

  const sources = [
    { source: 'screen' as const, label: 'Screen', stream: screenStream, stop: stopScreen },
    { source: 'camera' as const, label: 'Camera', stream: cameraStream, stop: stopCamera },
    { source: 'microphone' as const, label: 'Mic', stream: microphoneStream, stop: stopMicrophone },
  ].filter(({ stream }) => Boolean(stream));

  const persistPosition = useCallback((nextPosition: PanelPosition | null) => {
    try {
      if (nextPosition) {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nextPosition));
      } else {
        window.localStorage.removeItem(POSITION_STORAGE_KEY);
      }
    } catch {
      // Position persistence is optional when storage is unavailable.
    }
  }, []);

  const movePanel = useCallback((x: number, y: number, shouldPersist = true) => {
    const panel = controlRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const nextPosition = clampPosition(x, y, rect.width, rect.height);
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    if (shouldPersist) persistPosition(nextPosition);
  }, [persistPosition]);

  const resetPosition = useCallback(() => {
    dragRef.current = null;
    positionRef.current = null;
    setIsDragging(false);
    setPosition(null);
    persistPosition(null);
  }, [persistPosition]);

  useEffect(() => {
    if (sources.length === 0) return;

    const frame = window.requestAnimationFrame(() => {
      const panel = controlRef.current;
      if (!panel) return;

      try {
        const stored = window.localStorage.getItem(POSITION_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored) as Partial<PanelPosition>;
        if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return;
        const rect = panel.getBoundingClientRect();
        const nextPosition = clampPosition(parsed.x!, parsed.y!, rect.width, rect.height);
        positionRef.current = nextPosition;
        setPosition(nextPosition);
      } catch {
        persistPosition(null);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [persistPosition, sources.length]);

  useEffect(() => {
    const keepPanelVisible = () => {
      const panel = controlRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      setPosition((current) => {
        if (!current) return current;
        const nextPosition = clampPosition(current.x, current.y, rect.width, rect.height);
        positionRef.current = nextPosition;
        persistPosition(nextPosition);
        return nextPosition;
      });
    };

    window.addEventListener('resize', keepPanelVisible);
    return () => window.removeEventListener('resize', keepPanelVisible);
  }, [persistPosition]);

  const startDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const panel = controlRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    const currentPosition = { x: rect.left, y: rect.top };
    positionRef.current = currentPosition;
    setPosition(currentPosition);
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const dragPanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    movePanel(event.clientX - drag.offsetX, event.clientY - drag.offsetY, false);
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    persistPosition(positionRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const moveWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      resetPosition();
      return;
    }

    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;

    const panel = controlRef.current;
    if (!panel) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const step = event.shiftKey ? 32 : 12;
    movePanel(rect.left + direction[0] * step, rect.top + direction[1] * step);
  };

  if (sources.length === 0) return null;

  const panelStyle = position
    ? ({ left: `${position.x}px`, top: `${position.y}px` } satisfies CSSProperties)
    : undefined;

  return (
    <aside
      ref={controlRef}
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
        {sources.map(({ source, label, stop }) => (
          <button
            className={styles.sourceButton}
            key={source}
            type="button"
            onClick={stop}
            aria-label={`Disconnect ${label.toLowerCase()}`}
            title={`Disconnect ${label.toLowerCase()}`}
          >
            <SourceIcon source={source} />
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
