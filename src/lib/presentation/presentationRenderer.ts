import type { PresentationFileKind } from '@/types/presentation';

export interface PresentationRenderer {
  readonly kind: PresentationFileKind;
  readonly pageCount: number;
  renderPage(pageIndex: number, canvas: HTMLCanvasElement, width: number): Promise<void>;
  presentPage?(pageIndex: number, canvas: HTMLCanvasElement, width: number): Promise<void>;
  advancePlaybackStep?(): Promise<boolean>;
  hasPendingPlaybackSteps?(): boolean;
  dispose(): Promise<void>;
}

export type PresentationLoadProgress = (progress: number, message: string) => void;

