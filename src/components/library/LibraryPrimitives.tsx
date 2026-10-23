import type { ReactNode } from 'react';
import {
  RecordedAudioWaveforms,
  type RecordedWaveformSource,
} from '@/components/review/RecordedAudioWaveforms';
import { isRecordedWaveformPeaks } from '@/lib/audioWaveform';
import type { DbRecording, DbSharedRecording } from '@/types/database';
import styles from './LibraryClient.module.css';

export type LibraryIconName =
  | 'search'
  | 'sync'
  | 'play'
  | 'share'
  | 'download'
  | 'cursor'
  | 'lock'
  | 'trash';

export function LibraryIcon({ name }: { name: LibraryIconName }) {
  const paths: Record<LibraryIconName, ReactNode> = {
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    sync: <><path d="M20 12a8 8 0 0 0-14.9-4" /><path d="M5 3v5h5" /><path d="M4 12a8 8 0 0 0 14.9 4" /><path d="M19 21v-5h-5" /></>,
    play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></>,
    share: <><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></>,
    download: <><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M5 20h14" /></>,
    cursor: <><path d="m5 3 6.5 16 2.2-5.3L19 11.5Z" /><path d="m14 14 4 4" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
  };

  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function RecordingThumbnail({
  src,
  badge,
  summary,
  title,
  onClick,
}: {
  src?: string | null;
  badge: string;
  summary: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      className={styles.thumbnail}
      type="button"
      onClick={onClick}
      aria-label={`Xem lại ${title}`}
      disabled={!src}
    >
      {src ? (
        <video src={src} muted playsInline preload="metadata" tabIndex={-1} />
      ) : (
        <span className={styles.thumbnailFallback} aria-hidden="true" />
      )}
      <span className={styles.thumbnailShade} aria-hidden="true" />
      <span className={styles.mediaBadge}>{badge}</span>
      <span className={styles.mediaSummary}>{summary}</span>
    </button>
  );
}

export function formatLibraryDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatLibraryDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function formatLibraryBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function cloudWaveformSource(
  recording: DbRecording | DbSharedRecording,
  kind: 'audio' | 'microphone-audio' | 'system-audio',
): RecordedWaveformSource | undefined {
  const asset = recording.assets?.find((candidate) => candidate.kind === kind);
  const assetPeaks = asset?.metadata.waveformPeaks;
  if (asset) {
    return {
      mimeType: asset.mime_type,
      waveformPeaks: isRecordedWaveformPeaks(assetPeaks) ? assetPeaks : undefined,
      src: asset.storage_url,
    };
  }
  if (kind !== 'audio' || !recording.storage_url) return undefined;

  const recordingPeaks = recording.settings.waveformPeaks;
  return {
    mimeType: recording.mime_type,
    waveformPeaks: isRecordedWaveformPeaks(recordingPeaks) ? recordingPeaks : undefined,
    src: recording.storage_url,
  };
}

export function CloudRecordingWaveform({
  recording,
}: {
  recording: DbRecording | DbSharedRecording;
}) {
  return (
    <RecordedAudioWaveforms
      durationSeconds={Number(recording.duration_seconds)}
      mixed={cloudWaveformSource(recording, 'audio')}
      microphone={cloudWaveformSource(recording, 'microphone-audio')}
      systemAudio={cloudWaveformSource(recording, 'system-audio')}
      compact
    />
  );
}
