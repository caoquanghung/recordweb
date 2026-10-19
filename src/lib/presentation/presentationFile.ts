import {
  MAX_PRESENTATION_FILE_BYTES,
  type PresentationFileKind,
} from '@/types/presentation';

const PDF_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/octet-stream',
]);
const PPTX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

function extensionOf(fileName: string) {
  const separator = fileName.lastIndexOf('.');
  return separator >= 0 ? fileName.slice(separator + 1).toLowerCase() : '';
}

function hasPdfSignature(bytes: Uint8Array) {
  const header = new TextDecoder('latin1').decode(bytes);
  return header.includes('%PDF-');
}

function hasZipSignature(bytes: Uint8Array) {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x50
    && bytes[1] === 0x4b
    && (
      (bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08)
    );
}

export async function validatePresentationFile(file: File): Promise<PresentationFileKind> {
  if (file.size <= 0) throw new Error('The presentation file is empty.');
  if (file.size > MAX_PRESENTATION_FILE_BYTES) {
    throw new Error('The presentation file exceeds the 50 MB limit.');
  }

  const extension = extensionOf(file.name);
  if (extension !== 'pdf' && extension !== 'pptx') {
    throw new Error('Choose a PDF or PPTX presentation file.');
  }

  const signature = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (extension === 'pdf') {
    if (file.type && !PDF_MIME_TYPES.has(file.type)) {
      throw new Error('The selected file does not report a PDF content type.');
    }
    if (!hasPdfSignature(signature)) throw new Error('The selected PDF has an invalid file signature.');
    return 'pdf';
  }

  if (file.type && !PPTX_MIME_TYPES.has(file.type)) {
    throw new Error('The selected file does not report a PPTX content type.');
  }
  if (!hasZipSignature(signature)) throw new Error('The selected PPTX has an invalid ZIP signature.');
  return 'pptx';
}

