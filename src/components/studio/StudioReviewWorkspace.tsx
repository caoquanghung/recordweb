import { useState } from 'react';
import { RecordingDeveloperInspection } from '@/components/review/RecordingDeveloperInspection';
import { getLocalRecordingInspection } from '@/components/review/recordingInspection';
import { RECORDING_ARCHIVE_KINDS } from '@/lib/recordingArchive';
import { MAX_RECORDING_TITLE_LENGTH } from '@/lib/recordingTitle';
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
    titleRequired,
    titleSaving,
    titleError,
    resetReview,
    saveRecordingTitle,
    downloadRecordingFiles,
    publishAndCopyLink,
    uploadRecording,
  } = studio;
  const [title, setTitle] = useState('');
  const recordingFileCount = RECORDING_ARCHIVE_KINDS.filter(
    (kind) => Boolean(activeRecording?.assets?.[kind]?.blob || (kind === 'composite' && activeRecording?.blob)),
  ).length;
  const developerInspection = activeRecording
    ? getLocalRecordingInspection(activeRecording)
    : undefined;

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
      {titleRequired ? (
        <form
          className={styles.titleForm}
          onSubmit={(event) => {
            event.preventDefault();
            void saveRecordingTitle(title);
          }}
        >
          <div className={styles.titleCopy}>
            <span>Required before continuing</span>
            <label htmlFor="recording-title">Name this recording</label>
            <p>The title will be used in local storage, cloud metadata, the Library, and downloaded ZIP files.</p>
          </div>
          <div className={styles.titleField}>
            <input
              id="recording-title"
              name="recordingTitle"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={MAX_RECORDING_TITLE_LENGTH}
              placeholder="For example: Applied Mathematics — Chapter 4"
              autoFocus
              required
              aria-describedby={titleError ? 'recording-title-error recording-title-count' : 'recording-title-count'}
              aria-invalid={Boolean(titleError)}
              disabled={titleSaving}
            />
            <div className={styles.titleMeta}>
              <span id="recording-title-count">{title.trim().length}/{MAX_RECORDING_TITLE_LENGTH}</span>
              {titleError && <strong id="recording-title-error" role="alert">{titleError}</strong>}
            </div>
          </div>
          <button type="submit" disabled={titleSaving || !title.trim()}>
            {titleSaving ? 'Saving title…' : 'Save title & continue'}
          </button>
        </form>
      ) : activeRecording?.title ? (
        <div className={styles.savedTitle}>
          <span>Recording title</span>
          <strong>{activeRecording.title}</strong>
        </div>
      ) : null}
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
      {developerInspection && <RecordingDeveloperInspection {...developerInspection} />}
      {recordingFileCount > 0 && (
        <div className={styles.sourceAssets}>
          <div>
            <span>Recording files</span>
            <strong>Composite and separate sources</strong>
          </div>
          <button type="button" onClick={() => void downloadRecordingFiles()} disabled={titleRequired}>
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
        <button className={styles.reviewSecondary} onClick={resetReview} disabled={titleRequired}>Record another</button>
        {cloudRecording ? (
          <button className={styles.reviewPrimary} onClick={() => void publishAndCopyLink()}>
            {cloudRecording.is_public ? 'Copy public link' : 'Make public & copy link'}
          </button>
        ) : (
          <button
            className={styles.reviewPrimary}
            onClick={() => void uploadRecording()}
            disabled={titleRequired || uploadState === 'uploading' || uploadState === 'saving'}
          >
            {uploadState === 'uploading' ? `Uploading ${uploadProgress}%` : uploadState === 'saving' ? 'Saving metadata…' : 'Upload to cloud'}
          </button>
        )}
      </div>
    </section>
  );
}
