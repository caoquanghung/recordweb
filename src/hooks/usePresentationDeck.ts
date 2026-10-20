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
  isReplacing: boolean;
  canAdvance: boolean;
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
  const playbackAdvancePendingRef = useRef(false);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<PresentationDeckStatus>('idle');
  const [metadata, setMetadata] = useState<PresentationFileMetadata | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [hasPendingPlaybackSteps, setHasPendingPlaybackSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setCanvasElement = useCallback((element: HTMLCanvasElement | null) => {
    canvasElementRef.current = element;
    setCanvas(element);
  }, []);

  const disposeCurrentRenderer = useCallback(() => {
    const renderer = rendererRef.current;
    rendererRef.current = null;
    if (renderer) void renderer.dispose().catch(() => undefined);
  }, []);

  const clear = useCallback(() => {
    operationIdRef.current += 1;
    playbackAdvancePendingRef.current = false;
    disposeCurrentRenderer();
    setStatus('idle');
    setMetadata(null);
    setCurrentPageIndex(0);
    setProgress(0);
    setProgressMessage('');
    setIsRendering(false);
    setIsReplacing(false);
    setHasPendingPlaybackSteps(false);
    setError(null);
    const activeCanvas = canvasElementRef.current;
    if (activeCanvas) {
      const context = activeCanvas.getContext('2d');
      context?.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    }
  }, [disposeCurrentRenderer]);

  const load = useCallback(async (file: File) => {
    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    const previousRenderer = rendererRef.current;
    const replacingActiveDeck = Boolean(previousRenderer && metadata);

    if (replacingActiveDeck) {
      setIsReplacing(true);
    } else {
      setStatus('validating');
      setMetadata(null);
      setCurrentPageIndex(0);
      setHasPendingPlaybackSteps(false);
    }
    setProgress(0);
    setProgressMessage(replacingActiveDeck ? 'Validating replacement…' : 'Validating presentation…');
    setError(null);
    let candidateRenderer: PresentationRenderer | null = null;

    try {
      const kind = await validatePresentationFile(file);
      if (operationId !== operationIdRef.current) return false;
      if (!replacingActiveDeck) setStatus('loading');
      candidateRenderer = await createPresentationRenderer(kind, file, (nextProgress, message) => {
        if (operationId !== operationIdRef.current) return;
        setProgress(Math.round(Math.min(1, Math.max(0, nextProgress)) * 100));
        setProgressMessage(message);
      });

      if (operationId !== operationIdRef.current) {
        await candidateRenderer.dispose();
        return false;
      }
      if (candidateRenderer.pageCount > MAX_PRESENTATION_PAGES) {
        throw new Error(`The presentation exceeds the ${MAX_PRESENTATION_PAGES}-page limit.`);
      }

      setProgressMessage('Preparing the first slide…');
      const preparedCanvas = document.createElement('canvas');
      await candidateRenderer.renderPage(0, preparedCanvas, renderWidth);
      if (operationId !== operationIdRef.current) {
        await candidateRenderer.dispose();
        return false;
      }

      const activeCanvas = canvasElementRef.current;
      if (activeCanvas) {
        const context = activeCanvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas 2D rendering is unavailable.');
        activeCanvas.width = preparedCanvas.width;
        activeCanvas.height = preparedCanvas.height;
        context.drawImage(preparedCanvas, 0, 0);
      }

      renderRequestIdRef.current += 1;
      rendererRef.current = candidateRenderer;
      candidateRenderer = null;
      playbackAdvancePendingRef.current = false;
      setMetadata({
        name: file.name,
        kind,
        sizeBytes: file.size,
        pageCount: rendererRef.current.pageCount,
      });
      setCurrentPageIndex(0);
      setHasPendingPlaybackSteps(false);
      setProgress(100);
      setProgressMessage('Presentation ready');
      setStatus('ready');
      setIsReplacing(false);
      if (previousRenderer && previousRenderer !== rendererRef.current) {
        void previousRenderer.dispose().catch(() => undefined);
      }
      return true;
    } catch (cause) {
      if (candidateRenderer) await candidateRenderer.dispose().catch(() => undefined);
      if (operationId !== operationIdRef.current) return false;
      if (replacingActiveDeck && rendererRef.current === previousRenderer) {
        setStatus('ready');
        setProgress(0);
        setProgressMessage('Current presentation remains active.');
      } else {
        setStatus('error');
        setProgressMessage('');
      }
      setIsReplacing(false);
      setError(toErrorMessage(cause));
      return false;
    }
  }, [metadata, renderWidth]);

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
        const renderer = rendererRef.current;
        if (renderer?.presentPage) {
          await renderer.presentPage(currentPageIndex, canvas, renderWidth);
          if (!cancelled && renderRequestId === renderRequestIdRef.current) {
            setHasPendingPlaybackSteps(Boolean(renderer.hasPendingPlaybackSteps?.()));
          }
        } else {
          await renderInto(
            currentPageIndex,
            canvas,
            renderWidth,
            () => !cancelled && renderRequestId === renderRequestIdRef.current,
          );
        }
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
    const nextPageIndex = Math.min(pageCount - 1, Math.max(0, Math.trunc(pageIndex)));
    if (nextPageIndex === currentPageIndex) return;
    setHasPendingPlaybackSteps(false);
    setCurrentPageIndex(nextPageIndex);
  }, [currentPageIndex]);

  const nextPage = useCallback(() => {
    const renderer = rendererRef.current;
    const pageCount = renderer?.pageCount ?? 0;
    if (!renderer?.advancePlaybackStep) {
      setCurrentPageIndex((current) => Math.min(Math.max(0, pageCount - 1), current + 1));
      return;
    }
    if (playbackAdvancePendingRef.current) return;

    const operationId = operationIdRef.current;
    playbackAdvancePendingRef.current = true;
    setIsRendering(true);
    setError(null);
    void renderer.advancePlaybackStep()
      .then((advanced) => {
        if (operationId !== operationIdRef.current || rendererRef.current !== renderer) return;
        setHasPendingPlaybackSteps(Boolean(renderer.hasPendingPlaybackSteps?.()));
        if (!advanced) {
          setCurrentPageIndex((current) => Math.min(Math.max(0, pageCount - 1), current + 1));
        }
      })
      .catch((cause) => {
        if (operationId === operationIdRef.current) setError(toErrorMessage(cause));
      })
      .finally(() => {
        if (operationId === operationIdRef.current) {
          playbackAdvancePendingRef.current = false;
          setIsRendering(false);
        }
      });
  }, []);

  const previousPage = useCallback(() => {
    if (currentPageIndex <= 0) return;
    setHasPendingPlaybackSteps(false);
    setCurrentPageIndex(currentPageIndex - 1);
  }, [currentPageIndex]);

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
    isReplacing,
    canAdvance: hasPendingPlaybackSteps
      || currentPageIndex < Math.max(0, (metadata?.pageCount ?? 0) - 1),
    error,
    canvasRef: setCanvasElement,
    load,
    clear,
    goToPage,
    nextPage,
    previousPage,
    renderThumbnail,
  };
}

