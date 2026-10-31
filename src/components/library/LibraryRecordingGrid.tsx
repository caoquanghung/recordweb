import Link from 'next/link';
import {
  getCloudRecordingInspection,
} from '@/components/review/recordingInspection';
import type { DbRecording } from '@/types/database';
import styles from './LibraryClient.module.css';
import {
  formatLibraryBytes,
  formatLibraryDate,
  formatLibraryDuration,
  LibraryIcon,
  RecordingThumbnail,
} from './LibraryPrimitives';
import type { LibraryEntry, RecordingPreview } from './useLibraryController';

type LibraryRecordingGridProps = {
  entries: LibraryEntry[];
  setPreview: (preview: RecordingPreview) => void;
  downloadCloudFiles: (recording: DbRecording) => Promise<void>;
  removeCloud: (recording: DbRecording) => Promise<void>;
};

function CloudRecordingCard({
  recording,
  setPreview,
  downloadCloudFiles,
  removeCloud,
}: Pick<
  LibraryRecordingGridProps,
  'setPreview' | 'downloadCloudFiles' | 'removeCloud'
> & { recording: DbRecording }) {
  return (
    <article className={styles.card}>
      <RecordingThumbnail
        src={recording.storage_url}
        badge="Bài giảng"
        summary={`${formatLibraryDuration(Number(recording.duration_seconds))} • ${formatLibraryBytes(Number(recording.file_size_bytes))}`}
        title={recording.title}
        onClick={() => recording.storage_url && setPreview({
          title: recording.title,
          url: recording.storage_url,
          canDownload: true,
          inspection: getCloudRecordingInspection(recording),
        })}
      />
      <div className={styles.cardBody}>
        <div className={styles.cardCopy}>
          <h2>{recording.title}</h2>
          <p>Sẵn sàng xem lại và tải xuống cho nghiên cứu.</p>
        </div>
        <div className={styles.cardMeta}>
          <span>{recording.fps} FPS</span>
          <time>{formatLibraryDate(recording.recorded_at)}</time>
        </div>
        <div className={styles.cardActions}>
          <Link className={styles.primaryCardButton} href={`/library/${recording.id}`}><LibraryIcon name="play" />Xem lại</Link>
          {(recording.storage_url || recording.assets?.length) && <button type="button" onClick={() => void downloadCloudFiles(recording)}><LibraryIcon name="download" />Tải về</button>}
          <button className={styles.danger} type="button" onClick={() => void removeCloud(recording)}><LibraryIcon name="trash" />Xoá</button>
        </div>
      </div>
    </article>
  );
}

export function LibraryRecordingGrid(props: LibraryRecordingGridProps) {
  return (
    <section className={styles.recordingGrid} aria-label="Danh sách bài giảng">
      {props.entries.map((entry) => (
        <CloudRecordingCard key={entry.recording.id} recording={entry.recording} {...props} />
      ))}
    </section>
  );
}
