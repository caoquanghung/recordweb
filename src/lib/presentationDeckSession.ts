import {
  createPresentationRenderer,
  validatePresentationFile,
  type PresentationLoadProgress,
  type PresentationRenderer,
} from '@/lib/presentation';
import {
  MAX_PRESENTATION_PAGES,
  type PresentationFileKind,
} from '@/types/presentation';

export interface PresentationDeckLoadOperation {
  id: number;
  previousRenderer: PresentationRenderer | null;
}

export interface PreparedPresentationDeck {
  kind: PresentationFileKind;
  renderer: PresentationRenderer;
  firstPageCanvas: HTMLCanvasElement;
}

export class PresentationDeckSession {
  private renderer: PresentationRenderer | null = null;
  private operationId = 0;

  get currentRenderer(): PresentationRenderer | null {
    return this.renderer;
  }

  get currentOperationId(): number {
    return this.operationId;
  }

  beginLoad(): PresentationDeckLoadOperation {
    this.operationId += 1;
    return { id: this.operationId, previousRenderer: this.renderer };
  }

  isCurrent(operationId: number): boolean {
    return operationId === this.operationId;
  }

  commit(operationId: number, renderer: PresentationRenderer): boolean {
    if (!this.isCurrent(operationId)) return false;
    this.renderer = renderer;
    return true;
  }

  invalidate(): void {
    this.operationId += 1;
  }

  disposeCurrent(): void {
    const renderer = this.renderer;
    this.renderer = null;
    if (renderer) void renderer.dispose().catch(() => undefined);
  }
}

export async function preparePresentationDeck(
  file: File,
  renderWidth: number,
  onProgress: PresentationLoadProgress,
  shouldContinue: () => boolean,
  onValidated: () => void,
  onPreparingFirstPage: () => void,
): Promise<PreparedPresentationDeck | null> {
  const kind = await validatePresentationFile(file);
  if (!shouldContinue()) return null;
  onValidated();

  let renderer: PresentationRenderer | null = null;
  try {
    renderer = await createPresentationRenderer(kind, file, onProgress);
    if (!shouldContinue()) {
      await renderer.dispose();
      return null;
    }
    if (renderer.pageCount > MAX_PRESENTATION_PAGES) {
      throw new Error(`The presentation exceeds the ${MAX_PRESENTATION_PAGES}-page limit.`);
    }

    onPreparingFirstPage();
    const firstPageCanvas = document.createElement('canvas');
    await renderer.renderPage(0, firstPageCanvas, renderWidth);
    if (!shouldContinue()) {
      await renderer.dispose();
      return null;
    }

    const prepared = { kind, renderer, firstPageCanvas };
    renderer = null;
    return prepared;
  } catch (cause) {
    if (renderer) await renderer.dispose().catch(() => undefined);
    throw cause;
  }
}

export function paintPreparedPage(
  source: HTMLCanvasElement,
  target: HTMLCanvasElement,
): void {
  const context = target.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D rendering is unavailable.');
  target.width = source.width;
  target.height = source.height;
  context.drawImage(source, 0, 0);
}

export async function renderPresentationPage(
  renderer: PresentationRenderer,
  pageIndex: number,
  targetCanvas: HTMLCanvasElement,
  width: number,
  shouldCommit: () => boolean,
): Promise<void> {
  if (pageIndex < 0 || pageIndex >= renderer.pageCount) return;
  const scratchCanvas = document.createElement('canvas');
  await renderer.renderPage(pageIndex, scratchCanvas, width);
  if (!shouldCommit()) return;
  paintPreparedPage(scratchCanvas, targetCanvas);
}
