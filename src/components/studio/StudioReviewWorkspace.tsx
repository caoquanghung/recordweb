import { RecordedAudioWaveforms } from '@/components/review/RecordedAudioWaveforms';
import { RecordedCursorTrajectory } from '@/components/review/RecordedCursorTrajectory';
import { formatDuration, recordingAssetLabel, SOURCE_DOWNLOAD_KINDS } from './studioConfig';
import { StudioIcon } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioShell.module.css';

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
    downloadRecordingAsset,
    publishAndCopyLink,
    uploadRecording,
  } = studio;

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
      {activeRecording?.assets?.audio?.blob && (
        <RecordedAudioWaveforms
          durationSeconds={activeRecording.durationSeconds}
          mixed={activeRecording.assets.audio}
          microphone={activeRecording.assets['microphone-audio']}
          systemAudio={activeRecording.assets['system-audio']}
        />
      )}
      {activeRecording?.assets?.cursor?.blob && (
        <RecordedCursorTrajectory blob={activeRecording.assets.cursor.blob} />
      )}
      {activeRecording?.assets && (
        <div className={styles.sourceAssets}>
          <div>
            <span>Separate source files</span>
            <strong>Ready for editing</strong>
          </div>
          {SOURCE_DOWNLOAD_KINDS.map((kind) => {
            const asset = activeRecording.assets?.[kind];
            if (!asset?.blob) return null;
            return (
              <button key={kind} type="button" onClick={() => downloadRecordingAsset(kind)}>
                <StudioIcon name={kind.includes('audio') ? 'mic' : kind === 'webcam' ? 'camera' : 'screen'} />
                <span><strong>{recordingAssetLabel(kind)}</strong><small>{asset.mimeType.split(';')[0]}</small></span>
              </button>
            );
          })}
        </div>
      )}
      <div className={styles.reviewActions}>
        <div className={styles.reviewStatus} aria-live="polite">
          {uploadState === 'uploading' && <progress max="100" value={uploadProgress} />}
          <span>{uploadMessage || 'This recording is available locally until you upload it.'}</span>
        </div>
        <button className={styles.reviewSecondary} onClick={resetReview}>Record another</button>
        <button className={styles.reviewSecondary} onClick={() => downloadRecordingAsset('composite')}>Download composite</button>
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
