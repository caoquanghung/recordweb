'use client';

import { useEffect, useState } from 'react';
import { usePermission } from '@/components/auth/PermissionProvider';
import { RecordedAudioWaveforms } from './RecordedAudioWaveforms';
import { RecordedCursorTrajectory } from './RecordedCursorTrajectory';
import type { RecordingInspectionData } from './recordingInspection';
import styles from './RecordingDeveloperInspection.module.css';

const ASSET_LABELS: Record<RecordingInspectionData['assets'][number]['kind'], string> = {
  composite: 'Composite video',
  webcam: 'Webcam source',
  screen: 'Screen source',
  audio: 'Mixed audio',
  'microphone-audio': 'Microphone audio',
  'system-audio': 'System audio',
  cursor: 'Cursor trajectory',
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function RecordingDeveloperInspection({
  durationSeconds,
  assets,
  mixed,
  microphone,
  systemAudio,
  cursor,
}: RecordingInspectionData) {
  const canInspect = usePermission('recording-assets:inspect');
  const [remoteCursor, setRemoteCursor] = useState<{
    src: string;
    blob?: Blob;
    error?: string;
  }>();

  useEffect(() => {
    if (!canInspect || cursor?.blob || !cursor?.src) return;

    const controller = new AbortController();
    const cursorSrc = cursor.src;
    void fetch(cursor.src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load cursor trajectory (${response.status}).`);
        return response.blob();
      })
      .then((blob) => setRemoteCursor({ src: cursorSrc, blob }))
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') {
          setRemoteCursor({ src: cursorSrc, error: (error as Error).message });
        }
      });

    return () => controller.abort();
  }, [canInspect, cursor?.blob, cursor?.src]);

  if (!canInspect) return null;
  const currentRemoteCursor = remoteCursor?.src === cursor?.src ? remoteCursor : undefined;
  const cursorBlob = cursor?.blob ?? currentRemoteCursor?.blob;
  const cursorError = currentRemoteCursor?.error;

  return (
    <section className={styles.inspection} aria-labelledby="developer-inspection-heading">
      <header className={styles.heading}>
        <div>
          <span>Developer tools</span>
          <h2 id="developer-inspection-heading">Recording asset inspection</h2>
        </div>
        <strong>Developer only</strong>
      </header>

      {assets.length > 0 && (
        <div className={styles.assetSection}>
          <h3>Available assets</h3>
          <div className={styles.assetGrid}>
            {assets.map((asset) => {
              const technicalDetails = [
                formatBytes(asset.fileSizeBytes),
                asset.fps ? `${asset.fps} FPS` : undefined,
                asset.sampleRateHz ? `${Math.round(asset.sampleRateHz / 1000)} kHz` : undefined,
              ].filter(Boolean).join(' · ');

              return (
                <article className={styles.assetCard} key={asset.kind}>
                  <strong>{ASSET_LABELS[asset.kind]}</strong>
                  <span>{technicalDetails}</span>
                  <code>{asset.mimeType}</code>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <RecordedAudioWaveforms
        durationSeconds={durationSeconds}
        mixed={mixed}
        microphone={microphone}
        systemAudio={systemAudio}
      />

      {cursor?.src && !cursorBlob && !cursorError && (
        <p className={styles.status} role="status">Loading cursor trajectory…</p>
      )}
      {cursorError && <p className={styles.error} role="alert">{cursorError}</p>}
      {cursorBlob && <RecordedCursorTrajectory blob={cursorBlob} />}
    </section>
  );
}
