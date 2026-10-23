import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  clampCanvasCoordinate,
  EMPTY_PIP_RECT,
  getPipDimensions,
  type PipRect,
  type Point,
} from '@/lib/canvasCompositorRenderer';
import type { PipPosition, PipShape, PipSize, RecordingMode } from '@/types/media';

interface UsePipPlacementOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mode: RecordingMode;
  cameraVisible: boolean;
  hasCamera: boolean;
  pipShape: PipShape;
  pipSize: PipSize;
  initialPosition: PipPosition;
}

function pointFromPointer(event: PointerEvent<HTMLCanvasElement>): Point {
  const canvas = event.currentTarget;
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
  };
}

function getArrowMovement(key: string, step: number): [number, number] | undefined {
  const movements: Partial<Record<string, [number, number]>> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  return movements[key];
}

export function usePipPlacement({
  canvasRef,
  mode,
  cameraVisible,
  hasCamera,
  pipShape,
  pipSize,
  initialPosition,
}: UsePipPlacementOptions) {
  const pipRectRef = useRef<PipRect>(EMPTY_PIP_RECT);
  const customPositionRef = useRef<Point>({ x: 0, y: 0 });
  const dragOffsetRef = useRef<Point | null>(null);
  const [pipPosition, setPipPositionState] = useState<PipPosition>(initialPosition);
  const [pipRect, setPipRect] = useState<PipRect>(EMPTY_PIP_RECT);

  const publishRenderedRect = useCallback((rect: PipRect) => {
    pipRectRef.current = rect;
    setPipRect(rect);
  }, []);

  const setPipPosition = useCallback((position: Exclude<PipPosition, 'custom'>) => {
    setPipPositionState(position);
  }, []);

  const setCustomPosition = useCallback((point: Point) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dimensions = getPipDimensions(pipShape, pipSize, canvas.height);
    customPositionRef.current = {
      x: clampCanvasCoordinate(point.x, 0, canvas.width - dimensions.width),
      y: clampCanvasCoordinate(point.y, 0, canvas.height - dimensions.height),
    };
    setPipPositionState('custom');
  }, [canvasRef, pipShape, pipSize]);

  const nudgePip = useCallback((deltaX: number, deltaY: number) => {
    const current = pipRectRef.current;
    setCustomPosition({ x: current.x + deltaX, y: current.y + deltaY });
  }, [setCustomPosition]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'screen-pip' || !cameraVisible || !hasCamera) return;
    const point = pointFromPointer(event);
    const rect = pipRectRef.current;
    const inside = point.x >= rect.x && point.x <= rect.x + rect.width
      && point.y >= rect.y && point.y <= rect.y + rect.height;
    if (!inside) return;
    dragOffsetRef.current = { x: point.x - rect.x, y: point.y - rect.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [cameraVisible, hasCamera, mode]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const offset = dragOffsetRef.current;
    if (!offset) return;
    const point = pointFromPointer(event);
    setCustomPosition({ x: point.x - offset.x, y: point.y - offset.y });
  }, [setCustomPosition]);

  const finishPointerDrag = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    dragOffsetRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 32 : 8;
    const movement = getArrowMovement(event.key, step);
    if (!movement) return;
    event.preventDefault();
    nudgePip(movement[0], movement[1]);
  }, [nudgePip]);

  return {
    pipPosition,
    pipRect,
    customPositionRef,
    publishRenderedRect,
    setPipPosition,
    nudgePip,
    canvasPointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointerDrag,
      onPointerCancel: finishPointerDrag,
      onKeyDown,
    },
  };
}
