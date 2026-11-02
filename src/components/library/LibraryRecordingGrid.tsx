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
} from './LibraryPrimitives';
import { LibraryCardGrid, LibraryRecordingCard } from './LibraryRecordingCard';
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
    <LibraryRecordingCard
      title={recording.title}
      description="Sẵn sàng xem lại và tải xuống cho nghiên cứu."
      thumbnail={{
        src: recording.storage_url,
        badge: 'Bài giảng',
        summary: `${formatLibraryDuration(Number(recording.duration_seconds))} • ${formatLibraryBytes(Number(recording.file_size_bytes))}`,
        onClick: () => recording.storage_url && setPreview({
          title: recording.title, url: recording.storage_url, canDownload: true,
          inspection: getCloudRecordingInspection(recording),
        }),
      }}
      metadata={<>
        <span>{recording.fps} FPS</span>
        <time>{formatLibraryDate(recording.recorded_at)}</time>
      </>}
      actions={<>
        <Link className={styles.primaryCardButton} href={`/library/${recording.id}`}><LibraryIcon name="play" />Xem lại</Link>
        {(recording.storage_url || recording.assets?.length) && <button type="button" onClick={() => void downloadCloudFiles(recording)}><LibraryIcon name="download" />Tải về</button>}
        <button className={styles.danger} type="button" onClick={() => void removeCloud(recording)}><LibraryIcon name="trash" />Xoá</button>
      </>}
    />
  );
}

export function LibraryRecordingGrid(props: LibraryRecordingGridProps) {
  return (
    <LibraryCardGrid>
      {props.entries.map((entry) => (
        <CloudRecordingCard key={entry.recording.id} recording={entry.recording} {...props} />
      ))}
    </LibraryCardGrid>
  );
}
