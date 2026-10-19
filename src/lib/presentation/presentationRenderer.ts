import type { PresentationFileKind } from '@/types/presentation';

export interface PresentationRenderer {
  readonly kind: PresentationFileKind;
  readonly pageCount: number;
  renderPage(pageIndex: number, canvas: HTMLCanvasElement, width: number): Promise<void>;
  dispose(): Promise<void>;
}

export type PresentationLoadProgress = (progress: number, message: string) => void;

