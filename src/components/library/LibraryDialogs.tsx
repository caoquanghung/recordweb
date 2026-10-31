import { RecordedCursorTrajectory } from '@/components/review/RecordedCursorTrajectory';
import { RecordingDeveloperInspection } from '@/components/review/RecordingDeveloperInspection';
import styles from './LibraryClient.module.css';
import type { CursorPreview, RecordingPreview } from './useLibraryController';

export function RecordingPreviewDialog({
  preview,
  onClose,
}: {
  preview: RecordingPreview;
  onClose: () => void;
}) {
  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <section className={styles.previewModal} role="dialog" aria-modal="true" aria-label={`Preview ${preview.title}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}><div><span>Preview</span><h2>{preview.title}</h2></div><button onClick={onClose} aria-label="Close preview">×</button></div>
        <video src={preview.url} controls controlsList={preview.canDownload ? undefined : 'nodownload'} autoPlay playsInline />
        {preview.inspection && (
          <div className={styles.inspectionModalBody}>
            <RecordingDeveloperInspection {...preview.inspection} />
          </div>
        )}
      </section>
    </div>
  );
}

export function CursorPreviewDialog({
  preview,
  onClose,
}: {
  preview: CursorPreview;
  onClose: () => void;
}) {
  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <section className={styles.previewModal} role="dialog" aria-modal="true" aria-label={`Cursor path for ${preview.title}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}><div><span>Cursor trajectory</span><h2>{preview.title}</h2></div><button onClick={onClose} aria-label="Close cursor path">×</button></div>
        <div className={styles.cursorModalBody}><RecordedCursorTrajectory blob={preview.blob} /></div>
      </section>
    </div>
  );
}
