'use client';

import type { AdminDownloadManifest } from '@/types/adminLibrary';

export async function fetchAdminJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Không thể hoàn tất yêu cầu.');
  return data as T;
}

export async function saveAdminDownload(
  name: string,
  manifests: AsyncIterable<AdminDownloadManifest>,
  signal: AbortSignal,
  onProgress: (name: string) => void,
  singleFile = false,
) {
  const picker = (window as Window & {
    showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
  }).showSaveFilePicker;
  // Open the native destination while the original click still has activation.
  const handle = picker ? await picker.call(window, { suggestedName: name }) : null;
  async function* entries() {
    for await (const manifest of manifests) {
      for (const file of manifest.files) {
        signal.throwIfAborted();
        onProgress(file.name);
        const input = file.url ? await fetch(file.url, { signal }) : new Response(file.text ?? '');
        if (!input.ok || !input.body) throw new Error(`Không thể tải ${file.name}.`);
        yield { name: file.name, input };
      }
    }
  }
  let response: Response;
  if (singleFile) {
    const first = await entries().next();
    if (first.done) throw new Error('Không có file để tải.');
    response = first.value.input;
  } else {
    const { downloadZip } = await import('client-zip');
    response = downloadZip(entries());
  }
  if (handle) {
    const writable = await handle.createWritable();
    await response.body!.pipeTo(writable, { signal });
    return;
  }
  // Browsers without a disk writer need a Blob. Bound that fallback rather than
  // buffering an unbounded research archive in renderer memory.
  let bytes = 0;
  const bounded = response.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > 256 * 1024 * 1024) throw new Error('Tệp trên 256 MB: dùng Chrome hoặc Edge để lưu trực tiếp ra ổ đĩa.');
      controller.enqueue(chunk);
    },
  }), { signal });
  const blob = await new Response(bounded).blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

