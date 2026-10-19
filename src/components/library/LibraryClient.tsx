'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceShell } from '@/components/app/WorkspaceShell';
import {
  RecordedAudioWaveforms,
  type RecordedWaveformSource,
} from '@/components/review/RecordedAudioWaveforms';
import { RecordedCursorTrajectory } from '@/components/review/RecordedCursorTrajectory';
import { deleteLocalRecording, getAllLocalRecordings } from '@/lib/idb';
import { isRecordedWaveformPeaks } from '@/lib/audioWaveform';
import {
  downloadRecordingArchive,
  RECORDING_ARCHIVE_KINDS,
} from '@/lib/recordingArchive';
import type { DbRecording, DbRecordingAsset, DbRecordingShare, DbSharedRecording } from '@/types/database';
import type { RecordingMetadata } from '@/types/recording';
import styles from './LibraryClient.module.css';

type LibraryTab = 'mine' | 'shared' | 'local' | 'cloud';

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function cloudWaveformSource(
  recording: DbRecording,
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

function CloudRecordingWaveform({ recording }: { recording: DbRecording }) {
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

export function LibraryClient() {
  const [tab, setTab] = useState<LibraryTab>('mine');
  const [cloud, setCloud] = useState<DbRecording[]>([]);
  const [shared, setShared] = useState<DbSharedRecording[]>([]);
  const [local, setLocal] = useState<RecordingMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ title: string; url: string; canDownload: boolean } | null>(null);
  const [cursorPreview, setCursorPreview] = useState<{ title: string; blob: Blob } | null>(null);
  const [sharingRecording, setSharingRecording] = useState<DbRecording | null>(null);
  const [shares, setShares] = useState<DbRecordingShare[]>([]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [permission, setPermission] = useState<'viewer' | 'viewer_download'>('viewer');
  const [shareBusy, setShareBusy] = useState(false);
  const localUrlsRef = useRef<string[]>([]);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [response, localRecordings] = await Promise.all([
        fetch('/api/recordings', { cache: 'no-store' }),
        getAllLocalRecordings(),
      ]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not load cloud recordings.');
      localUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localUrlsRef.current = [];
      const hydratedLocal = localRecordings.map((recording) => {
        if (!recording.blob) return recording;
        const previewUrl = URL.createObjectURL(recording.blob);
        localUrlsRef.current.push(previewUrl);
        return { ...recording, previewUrl };
      });
      setCloud(data.recordings ?? []);
      setShared(data.sharedRecordings ?? []);
      setLocal(hydratedLocal);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadLibrary(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadLibrary]);

  useEffect(() => () => {
    localUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const localOnly = useMemo(() => {
    const uploadedLocalIds = new Set(cloud.map((recording) => recording.local_id).filter(Boolean));
    return local.filter((recording) => !uploadedLocalIds.has(recording.localId ?? recording.id));
  }, [cloud, local]);

  const visibleLocal = tab === 'mine' || tab === 'local' ? localOnly : [];
  const visibleCloud = tab === 'mine' || tab === 'cloud' ? cloud : [];
  const visibleShared = tab === 'shared' ? shared : [];
  const visibleCount = visibleLocal.length + visibleCloud.length + visibleShared.length;

  const removeLocal = async (recording: RecordingMetadata) => {
    if (!window.confirm('Delete this recording from this browser? Cloud copies are not affected.')) return;
    await deleteLocalRecording(recording.id);
    setLocal((current) => current.filter((item) => item.id !== recording.id));
    setMessage('Local recording deleted.');
  };

  const openCloudCursor = async (title: string, asset: DbRecordingAsset) => {
    setMessage('Loading cursor trajectory…');
    try {
      const response = await fetch(asset.storage_url);
      if (!response.ok) throw new Error(`Could not load cursor trajectory (${response.status}).`);
      setCursorPreview({ title, blob: await response.blob() });
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const downloadLocalFiles = async (recording: RecordingMetadata) => {
    const assets = RECORDING_ARCHIVE_KINDS.flatMap((kind) => {
      const asset = recording.assets?.[kind];
      const blob = asset?.blob ?? (kind === 'composite' ? recording.blob : undefined);
      const mimeType = asset?.mimeType ?? (kind === 'composite' ? recording.mimeType : '');
      return blob ? [{ kind, mimeType, blob }] : [];
    });
    setMessage('Preparing recording ZIP…');
    try {
      await downloadRecordingArchive(recording.title, assets);
      setMessage(`${assets.length} recording files downloaded as one ZIP.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const downloadCloudFiles = async (recording: DbRecording) => {
    const assets = recording.assets?.map((asset) => ({
      kind: asset.kind,
      mimeType: asset.mime_type,
      storageUrl: asset.storage_url,
    })) ?? [];
    if (recording.storage_url && !assets.some((asset) => asset.kind === 'composite')) {
      assets.unshift({
        kind: 'composite',
        mimeType: recording.mime_type,
        storageUrl: recording.storage_url,
      });
    }
    setMessage('Downloading recording files and preparing ZIP…');
    try {
      await downloadRecordingArchive(recording.title, assets);
      setMessage(`${assets.length} recording files downloaded as one ZIP.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const togglePublic = async (recording: DbRecording) => {
    const response = await fetch('/api/recordings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recording.id, is_public: !recording.is_public }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? 'Could not update link access.');
      return;
    }
    setCloud((current) => current.map((item) => item.id === recording.id ? data.recording : item));
    setSharingRecording((current) => current?.id === recording.id ? data.recording : current);
    setMessage(data.recording.is_public ? 'Public link enabled.' : 'Public link disabled.');
  };

  const copyShareLink = async (recordingId: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/share/${recordingId}`);
    setMessage('Share link copied.');
  };

  const removeCloud = async (recording: DbRecording) => {
    if (!window.confirm('Delete this cloud recording, its Blob video, and all share grants? This cannot be undone.')) return;
    const response = await fetch('/api/recordings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recording.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? 'Could not delete cloud recording.');
      return;
    }
    setCloud((current) => current.filter((item) => item.id !== recording.id));
    setMessage('Cloud recording and Blob object deleted.');
  };

  const openSharing = async (recording: DbRecording) => {
    setSharingRecording(recording);
    setShares([]);
    setRecipientEmail('');
    setShareBusy(true);
    try {
      const response = await fetch(`/api/shares?recordingId=${encodeURIComponent(recording.id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not load recipients.');
      setShares(data.shares ?? []);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  const grantAccess = async () => {
    if (!sharingRecording || !recipientEmail.trim()) return;
    setShareBusy(true);
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId: sharingRecording.id, recipientEmail: recipientEmail.trim(), permission }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not share recording.');
      setShares((current) => [data.share, ...current.filter((item) => item.recipient_user_id !== data.share.recipient_user_id)]);
      setRecipientEmail('');
      setMessage('Recipient access updated.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  const revokeAccess = async (share: DbRecordingShare) => {
    if (!sharingRecording) return;
    setShareBusy(true);
    try {
      const response = await fetch('/api/shares', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId: sharingRecording.id, recipientUserId: share.recipient_user_id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not revoke access.');
      setShares((current) => current.filter((item) => item.recipient_user_id !== share.recipient_user_id));
      setMessage('Recipient access revoked.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <WorkspaceShell
      active="library"
      eyebrow="Local and cloud media"
      title="Recording library"
      description="Preview, download, publish, share, or remove recordings while keeping local and cloud copies clearly separated."
      actions={(
        <>
          <button className={styles.refreshButton} onClick={() => void loadLibrary()}>Refresh</button>
          <Link className={styles.primaryAction} href="/">New recording</Link>
        </>
      )}
    >
      <div className={styles.tabs} role="tablist" aria-label="Recording filters">
        {([
          ['mine', 'Mine', cloud.length + localOnly.length],
          ['shared', 'Shared with me', shared.length],
          ['local', 'Local only', localOnly.length],
          ['cloud', 'Cloud', cloud.length],
        ] as Array<[LibraryTab, string, number]>).map(([value, label, count]) => (
          <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? styles.tabActive : ''} onClick={() => setTab(value)}>{label}<span>{count}</span></button>
        ))}
      </div>

      {message && <p className={styles.message} role="status">{message}</p>}
      {loading && <div className={styles.empty}>Loading recordings…</div>}
      {!loading && visibleCount === 0 && <div className={styles.empty}><strong>No recordings in this view</strong><span>Record locally in Studio or select another filter.</span></div>}

      <section className={styles.recordingGrid}>
        {visibleLocal.map((recording) => (
          <article className={styles.card} key={`local-${recording.id}`}>
            <button className={styles.thumbnail} onClick={() => recording.previewUrl && setPreview({ title: recording.title, url: recording.previewUrl, canDownload: true })}>
              <span>LOCAL</span><strong>Preview recording</strong>
            </button>
            <div className={styles.cardBody}>
              <div className={styles.cardTitle}><div><strong>{recording.title}</strong><span>{new Date(recording.createdAt).toLocaleString()}</span></div><em className={styles.localStatus}>Local only</em></div>
              <div className={styles.metadata}><span>{formatDuration(recording.durationSeconds)}</span><span>{recording.resolution}</span><span>{formatBytes(recording.fileSizeBytes)}</span></div>
              {recording.assets?.audio?.blob && (
                <RecordedAudioWaveforms
                  durationSeconds={recording.durationSeconds}
                  mixed={recording.assets.audio}
                  microphone={recording.assets['microphone-audio']}
                  systemAudio={recording.assets['system-audio']}
                  compact
                />
              )}
              <div className={styles.cardActions}>
                <button onClick={() => recording.previewUrl && setPreview({ title: recording.title, url: recording.previewUrl, canDownload: true })}>Preview</button>
                {(recording.blob || RECORDING_ARCHIVE_KINDS.some((kind) => recording.assets?.[kind]?.blob)) && <button onClick={() => void downloadLocalFiles(recording)}>All files ZIP</button>}
                {recording.assets?.cursor?.blob && <button onClick={() => setCursorPreview({ title: recording.title, blob: recording.assets!.cursor!.blob! })}>Open cursor</button>}
                <button className={styles.danger} onClick={() => void removeLocal(recording)}>Delete local</button>
              </div>
            </div>
          </article>
        ))}

        {visibleCloud.map((recording) => (
          <article className={styles.card} key={`cloud-${recording.id}`}>
            <button className={styles.thumbnail} onClick={() => recording.storage_url && setPreview({ title: recording.title, url: recording.storage_url, canDownload: true })}>
              <span>{recording.mime_type.includes('mp4') ? 'MP4' : 'WEBM'}</span><strong>Cloud playback</strong>
            </button>
            <div className={styles.cardBody}>
              <div className={styles.cardTitle}><div><strong>{recording.title}</strong><span>{new Date(recording.created_at).toLocaleString()}</span></div><em className={recording.is_public ? styles.publicStatus : styles.privateStatus}>{recording.is_public ? 'Public link' : 'Private cloud'}</em></div>
              <div className={styles.metadata}><span>{formatDuration(Number(recording.duration_seconds))}</span><span>{recording.resolution}</span><span>{formatBytes(Number(recording.file_size_bytes))}</span></div>
              <CloudRecordingWaveform recording={recording} />
              <div className={styles.cardActions}><Link href={`/share/${recording.id}`}>Open</Link><button onClick={() => void openSharing(recording)}>Share</button>{(recording.storage_url || recording.assets?.length) && <button onClick={() => void downloadCloudFiles(recording)}>All files ZIP</button>}{recording.assets?.filter((asset) => asset.kind === 'cursor').map((asset) => <button key={`visualize-${asset.id}`} onClick={() => void openCloudCursor(recording.title, asset)}>Cursor player</button>)}<button onClick={() => void togglePublic(recording)}>{recording.is_public ? 'Make private' : 'Make public'}</button><button className={styles.danger} onClick={() => void removeCloud(recording)}>Delete cloud</button></div>
            </div>
          </article>
        ))}

        {visibleShared.map((recording) => (
          <article className={styles.card} key={`shared-${recording.id}`}>
            <button className={styles.thumbnail} onClick={() => recording.storage_url && setPreview({ title: recording.title, url: recording.storage_url, canDownload: recording.share_permission === 'viewer_download' })}>
              <span>SHARED</span><strong>From {recording.owner_display_name || recording.owner_email}</strong>
            </button>
            <div className={styles.cardBody}>
              <div className={styles.cardTitle}><div><strong>{recording.title}</strong><span>{recording.owner_email}</span></div><em className={styles.sharedStatus}>{recording.share_permission === 'viewer_download' ? 'View + download' : 'View only'}</em></div>
              <div className={styles.metadata}><span>{formatDuration(Number(recording.duration_seconds))}</span><span>{recording.resolution}</span><span>{new Date(recording.created_at).toLocaleDateString()}</span></div>
              <CloudRecordingWaveform recording={recording} />
              <div className={styles.cardActions}><Link href={`/share/${recording.id}`}>Open</Link>{recording.share_permission === 'viewer_download' && (recording.storage_url || recording.assets?.length) && <button onClick={() => void downloadCloudFiles(recording)}>All files ZIP</button>}{recording.share_permission === 'viewer_download' && recording.assets?.filter((asset) => asset.kind === 'cursor').map((asset) => <button key={`visualize-${asset.id}`} onClick={() => void openCloudCursor(recording.title, asset)}>Cursor player</button>)}</div>
            </div>
          </article>
        ))}
      </section>

      {preview && (
        <div className={styles.modalBackdrop} onMouseDown={() => setPreview(null)}>
          <section className={styles.previewModal} role="dialog" aria-modal="true" aria-label={`Preview ${preview.title}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}><div><span>Preview</span><h2>{preview.title}</h2></div><button onClick={() => setPreview(null)} aria-label="Close preview">×</button></div>
            <video src={preview.url} controls controlsList={preview.canDownload ? undefined : 'nodownload'} autoPlay playsInline />
          </section>
        </div>
      )}

      {cursorPreview && (
        <div className={styles.modalBackdrop} onMouseDown={() => setCursorPreview(null)}>
          <section className={styles.previewModal} role="dialog" aria-modal="true" aria-label={`Cursor path for ${cursorPreview.title}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}><div><span>Cursor trajectory</span><h2>{cursorPreview.title}</h2></div><button onClick={() => setCursorPreview(null)} aria-label="Close cursor path">×</button></div>
            <div className={styles.cursorModalBody}><RecordedCursorTrajectory blob={cursorPreview.blob} /></div>
          </section>
        </div>
      )}

      {sharingRecording && (
        <div className={styles.modalBackdrop} onMouseDown={() => setSharingRecording(null)}>
          <section className={styles.shareModal} role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}><div><span>Access control</span><h2 id="share-title">Share “{sharingRecording.title}”</h2></div><button onClick={() => setSharingRecording(null)} aria-label="Close sharing controls">×</button></div>
            <div className={styles.publicControl}>
              <div><strong>Public link</strong><span>{sharingRecording.is_public ? 'Anyone with the link can view this recording.' : 'Only you and explicit recipients can open the share page.'}</span></div>
              <button onClick={() => void togglePublic(sharingRecording)}>{sharingRecording.is_public ? 'Disable' : 'Enable'}</button>
              {sharingRecording.is_public && <button onClick={() => void copyShareLink(sharingRecording.id)}>Copy link</button>}
            </div>
            <div className={styles.grantForm}>
              <label><span>Registered user email</span><input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="teammate@example.com" /></label>
              <label><span>Permission</span><select value={permission} onChange={(event) => setPermission(event.target.value as typeof permission)}><option value="viewer">Viewer</option><option value="viewer_download">Viewer + download</option></select></label>
              <button onClick={() => void grantAccess()} disabled={shareBusy || !recipientEmail.trim()}>{shareBusy ? 'Saving…' : 'Grant access'}</button>
            </div>
            <div className={styles.recipientList}>
              <div className={styles.recipientHeading}><strong>People with access</strong><span>{shares.length}</span></div>
              {!shareBusy && shares.length === 0 && <p>No direct recipients yet.</p>}
              {shares.map((share) => (
                <div key={share.recipient_user_id}><div><strong>{share.display_name || share.email}</strong><span>{share.email} · {share.permission === 'viewer_download' ? 'Viewer + download' : 'Viewer'}</span></div><button onClick={() => void revokeAccess(share)} disabled={shareBusy}>Revoke</button></div>
              ))}
            </div>
          </section>
        </div>
      )}
    </WorkspaceShell>
  );
}
