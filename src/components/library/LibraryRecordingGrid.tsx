import Link from 'next/link';
import {
  getCloudRecordingInspection,
} from '@/components/review/recordingInspection';
import type { DbRecording, DbSharedRecording } from '@/types/database';
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
  downloadCloudFiles: (recording: DbRecording | DbSharedRecording) => Promise<void>;
  removeCloud: (recording: DbRecording) => Promise<void>;
  openSharing: (recording: DbRecording) => Promise<void>;
  togglePublic: (recording: DbRecording) => Promise<void>;
};

function CloudRecordingCard({
  recording,
  setPreview,
  downloadCloudFiles,
  removeCloud,
  openSharing,
  togglePublic,
}: Pick<
  LibraryRecordingGridProps,
  'setPreview' | 'downloadCloudFiles' | 'removeCloud' | 'openSharing' | 'togglePublic'
> & { recording: DbRecording }) {
  return (
    <article className={styles.card}>
      <RecordingThumbnail
        src={recording.storage_url}
        badge={recording.is_public ? 'Đã gửi lớp học' : 'Bài giảng'}
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
          <p>{recording.is_public
            ? 'Bài giảng đã sẵn sàng chia sẻ qua liên kết cho học sinh.'
            : 'Sẵn sàng xem lại và chia sẻ khi cần.'}</p>
        </div>
        <div className={styles.cardMeta}>
          <span>{recording.is_public ? 'Liên kết công khai' : recording.resolution}</span>
          <time>{formatLibraryDate(recording.recorded_at)}</time>
        </div>
        <div className={styles.cardActions}>
          <Link className={styles.primaryCardButton} href={`/library/${recording.id}`}><LibraryIcon name="play" />Xem lại</Link>
          <button type="button" onClick={() => void openSharing(recording)}><LibraryIcon name="share" />Chia sẻ</button>
          {(recording.storage_url || recording.assets?.length) && <button type="button" onClick={() => void downloadCloudFiles(recording)}><LibraryIcon name="download" />Tải về</button>}
          <button type="button" onClick={() => void togglePublic(recording)}><LibraryIcon name="lock" />{recording.is_public ? 'Đặt riêng tư' : 'Mở liên kết'}</button>
          <button className={styles.danger} type="button" onClick={() => void removeCloud(recording)}><LibraryIcon name="trash" />Xoá</button>
        </div>
      </div>
    </article>
  );
}

function SharedRecordingCard({
  recording,
  setPreview,
  downloadCloudFiles,
}: Pick<LibraryRecordingGridProps, 'setPreview' | 'downloadCloudFiles'> & {
  recording: DbSharedRecording;
}) {
  const canDownload = recording.share_permission === 'viewer_download';

  return (
    <article className={styles.card}>
      <RecordingThumbnail
        src={recording.storage_url}
        badge="Được chia sẻ"
        summary={`${formatLibraryDuration(Number(recording.duration_seconds))} • ${recording.resolution}`}
        title={recording.title}
        onClick={() => recording.storage_url && setPreview({
          title: recording.title,
          url: recording.storage_url,
          canDownload,
          inspection: getCloudRecordingInspection(recording),
        })}
      />
      <div className={styles.cardBody}>
        <div className={styles.cardCopy}>
          <h2>{recording.title}</h2>
          <p>Được chia sẻ bởi {recording.owner_display_name || recording.owner_email}.</p>
        </div>
        <div className={styles.cardMeta}>
          <span>{canDownload ? 'Được xem và tải' : 'Chỉ được xem'}</span>
          <time>{formatLibraryDate(recording.recorded_at)}</time>
        </div>
        <div className={styles.cardActions}>
          <Link className={styles.primaryCardButton} href={`/library/${recording.id}`}><LibraryIcon name="play" />Xem lại</Link>
          {canDownload && (recording.storage_url || recording.assets?.length) && <button type="button" onClick={() => void downloadCloudFiles(recording)}><LibraryIcon name="download" />Tải về</button>}
        </div>
      </div>
    </article>
  );
}

export function LibraryRecordingGrid(props: LibraryRecordingGridProps) {
  return (
    <section className={styles.recordingGrid} aria-label="Danh sách bài giảng">
      {props.entries.map((entry) => {
        if (entry.kind === 'cloud') {
          return <CloudRecordingCard key={`cloud-${entry.recording.id}`} recording={entry.recording} {...props} />;
        }
        return <SharedRecordingCard key={`shared-${entry.recording.id}`} recording={entry.recording} {...props} />;
      })}
    </section>
  );
}
