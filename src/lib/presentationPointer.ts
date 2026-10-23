import type { PresentationCursorVisualState } from '@/types/presentation';

export interface PresentationPointerSnapshot extends PresentationCursorVisualState {
  sourceWidth: number;
  sourceHeight: number;
  clientX: number;
  clientY: number;
}

export const EMPTY_PRESENTATION_POINTER: PresentationPointerSnapshot = {
  x: 0,
  y: 0,
  visible: false,
  pressed: false,
  sourceWidth: 1,
  sourceHeight: 1,
  clientX: 0,
  clientY: 0,
};

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizePointer(
  target: HTMLElement,
  clientX: number,
  clientY: number,
  visible: boolean,
  pressed: boolean,
): PresentationPointerSnapshot {
  const bounds = target.getBoundingClientRect();
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  return {
    x: clampUnit((clientX - bounds.left) / width),
    y: clampUnit((clientY - bounds.top) / height),
    visible,
    pressed,
    sourceWidth: Math.round(width),
    sourceHeight: Math.round(height),
    clientX,
    clientY,
  };
}

export function observePresentationPointer(
  target: HTMLElement,
  onChange: (pointer: PresentationPointerSnapshot) => void,
): () => void {
  let pointer = EMPTY_PRESENTATION_POINTER;
  let boundsFrame: number | null = null;

  const publish = (next: PresentationPointerSnapshot) => {
    pointer = next;
    onChange(next);
  };
  const updateFromEvent = (event: PointerEvent, visible: boolean) => {
    publish(normalizePointer(
      target,
      event.clientX,
      event.clientY,
      visible,
      pointer.pressed,
    ));
  };
  const syncToBounds = () => {
    if (boundsFrame !== null) window.cancelAnimationFrame(boundsFrame);
    boundsFrame = window.requestAnimationFrame(() => {
      boundsFrame = null;
      publish(normalizePointer(
        target,
        pointer.clientX,
        pointer.clientY,
        pointer.visible,
        pointer.pressed,
      ));
    });
  };
  const handlePointerMove = (event: PointerEvent) => updateFromEvent(event, true);
  const handlePointerEnter = (event: PointerEvent) => updateFromEvent(event, true);
  const handlePointerLeave = () => publish({ ...pointer, visible: false, pressed: false });
  const handlePointerDown = (event: PointerEvent) => {
    pointer = { ...pointer, pressed: true };
    updateFromEvent(event, true);
  };
  const handlePointerUp = (event: PointerEvent) => {
    pointer = { ...pointer, pressed: false };
    updateFromEvent(event, true);
  };

  target.addEventListener('pointermove', handlePointerMove);
  target.addEventListener('pointerenter', handlePointerEnter);
  target.addEventListener('pointerleave', handlePointerLeave);
  target.addEventListener('pointerdown', handlePointerDown);
  target.addEventListener('pointerup', handlePointerUp);
  target.addEventListener('pointercancel', handlePointerLeave);
  window.addEventListener('blur', handlePointerLeave);
  window.addEventListener('resize', syncToBounds);
  document.addEventListener('fullscreenchange', syncToBounds);
  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(syncToBounds);
  resizeObserver?.observe(target);
  syncToBounds();

  return () => {
    target.removeEventListener('pointermove', handlePointerMove);
    target.removeEventListener('pointerenter', handlePointerEnter);
    target.removeEventListener('pointerleave', handlePointerLeave);
    target.removeEventListener('pointerdown', handlePointerDown);
    target.removeEventListener('pointerup', handlePointerUp);
    target.removeEventListener('pointercancel', handlePointerLeave);
    window.removeEventListener('blur', handlePointerLeave);
    window.removeEventListener('resize', syncToBounds);
    document.removeEventListener('fullscreenchange', syncToBounds);
    resizeObserver?.disconnect();
    if (boundsFrame !== null) window.cancelAnimationFrame(boundsFrame);
  };
}
