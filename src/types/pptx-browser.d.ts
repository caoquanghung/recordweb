declare module 'pptx-browser' {
  export type PptxSource = File | Blob | ArrayBuffer | Uint8Array;

  export interface PptxAnimationStep {
    clickNum: number;
    delay: number;
    duration: number;
    shapeId: string;
    type: 'entrance' | 'exit' | 'emphasis' | 'media';
    effect: string;
    dir: string;
  }

  export interface PptxPlayer {
    loadSlide(slideIndex: number): Promise<void>;
    nextClick(): Promise<void>;
    transitionTo(slideIndex: number): Promise<void>;
    play(autoAdvanceMs?: number): Promise<void>;
    pause(): void;
    stop(): Promise<void>;
  }

  export class PptxRenderer {
    slideCount: number;
    load(
      source: PptxSource,
      onProgress?: (progress: number, message: string) => void,
    ): Promise<void>;
    renderSlide(
      slideIndex: number,
      canvas: HTMLCanvasElement,
      width?: number,
    ): Promise<void>;
    getAnimations(slideIndex: number): PptxAnimationStep[];
    getTransition(slideIndex: number): {
      type: string;
      duration: number;
      dir: string;
    } | null;
    createPlayer(canvas: HTMLCanvasElement): PptxPlayer;
    destroy(): void;
  }

  export default PptxRenderer;
}

