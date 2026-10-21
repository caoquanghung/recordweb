import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  OnProgressParameters,
  RenderTask,
  TextLayer,
} from 'pdfjs-dist';
import type {
  PresentationLoadProgress,
  PresentationRenderer,
} from './presentationRenderer';

export class PdfPresentationRenderer implements PresentationRenderer {
  readonly kind = 'pdf' as const;
  private readonly activeRenderTasks = new Set<RenderTask>();
  private activeTextLayer: TextLayer | null = null;
  private interactionResizeObserver: ResizeObserver | null = null;
  private interactionVersion = 0;

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

  private clearInteractionLayer() {
    this.interactionVersion += 1;
    this.activeTextLayer?.cancel();
    this.activeTextLayer = null;
    this.interactionResizeObserver?.disconnect();
    this.interactionResizeObserver = null;
  }

  private async destinationPageIndex(destination: string | unknown[]) {
    const explicitDestination = typeof destination === 'string'
      ? await this.document.getDestination(destination)
      : destination;
    const pageReference = explicitDestination?.[0];
    if (typeof pageReference === 'number') return pageReference;
    if (!pageReference || typeof pageReference !== 'object') return null;
    return this.document.getPageIndex(pageReference as { num: number; gen: number });
  }

  async renderInteractionLayer(
    pageIndex: number,
    container: HTMLDivElement,
    width: number,
    onNavigate: (pageIndex: number) => void,
  ) {
    if (pageIndex < 0 || pageIndex >= this.pageCount) return;
    this.clearInteractionLayer();
    const interactionVersion = this.interactionVersion;
    container.replaceChildren();

    const page = await this.document.getPage(pageIndex + 1);
    const initialViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / initialViewport.width });
    const content = document.createElement('div');
    content.dataset.pdfInteractionContent = '';
    content.style.width = `${viewport.width}px`;
    content.style.height = `${viewport.height}px`;

    const textLayerElement = document.createElement('div');
    textLayerElement.dataset.pdfTextLayer = '';
    textLayerElement.style.setProperty('--scale-factor', `${viewport.scale}`);
    textLayerElement.style.setProperty('--user-unit', `${viewport.userUnit}`);
    textLayerElement.style.setProperty(
      '--total-scale-factor',
      'calc(var(--scale-factor) * var(--user-unit))',
    );
    content.append(textLayerElement);

    const pdfjs = await import('pdfjs-dist');
    const textLayer = new pdfjs.TextLayer({
      textContentSource: page.streamTextContent(),
      container: textLayerElement,
      viewport,
    });
    this.activeTextLayer = textLayer;

    try {
      const [, annotations] = await Promise.all([
        textLayer.render(),
        page.getAnnotations({ intent: 'display' }),
      ]);
      if (interactionVersion !== this.interactionVersion) return;

      const linkLayer = document.createElement('div');
      linkLayer.dataset.pdfLinkLayer = '';
      for (const annotation of annotations) {
        if (annotation.subtype !== 'Link' || !Array.isArray(annotation.rect)) continue;
        const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
        const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
        const link = document.createElement('a');
        link.dataset.pdfLink = '';
        link.style.left = `${Math.min(x1, x2)}px`;
        link.style.top = `${Math.min(y1, y2)}px`;
        link.style.width = `${Math.abs(x2 - x1)}px`;
        link.style.height = `${Math.abs(y2 - y1)}px`;
        link.setAttribute('aria-label', annotation.titleObj?.str || 'Open PDF link');

        if (typeof annotation.url === 'string') {
          try {
            const url = new URL(annotation.url);
            if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) continue;
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
          } catch {
            continue;
          }
        } else if (typeof annotation.dest === 'string' || Array.isArray(annotation.dest)) {
          link.href = '#';
          link.addEventListener('click', (event) => {
            event.preventDefault();
            void this.destinationPageIndex(annotation.dest)
              .then((destinationIndex) => {
                if (destinationIndex !== null) onNavigate(destinationIndex);
              })
              .catch(() => undefined);
          });
        } else {
          continue;
        }
        linkLayer.append(link);
      }
      content.append(linkLayer);
      container.replaceChildren(content);

      const resizeContent = () => {
        const scaleX = container.clientWidth / Math.max(1, viewport.width);
        const scaleY = container.clientHeight / Math.max(1, viewport.height);
        content.style.transform = `scale(${scaleX}, ${scaleY})`;
      };
      resizeContent();
      this.interactionResizeObserver = typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(resizeContent);
      this.interactionResizeObserver?.observe(container);
    } finally {
      page.cleanup();
    }
  }

  async dispose() {
    this.clearInteractionLayer();
    this.activeRenderTasks.forEach((task) => task.cancel());
    this.activeRenderTasks.clear();
    await this.loadingTask.destroy();
  }
}

