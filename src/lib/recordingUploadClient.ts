import { upload, uploadPresigned } from '@vercel/blob/client';
import { getRecordingDraft, saveRecordingDraft, updateRecordingDraft } from '@/lib/idb';
import { buildUploadManifest, UPLOAD_KINDS } from '@/lib/recordingUploadProtocol';
import type { DbRecording } from '@/types/database';
import type { RecordingAssetMetadata, RecordingMetadata } from '@/types/recording';

export function createRecordingUploadJob({ recording, ownerUserId, settings, onPhase, onProgress }: {
  recording: RecordingMetadata;
  ownerUserId: string;
  settings: Record<string, unknown>;
  onPhase: (phase: 'uploading' | 'saving') => void;
  onProgress: (progress: number) => void;
}) {
  const id = crypto.randomUUID();
  const controller = new AbortController();
  const localId = recording.localId ?? recording.id;
  const localAssets = UPLOAD_KINDS.flatMap((kind) => {
    const asset = recording.assets?.[kind] ?? (kind === 'composite' && recording.blob ? {
      kind, blob: recording.blob, fileSizeBytes: recording.blob.size, mimeType: recording.mimeType,
      resolution: recording.resolution, fps: recording.fps,
    } : undefined);
    return asset?.blob ? [asset as RecordingAssetMetadata & { blob: Blob }] : [];
  });
  const assets = localAssets.map((asset) => ({ kind: asset.kind, mimeType: asset.mimeType, size: asset.blob.size }));
  const manifest = buildUploadManifest(id, assets);
  const cancelBody = JSON.stringify({ action: 'cancel', id, localId, assets });
  let finished = false;
  let cancelled = false;

  const cancel = async (userRequested = true) => {
    if (finished) return;
    if (userRequested) cancelled = true;
    controller.abort();
    // Durable cancellation is quick; Blob deletion continues server-side after response.
    try {
      await fetch('/api/recording-uploads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cancelBody,
        keepalive: true, signal: AbortSignal.timeout(5000),
      });
    } catch {
      // The server lease + scheduled cleanup cover a disconnected/terminated page.
    }
  };
  const cancelOnExit = () => {
    if (finished) return;
    cancelled = true;
    controller.abort();
    const body = new Blob([cancelBody], { type: 'application/json' });
    if (!navigator.sendBeacon('/api/recording-uploads', body)) {
      void fetch('/api/recording-uploads', { method: 'POST', body, keepalive: true }).catch(() => undefined);
    }
  };
  const run = async (): Promise<DbRecording> => {
    let heartbeat: number | undefined;
    try {
      const previous = await getRecordingDraft(recording.id);
      if (previous?.ownerUserId && previous.ownerUserId !== ownerUserId) throw new Error('This backup belongs to another account.');
      const uploadSettings = previous?.uploadSettings ?? settings;
      // Also upgrades a legacy recovered draft to a complete backup before uploading.
      await saveRecordingDraft({
        id: recording.id, startedAt: recording.createdAt, durationMs: recording.durationSeconds * 1000,
        ownerUserId, recording: { ...recording, previewUrl: undefined }, uploadSettings, uploadAttemptId: id,
      });
      controller.signal.throwIfAborted();
      onPhase('uploading');
      const response = await fetch('/api/recording-uploads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', id, localId, assets }), signal: controller.signal,
      });
      const started = await response.json();
      if (!response.ok) throw new Error(started.error ?? 'Could not start saving this recording.');
      let saved: DbRecording;
      if (started.recording) {
        // Lost completion responses must never cause another upload or deletion.
        saved = started.recording;
      } else {
        heartbeat = window.setInterval(() => {
          void fetch('/api/recording-uploads', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'heartbeat', id }), signal: controller.signal,
          }).then((result) => { if (result.status === 409) controller.abort(); }).catch(() => undefined);
        }, 60_000);
        const configResponse = await fetch('/api/upload', { cache: 'no-store', signal: controller.signal });
        const config = await configResponse.json();
        if (!configResponse.ok || !['client-token', 'presigned'].includes(config.uploadMethod)) {
          throw new Error('Could not determine the recording upload method.');
        }
        const uploadToBlob = config.uploadMethod === 'presigned' ? uploadPresigned : upload;
        const progress = new Map<string, number>();
        await Promise.all(localAssets.map(async (asset) => {
          const expected = manifest.find((item) => item.kind === asset.kind)!;
          await uploadToBlob(expected.pathname, asset.blob, {
            access: 'public', handleUploadUrl: '/api/upload', contentType: expected.contentType,
            multipart: true, abortSignal: controller.signal,
            onUploadProgress: ({ percentage }) => {
              progress.set(asset.kind, percentage);
              onProgress(Math.round(localAssets.reduce((sum, item) => sum + (progress.get(item.kind) ?? 0), 0) / localAssets.length));
            },
          });
        }));
        controller.signal.throwIfAborted();
        onPhase('saving');
        const completed = await fetch('/api/recordings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({
            attempt_id: id, title: recording.title || `Recording ${recording.id}`,
            recorded_at: recording.createdAt, duration_seconds: recording.durationSeconds,
            settings: uploadSettings,
            assets: localAssets.map((asset) => ({
              kind: asset.kind, resolution: asset.resolution ?? null, fps: asset.fps ?? null,
              sample_rate_hz: asset.sampleRateHz ?? null,
              metadata: asset.waveformPeaks ? { waveformPeaks: asset.waveformPeaks, waveformVersion: 1 } : {},
            })),
          }),
        });
        const data = await completed.json();
        if (!completed.ok || !data.recording) throw new Error(data.error ?? 'Could not finish saving this recording.');
        saved = data.recording;
      }
      finished = true;
      await updateRecordingDraft(recording.id, { cloudRecordingId: saved.id });
      return saved;
    } catch (error) {
      if (!finished) await cancel(false);
      throw error;
    } finally {
      window.clearInterval(heartbeat);
    }
  };
  return { id, run, cancel, cancelOnExit, get cancelled() { return cancelled; } };
}

export type RecordingUploadJob = ReturnType<typeof createRecordingUploadJob>;
