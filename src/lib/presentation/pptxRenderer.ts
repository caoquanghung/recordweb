import type { PptxPlayer, PptxRenderer } from 'pptx-browser';
import type {
  PresentationLoadProgress,
  PresentationRenderer,
} from './presentationRenderer';

export class PptxPresentationRenderer implements PresentationRenderer {
  readonly kind = 'pptx' as const;
  private player: PptxPlayer | null = null;
  private playerCanvas: HTMLCanvasElement | null = null;
  private activePageIndex: number | null = null;
  private playerClickGroup = 0;
  private remainingClickGroups: number[] = [];

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

  async presentPage(pageIndex: number, canvas: HTMLCanvasElement, width: number) {
    let player = this.player;
    if (!player || this.playerCanvas !== canvas) {
      player?.pause();
      await this.renderer.renderSlide(pageIndex, canvas, width);
      player = this.renderer.createPlayer(canvas);
      this.player = player;
      this.playerCanvas = canvas;
      await player.loadSlide(pageIndex);
    } else if (this.activePageIndex !== pageIndex) {
      if (this.renderer.getTransition(pageIndex)) {
        await player.transitionTo(pageIndex);
      } else {
        await player.loadSlide(pageIndex);
      }
    } else {
      return;
    }

    this.activePageIndex = pageIndex;
    this.playerClickGroup = 0;
    this.remainingClickGroups = [...new Set(
      this.renderer
        .getAnimations(pageIndex)
        .map((step) => step.clickNum)
        .filter((clickNum) => clickNum > 0),
    )].sort((left, right) => left - right);
  }

  async advancePlaybackStep() {
    const player = this.player;
    const nextClickGroup = this.remainingClickGroups[0];
    if (!player || nextClickGroup === undefined) return false;

    while (this.playerClickGroup < nextClickGroup) {
      await player.nextClick();
      this.playerClickGroup += 1;
    }
    this.remainingClickGroups.shift();
    return true;
  }

  hasPendingPlaybackSteps() {
    return this.remainingClickGroups.length > 0;
  }

  async dispose() {
    this.player?.pause();
    this.player = null;
    this.playerCanvas = null;
    this.activePageIndex = null;
    this.remainingClickGroups = [];
    this.renderer.destroy();
  }
}

