import { RecordedCursorTrajectory } from '@/components/review/RecordedCursorTrajectory';
import type { DbRecording, DbRecordingShare } from '@/types/database';
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

type SharingDialogProps = {
  recording: DbRecording;
  shares: DbRecordingShare[];
  recipientEmail: string;
  permission: 'viewer' | 'viewer_download';
  busy: boolean;
  onClose: () => void;
  onRecipientEmailChange: (email: string) => void;
  onPermissionChange: (permission: 'viewer' | 'viewer_download') => void;
  onTogglePublic: (recording: DbRecording) => Promise<void>;
  onCopyLink: (recordingId: string) => Promise<void>;
  onGrantAccess: () => Promise<void>;
  onRevokeAccess: (share: DbRecordingShare) => Promise<void>;
};

export function SharingDialog({
  recording,
  shares,
  recipientEmail,
  permission,
  busy,
  onClose,
  onRecipientEmailChange,
  onPermissionChange,
  onTogglePublic,
  onCopyLink,
  onGrantAccess,
  onRevokeAccess,
}: SharingDialogProps) {
  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <section className={styles.shareModal} role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}><div><span>Access control</span><h2 id="share-title">Share “{recording.title}”</h2></div><button onClick={onClose} aria-label="Close sharing controls">×</button></div>
        <div className={styles.publicControl}>
          <div><strong>Public link</strong><span>{recording.is_public ? 'Anyone with the link can view this recording.' : 'Only you and explicit recipients can open the share page.'}</span></div>
          <button onClick={() => void onTogglePublic(recording)}>{recording.is_public ? 'Disable' : 'Enable'}</button>
          {recording.is_public && <button onClick={() => void onCopyLink(recording.id)}>Copy link</button>}
        </div>
        <div className={styles.grantForm}>
          <label><span>Registered user email</span><input type="email" value={recipientEmail} onChange={(event) => onRecipientEmailChange(event.target.value)} placeholder="teammate@example.com" /></label>
          <label><span>Permission</span><select value={permission} onChange={(event) => onPermissionChange(event.target.value as typeof permission)}><option value="viewer">Viewer</option><option value="viewer_download">Viewer + download</option></select></label>
          <button onClick={() => void onGrantAccess()} disabled={busy || !recipientEmail.trim()}>{busy ? 'Saving…' : 'Grant access'}</button>
        </div>
        <div className={styles.recipientList}>
          <div className={styles.recipientHeading}><strong>People with access</strong><span>{shares.length}</span></div>
          {!busy && shares.length === 0 && <p>No direct recipients yet.</p>}
          {shares.map((share) => (
            <div key={share.recipient_user_id}><div><strong>{share.display_name || share.email}</strong><span>{share.email} · {share.permission === 'viewer_download' ? 'Viewer + download' : 'Viewer'}</span></div><button onClick={() => void onRevokeAccess(share)} disabled={busy}>Revoke</button></div>
          ))}
        </div>
      </section>
    </div>
  );
}
