import type { PptxRenderer } from 'pptx-browser';
import type {
  PresentationLoadProgress,
  PresentationRenderer,
} from './presentationRenderer';

export class PptxPresentationRenderer implements PresentationRenderer {
  readonly kind = 'pptx' as const;

  private constructor(private readonly renderer: PptxRenderer) {}

  static async create(
    file: File,
    onProgress: PresentationLoadProgress,
  ): Promise<PptxPresentationRenderer> {
    onProgress(0.05, 'Loading PPTX renderer…');
    const { PptxRenderer } = await import('pptx-browser');
    const renderer = new PptxRenderer();
    try {
      await renderer.load(file, onProgress);
      if (renderer.slideCount <= 0) throw new Error('The PPTX does not contain any slides.');
      return new PptxPresentationRenderer(renderer);
    } catch (cause) {
      renderer.destroy();
      throw cause;
    }
  }

  get pageCount() {
    return this.renderer.slideCount;
  }

  renderPage(pageIndex: number, canvas: HTMLCanvasElement, width: number) {
    return this.renderer.renderSlide(pageIndex, canvas, width);
  }

  async dispose() {
    this.renderer.destroy();
  }
}

