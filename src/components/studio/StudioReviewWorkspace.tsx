import { useState } from 'react';
import { RecordingDeveloperInspection } from '@/components/review/RecordingDeveloperInspection';
import { getLocalRecordingInspection } from '@/components/review/recordingInspection';
import { RECORDING_ARCHIVE_KINDS } from '@/lib/recordingArchive';
import { MAX_RECORDING_TITLE_LENGTH } from '@/lib/recordingTitle';
import type { RecordingAssetKind } from '@/types/recording';
import { formatDuration } from './studioConfig';
import { StudioIcon } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioReviewWorkspace.module.css';

const assetLabels: Record<RecordingAssetKind, string> = {
  composite: 'Final recording', webcam: 'Camera source', screen: 'Screen source',
  audio: 'Mixed audio', 'microphone-audio': 'Microphone audio',
  'system-audio': 'System audio', cursor: 'Cursor data',
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function StudioReviewWorkspace({ studio }: { studio: StudioController }) {
  const {
    activeRecording, elapsed, uploadState, uploadProgress, uploadMessage, cloudRecording,
    titleRequired, titleSaving, titleError, saveRecordingTitle, downloadRecordingFiles,
    publishAndCopyLink, retryRecordingSave,
  } = studio;
  const [title, setTitle] = useState('');
  const sourceFiles = RECORDING_ARCHIVE_KINDS.flatMap((kind) => {
    const asset = activeRecording?.assets?.[kind];
    const blob = asset?.blob ?? (kind === 'composite' ? activeRecording?.blob : undefined);
    return blob ? [{ kind, size: blob.size, mimeType: asset?.mimeType ?? blob.type }] : [];
  });
  const developerInspection = activeRecording ? getLocalRecordingInspection(activeRecording) : undefined;
  const readyToContinue = !titleRequired && uploadState === 'ready';
  const isSaving = uploadState === 'uploading' || uploadState === 'saving';

  return (
    <section className={styles.reviewWorkspace} aria-label="Recording review">
      <button className={styles.backButton} type="button" onClick={() => {
        if (window.location.pathname === '/studio') window.location.reload();
        else window.location.assign(new URL('/studio', window.location.origin).href);
      }} disabled={!readyToContinue}>
        <span aria-hidden="true">←</span> Back on Live studio
      </button>
      <div className={styles.reviewHeading}>
        <div>
          <span className={styles.eyebrow}>Recording complete</span>
          <h2>Review your recording</h2>
          <p>Watch your video, name it, then share or download your files.</p>
        </div>
        <div className={styles.recordingSummary} aria-label="Recording details">
          <span>{formatDuration(elapsed)}</span>
          {activeRecording && <><span>{activeRecording.resolution}</span><span>{activeRecording.fps} FPS</span></>}
        </div>
      </div>

      <div className={styles.reviewGrid}>
        <div className={styles.previewColumn}>
          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <span className={styles.sectionLabel}>Preview</span>
              <span className={styles.previewBadge}><StudioIcon name="check" /> Captured</span>
            </div>
            <div className={styles.reviewPreview}>
              {activeRecording?.previewUrl ? (
                <video className={styles.reviewVideo} src={activeRecording.previewUrl} controls playsInline preload="metadata" aria-label="Recorded video preview" />
              ) : <span className={styles.preparing}>Preparing preview…</span>}
            </div>
            <div className={styles.previewFooter}>
              <strong>{activeRecording?.title || 'Untitled recording'}</strong>
              <span>{activeRecording ? formatBytes(activeRecording.fileSizeBytes) : 'Preparing file'}</span>
            </div>
          </div>
          {developerInspection && <RecordingDeveloperInspection {...developerInspection} />}
        </div>

        <aside className={styles.actionColumn} aria-label="Recording actions">
          <div className={styles.titleCard}>
            <span className={styles.sectionLabel}>Recording title</span>
            {titleRequired ? (
              <form className={styles.titleForm} onSubmit={(event) => { event.preventDefault(); void saveRecordingTitle(title); }}>
                <label htmlFor="recording-title">Give this recording a name</label>
                <p>A title is required before you continue.</p>
                <input id="recording-title" name="recordingTitle" type="text" value={title}
                  onChange={(event) => setTitle(event.target.value)} maxLength={MAX_RECORDING_TITLE_LENGTH}
                  placeholder="Enter a recording title" autoFocus required
                  aria-describedby={titleError ? 'recording-title-error recording-title-count' : 'recording-title-count'}
                  aria-invalid={Boolean(titleError)} disabled={titleSaving} />
                <div className={styles.titleMeta}>
                  <span id="recording-title-count">{title.trim().length}/{MAX_RECORDING_TITLE_LENGTH}</span>
                  {titleError && <strong id="recording-title-error" role="alert">{titleError}</strong>}
                </div>
                <button className={styles.primaryButton} type="submit" disabled={titleSaving || !title.trim() || uploadState !== 'ready'}>
                  {titleSaving ? 'Saving title…' : 'Save title'}
                </button>
              </form>
            ) : <strong className={styles.savedTitle}>{activeRecording?.title}</strong>}
            <div className={styles.saveStatus} aria-live="polite">
              {isSaving && <progress max="100" value={uploadProgress} aria-label="Recording save progress" />}
              <span>{uploadMessage || (isSaving ? 'Saving your recording…' : '')}</span>
              {uploadState === 'error' && <button type="button" onClick={retryRecordingSave}>Try saving again</button>}
            </div>
          </div>

          <div className={styles.actionCard}>
            <div className={styles.cardIcon}><StudioIcon name="spark" /></div>
            <div className={styles.cardCopy}>
              <span className={styles.sectionLabel}>Quick share</span>
              <h3>Share your video</h3>
              <p>Copy a link to send your recording.</p>
            </div>
            <button className={styles.primaryButton} type="button" onClick={() => void publishAndCopyLink()}
              disabled={!readyToContinue || !cloudRecording || titleSaving}>Copy share link</button>
          </div>

          <div className={styles.actionCard}>
            <div className={styles.cardIcon}><StudioIcon name="screen" /></div>
            <div className={styles.cardCopy}>
              <span className={styles.sectionLabel}>Instant download</span>
              <h3>Your recording files</h3>
              <p>Get the final video and available sources together.</p>
            </div>
            <button className={styles.secondaryButton} type="button" onClick={() => void downloadRecordingFiles()}
              disabled={!readyToContinue || titleSaving || sourceFiles.length === 0}>Download All Sources (ZIP)</button>
            <div className={styles.fileListHeading}>{sourceFiles.length} files included</div>
            <ul className={styles.fileList} aria-label="Files included in download">
              {sourceFiles.map((file) => (
                <li key={file.kind}>
                  <span className={styles.fileIcon}><StudioIcon name={file.kind === 'webcam' ? 'camera' : file.kind.includes('audio') ? 'mic' : 'screen'} /></span>
                  <span className={styles.fileDetails}><strong>{assetLabels[file.kind]}</strong><small>{file.mimeType.split(';')[0]}</small></span>
                  <small>{formatBytes(file.size)}</small>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
