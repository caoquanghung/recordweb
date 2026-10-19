import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  OnProgressParameters,
  RenderTask,
} from 'pdfjs-dist';
import type {
  PresentationLoadProgress,
  PresentationRenderer,
} from './presentationRenderer';

export class PdfPresentationRenderer implements PresentationRenderer {
  readonly kind = 'pdf' as const;
  private readonly activeRenderTasks = new Set<RenderTask>();

  private constructor(
    private readonly loadingTask: PDFDocumentLoadingTask,
    private readonly document: PDFDocumentProxy,
  ) {}

  static async create(
    file: File,
    onProgress: PresentationLoadProgress,
  ): Promise<PdfPresentationRenderer> {
    onProgress(0.05, 'Loading PDF renderer…');
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();

    const data = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({
      data,
      enableXfa: false,
    });
    loadingTask.onProgress = ({ loaded, total }: OnProgressParameters) => {
      const ratio = total > 0 ? loaded / total : 0;
      onProgress(Math.min(0.95, 0.1 + ratio * 0.85), 'Parsing PDF…');
    };

    try {
      const document = await loadingTask.promise;
      onProgress(1, 'PDF ready');
      return new PdfPresentationRenderer(loadingTask, document);
    } catch (cause) {
      await loadingTask.destroy();
      if (cause instanceof Error && cause.name === 'PasswordException') {
        throw new Error('Password-protected PDFs are not supported.');
      }
      throw cause;
    }
  }

  get pageCount() {
    return this.document.numPages;
  }

  async renderPage(pageIndex: number, canvas: HTMLCanvasElement, width: number) {
    if (pageIndex < 0 || pageIndex >= this.pageCount) {
      throw new RangeError(`PDF page ${pageIndex + 1} is out of range.`);
    }
    const page = await this.document.getPage(pageIndex + 1);
    const initialViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / initialViewport.width });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const renderTask = page.render({ canvas, viewport, background: '#ffffff' });
    this.activeRenderTasks.add(renderTask);
    try {
      await renderTask.promise;
    } finally {
      this.activeRenderTasks.delete(renderTask);
      page.cleanup();
    }
  }

  async dispose() {
    this.activeRenderTasks.forEach((task) => task.cancel());
    this.activeRenderTasks.clear();
    await this.loadingTask.destroy();
  }
}

