'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from 'react';
import {
  paintPreparedPage,
  preparePresentationDeck,
  PresentationDeckSession,
  renderPresentationPage,
} from '@/lib/presentationDeckSession';
import {
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
  interactionLayerRef: RefCallback<HTMLDivElement>;
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
  const [deckSession] = useState(() => new PresentationDeckSession());
  const renderRequestIdRef = useRef(0);
  const playbackAdvancePendingRef = useRef(false);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const interactionLayerElementRef = useRef<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [interactionLayer, setInteractionLayer] = useState<HTMLDivElement | null>(null);
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

  const setInteractionLayerElement = useCallback((element: HTMLDivElement | null) => {
    interactionLayerElementRef.current = element;
    setInteractionLayer(element);
  }, []);

  const disposeCurrentRenderer = useCallback(() => {
    deckSession.disposeCurrent();
  }, [deckSession]);

  const clear = useCallback(() => {
    deckSession.invalidate();
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
    interactionLayerElementRef.current?.replaceChildren();
  }, [deckSession, disposeCurrentRenderer]);

  const load = useCallback(async (file: File) => {
    const operation = deckSession.beginLoad();
    const { id: operationId, previousRenderer } = operation;
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
    try {
      const prepared = await preparePresentationDeck(
        file,
        renderWidth,
        (nextProgress, message) => {
          if (!deckSession.isCurrent(operationId)) return;
          setProgress(Math.round(Math.min(1, Math.max(0, nextProgress)) * 100));
          setProgressMessage(message);
        },
        () => deckSession.isCurrent(operationId),
        () => {
          if (!replacingActiveDeck) setStatus('loading');
        },
        () => setProgressMessage('Preparing the first slide…'),
      );
      if (!prepared) return false;

      const activeCanvas = canvasElementRef.current;
      try {
        if (activeCanvas) paintPreparedPage(prepared.firstPageCanvas, activeCanvas);
      } catch (cause) {
        await prepared.renderer.dispose().catch(() => undefined);
        throw cause;
      }

      renderRequestIdRef.current += 1;
      if (!deckSession.commit(operationId, prepared.renderer)) {
        await prepared.renderer.dispose();
        return false;
      }
      playbackAdvancePendingRef.current = false;
      setMetadata({
        name: file.name,
        kind: prepared.kind,
        sizeBytes: file.size,
        pageCount: prepared.renderer.pageCount,
      });
      setCurrentPageIndex(0);
      setHasPendingPlaybackSteps(false);
      setProgress(100);
      setProgressMessage('Presentation ready');
      setStatus('ready');
      setIsReplacing(false);
      if (previousRenderer && previousRenderer !== prepared.renderer) {
        void previousRenderer.dispose().catch(() => undefined);
      }
      return true;
    } catch (cause) {
      if (!deckSession.isCurrent(operationId)) return false;
      if (replacingActiveDeck && deckSession.currentRenderer === previousRenderer) {
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
  }, [deckSession, metadata, renderWidth]);

  const renderInto = useCallback(async (
    pageIndex: number,
    targetCanvas: HTMLCanvasElement,
    width: number,
    shouldCommit: () => boolean = () => true,
  ) => {
    const renderer = deckSession.currentRenderer;
    if (!renderer || pageIndex < 0 || pageIndex >= renderer.pageCount) return;
    const operationId = deckSession.currentOperationId;
    await renderPresentationPage(
      renderer,
      pageIndex,
      targetCanvas,
      width,
      () => deckSession.isCurrent(operationId)
        && deckSession.currentRenderer === renderer
        && shouldCommit(),
    );
  }, [deckSession]);

  useEffect(() => {
    if (status !== 'ready' || !canvas) return;
    let cancelled = false;
    const renderRequestId = renderRequestIdRef.current + 1;
    renderRequestIdRef.current = renderRequestId;
    const renderCurrentPage = async () => {
      setIsRendering(true);
      setError(null);
      try {
        const renderer = deckSession.currentRenderer;
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
  }, [canvas, currentPageIndex, deckSession, renderInto, renderWidth, status]);

  const goToPage = useCallback((pageIndex: number) => {
    const pageCount = deckSession.currentRenderer?.pageCount ?? 0;
    if (pageCount <= 0) return;
    const nextPageIndex = Math.min(pageCount - 1, Math.max(0, Math.trunc(pageIndex)));
    if (nextPageIndex === currentPageIndex) return;
    setHasPendingPlaybackSteps(false);
    setCurrentPageIndex(nextPageIndex);
  }, [currentPageIndex, deckSession]);

  useEffect(() => {
    if (status !== 'ready' || !interactionLayer) return;
    const renderer = deckSession.currentRenderer;
    interactionLayer.replaceChildren();
    if (!renderer?.renderInteractionLayer) return;
    let cancelled = false;
    void renderer.renderInteractionLayer(
      currentPageIndex,
      interactionLayer,
      renderWidth,
      (pageIndex) => {
        if (!cancelled && deckSession.currentRenderer === renderer) goToPage(pageIndex);
      },
    ).catch((cause) => {
      if (!cancelled) setError(toErrorMessage(cause));
    });
    return () => { cancelled = true; };
  }, [currentPageIndex, deckSession, goToPage, interactionLayer, metadata, renderWidth, status]);

  const nextPage = useCallback(() => {
    const renderer = deckSession.currentRenderer;
    const pageCount = renderer?.pageCount ?? 0;
    if (!renderer?.advancePlaybackStep) {
      setCurrentPageIndex((current) => Math.min(Math.max(0, pageCount - 1), current + 1));
      return;
    }
    if (playbackAdvancePendingRef.current) return;

    const operationId = deckSession.currentOperationId;
    playbackAdvancePendingRef.current = true;
    setIsRendering(true);
    setError(null);
    void renderer.advancePlaybackStep()
      .then((advanced) => {
        if (!deckSession.isCurrent(operationId) || deckSession.currentRenderer !== renderer) return;
        setHasPendingPlaybackSteps(Boolean(renderer.hasPendingPlaybackSteps?.()));
        if (!advanced) {
          setCurrentPageIndex((current) => Math.min(Math.max(0, pageCount - 1), current + 1));
        }
      })
      .catch((cause) => {
        if (deckSession.isCurrent(operationId)) setError(toErrorMessage(cause));
      })
      .finally(() => {
        if (deckSession.isCurrent(operationId)) {
          playbackAdvancePendingRef.current = false;
          setIsRendering(false);
        }
      });
  }, [deckSession]);

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
    deckSession.invalidate();
    disposeCurrentRenderer();
  }, [deckSession, disposeCurrentRenderer]);

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
    interactionLayerRef: setInteractionLayerElement,
    load,
    clear,
    goToPage,
    nextPage,
    previousPage,
    renderThumbnail,
  };
}

