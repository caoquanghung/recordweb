'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface PanelPosition {
  x: number;
  y: number;
}

interface UsePersistentPanelPositionOptions {
  isVisible: boolean;
  storageKey: string;
  viewportMargin?: number;
}

const KEYBOARD_DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function isPanelPosition(value: unknown): value is PanelPosition {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<PanelPosition>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

function clampPosition(
  position: PanelPosition,
  panel: HTMLElement,
  viewportMargin: number,
): PanelPosition {
  const { width, height } = panel.getBoundingClientRect();
  const maxX = Math.max(viewportMargin, window.innerWidth - width - viewportMargin);
  const maxY = Math.max(viewportMargin, window.innerHeight - height - viewportMargin);

  return {
    x: Math.min(Math.max(position.x, viewportMargin), maxX),
    y: Math.min(Math.max(position.y, viewportMargin), maxY),
  };
}

export function usePersistentPanelPosition({
  isVisible,
  storageKey,
  viewportMargin = 12,
}: UsePersistentPanelPositionOptions) {
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const positionRef = useRef<PanelPosition | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const persistPosition = useCallback((nextPosition: PanelPosition | null) => {
    try {
      if (nextPosition) {
        window.localStorage.setItem(storageKey, JSON.stringify(nextPosition));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Position persistence is optional when storage is unavailable.
    }
  }, [storageKey]);

  const movePanel = useCallback((nextPosition: PanelPosition, shouldPersist = true) => {
    const panel = panelRef.current;
    if (!panel) return;

    const clampedPosition = clampPosition(nextPosition, panel, viewportMargin);
    positionRef.current = clampedPosition;
    setPosition(clampedPosition);
    if (shouldPersist) persistPosition(clampedPosition);
  }, [persistPosition, viewportMargin]);

  const resetPosition = useCallback(() => {
    dragRef.current = null;
    positionRef.current = null;
    setIsDragging(false);
    setPosition(null);
    persistPosition(null);
  }, [persistPosition]);

  useEffect(() => {
    if (!isVisible) return;

    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;

      try {
        const storedPosition = window.localStorage.getItem(storageKey);
        if (!storedPosition) return;

        const parsedPosition: unknown = JSON.parse(storedPosition);
        if (!isPanelPosition(parsedPosition)) return;

        const nextPosition = clampPosition(parsedPosition, panel, viewportMargin);
        positionRef.current = nextPosition;
        setPosition(nextPosition);
      } catch {
        persistPosition(null);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isVisible, persistPosition, storageKey, viewportMargin]);

  useEffect(() => {
    const keepPanelVisible = () => {
      const panel = panelRef.current;
      if (!panel) return;

      setPosition((currentPosition) => {
        if (!currentPosition) return currentPosition;

        const nextPosition = clampPosition(currentPosition, panel, viewportMargin);
        positionRef.current = nextPosition;
        persistPosition(nextPosition);
        return nextPosition;
      });
    };

    window.addEventListener('resize', keepPanelVisible);
    return () => window.removeEventListener('resize', keepPanelVisible);
  }, [persistPosition, viewportMargin]);

  const startDragging = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const panel = panelRef.current;
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
  }, []);

  const dragPanel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    movePanel({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    }, false);
  }, [movePanel]);

  const stopDragging = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);
    persistPosition(positionRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [persistPosition]);

  const moveWithKeyboard = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      resetPosition();
      return;
    }

    const direction = KEYBOARD_DIRECTIONS[event.key];
    if (!direction) return;

    const panel = panelRef.current;
    if (!panel) return;

    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const step = event.shiftKey ? 32 : 12;
    movePanel({
      x: rect.left + direction[0] * step,
      y: rect.top + direction[1] * step,
    });
  }, [movePanel, resetPosition]);

  return {
    panelRef,
    position,
    isDragging,
    resetPosition,
    startDragging,
    dragPanel,
    stopDragging,
    moveWithKeyboard,
  };
}
