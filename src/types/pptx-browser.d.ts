declare module 'pptx-browser' {
  export type PptxSource = File | Blob | ArrayBuffer | Uint8Array;

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
    destroy(): void;
  }

  export default PptxRenderer;
}

