import type { PresentationFileKind } from '@/types/presentation';
import { PdfPresentationRenderer } from './pdfRenderer';
import { PptxPresentationRenderer } from './pptxRenderer';
import type {
  PresentationLoadProgress,
  PresentationRenderer,
} from './presentationRenderer';

export type { PresentationLoadProgress, PresentationRenderer } from './presentationRenderer';
export { validatePresentationFile } from './presentationFile';

export function createPresentationRenderer(
  kind: PresentationFileKind,
  file: File,
  onProgress: PresentationLoadProgress,
): Promise<PresentationRenderer> {
  return kind === 'pdf'
    ? PdfPresentationRenderer.create(file, onProgress)
    : PptxPresentationRenderer.create(file, onProgress);
}

