'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from 'react';
import {
  createPresentationRenderer,
  validatePresentationFile,
  type PresentationRenderer,
} from '@/lib/presentation';
import {
  MAX_PRESENTATION_PAGES,
  type PresentationDeckStatus,
  type PresentationFileMetadata,
} from '@/types/presentation';

interface UsePresentationDeckOptions {
  renderWidth?: number;
}

export interface UsePresentationDeckResult {
  status: PresentationDeckStatus;
  metadata: PresentationFileMetadata | null;
  currentPageIndex: number;
  progress: number;
  progressMessage: string;
  isRendering: boolean;
  error: string | null;
  canvasRef: RefCallback<HTMLCanvasElement>;
  load: (file: File) => Promise<boolean>;
  clear: () => void;
  goToPage: (pageIndex: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  renderThumbnail: (pageIndex: number, canvas: HTMLCanvasElement, width?: number) => Promise<void>;
}

function toErrorMessage(cause: unknown) {
  return cause instanceof Error && cause.message
    ? cause.message
    : 'The presentation could not be opened.';
}

export function usePresentationDeck({
  renderWidth = 1920,
}: UsePresentationDeckOptions = {}): UsePresentationDeckResult {
  const rendererRef = useRef<PresentationRenderer | null>(null);
  const operationIdRef = useRef(0);
  const renderRequestIdRef = useRef(0);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<PresentationDeckStatus>('idle');
  const [metadata, setMetadata] = useState<PresentationFileMetadata | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disposeCurrentRenderer = useCallback(() => {
    const renderer = rendererRef.current;
    rendererRef.current = null;
    if (renderer) void renderer.dispose().catch(() => undefined);
  }, []);

  const clear = useCallback(() => {
    operationIdRef.current += 1;
    disposeCurrentRenderer();
    setStatus('idle');
    setMetadata(null);
    setCurrentPageIndex(0);
    setProgress(0);
    setProgressMessage('');
    setIsRendering(false);
    setError(null);
    if (canvas) {
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [canvas, disposeCurrentRenderer]);

  const load = useCallback(async (file: File) => {
    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    disposeCurrentRenderer();
    setStatus('validating');
    setMetadata(null);
    setCurrentPageIndex(0);
    setProgress(0);
    setProgressMessage('Validating presentation…');
    setError(null);

    try {
      const kind = await validatePresentationFile(file);
      if (operationId !== operationIdRef.current) return false;
      setStatus('loading');
      const renderer = await createPresentationRenderer(kind, file, (nextProgress, message) => {
        if (operationId !== operationIdRef.current) return;
        setProgress(Math.round(Math.min(1, Math.max(0, nextProgress)) * 100));
        setProgressMessage(message);
      });

      if (operationId !== operationIdRef.current) {
        await renderer.dispose();
        return false;
      }
      if (renderer.pageCount > MAX_PRESENTATION_PAGES) {
        await renderer.dispose();
        throw new Error(`The presentation exceeds the ${MAX_PRESENTATION_PAGES}-page limit.`);
      }

      rendererRef.current = renderer;
      setMetadata({
        name: file.name,
        kind,
        sizeBytes: file.size,
        pageCount: renderer.pageCount,
      });
      setProgress(100);
      setProgressMessage('Presentation ready');
      setStatus('ready');
      return true;
    } catch (cause) {
      if (operationId !== operationIdRef.current) return false;
      setStatus('error');
      setError(toErrorMessage(cause));
      setProgressMessage('');
      return false;
    }
  }, [disposeCurrentRenderer]);

  const renderInto = useCallback(async (
    pageIndex: number,
    targetCanvas: HTMLCanvasElement,
    width: number,
    shouldCommit: () => boolean = () => true,
  ) => {
    const renderer = rendererRef.current;
    if (!renderer || pageIndex < 0 || pageIndex >= renderer.pageCount) return;
    const operationId = operationIdRef.current;
    const scratchCanvas = document.createElement('canvas');
    await renderer.renderPage(pageIndex, scratchCanvas, width);
    if (
      operationId !== operationIdRef.current
      || rendererRef.current !== renderer
      || !shouldCommit()
    ) return;
    targetCanvas.width = scratchCanvas.width;
    targetCanvas.height = scratchCanvas.height;
    const context = targetCanvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D rendering is unavailable.');
    context.drawImage(scratchCanvas, 0, 0);
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !canvas) return;
    let cancelled = false;
    const renderRequestId = renderRequestIdRef.current + 1;
    renderRequestIdRef.current = renderRequestId;
    const renderCurrentPage = async () => {
      setIsRendering(true);
      setError(null);
      try {
        await renderInto(
          currentPageIndex,
          canvas,
          renderWidth,
          () => !cancelled && renderRequestId === renderRequestIdRef.current,
        );
      } catch (cause) {
        if (!cancelled) setError(toErrorMessage(cause));
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };
    void renderCurrentPage();
    return () => { cancelled = true; };
  }, [canvas, currentPageIndex, renderInto, renderWidth, status]);

  const goToPage = useCallback((pageIndex: number) => {
    const pageCount = rendererRef.current?.pageCount ?? 0;
    if (pageCount <= 0) return;
    setCurrentPageIndex(Math.min(pageCount - 1, Math.max(0, Math.trunc(pageIndex))));
  }, []);

  const nextPage = useCallback(() => {
    const pageCount = rendererRef.current?.pageCount ?? 0;
    setCurrentPageIndex((current) => Math.min(Math.max(0, pageCount - 1), current + 1));
  }, []);

  const previousPage = useCallback(() => {
    setCurrentPageIndex((current) => Math.max(0, current - 1));
  }, []);

  const renderThumbnail = useCallback(async (
    pageIndex: number,
    targetCanvas: HTMLCanvasElement,
    width = 240,
  ) => {
    await renderInto(pageIndex, targetCanvas, width);
  }, [renderInto]);

  useEffect(() => () => {
    operationIdRef.current += 1;
    disposeCurrentRenderer();
  }, [disposeCurrentRenderer]);

  return {
    status,
    metadata,
    currentPageIndex,
    progress,
    progressMessage,
    isRendering,
    error,
    canvasRef: setCanvas,
    load,
    clear,
    goToPage,
    nextPage,
    previousPage,
    renderThumbnail,
  };
}

