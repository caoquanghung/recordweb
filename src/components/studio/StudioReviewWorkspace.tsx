import { RECORDING_ARCHIVE_KINDS } from '@/lib/recordingArchive';
import { formatDuration } from './studioConfig';
import { StudioIcon } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioReviewWorkspace.module.css';

export function StudioReviewWorkspace({ studio }: { studio: StudioController }) {
  const {
    activeRecording,
    elapsed,
    resolution,
    uploadState,
    uploadProgress,
    uploadMessage,
    cloudRecording,
    resetReview,
    downloadRecordingFiles,
    publishAndCopyLink,
    uploadRecording,
  } = studio;
  const recordingFileCount = RECORDING_ARCHIVE_KINDS.filter(
    (kind) => Boolean(activeRecording?.assets?.[kind]?.blob || (kind === 'composite' && activeRecording?.blob)),
  ).length;

  return (
    <section className={styles.reviewWorkspace}>
      <div className={styles.reviewHero}>
        <div className={styles.reviewIcon}><StudioIcon name="check" /></div>
        <div>
          <span className={styles.reviewEyebrow}>Recording complete</span>
          <h2>Your recording is ready to review</h2>
          <p>{formatDuration(elapsed)} captured in {resolution} at 30 FPS.</p>
        </div>
      </div>
      <div className={styles.reviewPreview}>
        {activeRecording?.previewUrl ? (
          <video
            className={styles.reviewVideo}
            src={activeRecording.previewUrl}
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <><div><StudioIcon name="play" /></div><strong>Preparing preview…</strong></>
        )}
      </div>
      {recordingFileCount > 0 && (
        <div className={styles.sourceAssets}>
          <div>
            <span>Recording files</span>
            <strong>Composite and separate sources</strong>
          </div>
          <button type="button" onClick={() => void downloadRecordingFiles()}>
            <StudioIcon name="screen" />
            <span><strong>Download all files</strong><small>{recordingFileCount} files · ZIP</small></span>
          </button>
        </div>
      )}
      <div className={styles.reviewActions}>
        <div className={styles.reviewStatus} aria-live="polite">
          {uploadState === 'uploading' && <progress max="100" value={uploadProgress} />}
          <span>{uploadMessage || 'This recording is available locally until you upload it.'}</span>
        </div>
        <button className={styles.reviewSecondary} onClick={resetReview}>Record another</button>
        {cloudRecording ? (
          <button className={styles.reviewPrimary} onClick={() => void publishAndCopyLink()}>
            {cloudRecording.is_public ? 'Copy public link' : 'Make public & copy link'}
          </button>
        ) : (
          <button
            className={styles.reviewPrimary}
            onClick={() => void uploadRecording()}
            disabled={uploadState === 'uploading' || uploadState === 'saving'}
          >
            {uploadState === 'uploading' ? `Uploading ${uploadProgress}%` : uploadState === 'saving' ? 'Saving metadata…' : 'Upload to cloud'}
          </button>
        )}
      </div>
    </section>
  );
}
