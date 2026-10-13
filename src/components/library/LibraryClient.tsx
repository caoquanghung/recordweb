'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceShell } from '@/components/app/WorkspaceShell';
import { RecordedAudioWaveform } from '@/components/review/RecordedAudioWaveform';
import { deleteLocalRecording, getAllLocalRecordings } from '@/lib/idb';
import { isRecordedWaveformPeaks } from '@/lib/audioWaveform';
import type { DbRecording, DbRecordingShare, DbSharedRecording } from '@/types/database';
import type { RecordingAssetKind, RecordingMetadata } from '@/types/recording';
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

function extensionForMimeType(mimeType: string) {
  const baseType = mimeType.split(';', 1)[0].toLowerCase();
  if (baseType === 'audio/mp4') return 'm4a';
  if (baseType.endsWith('/mp4')) return 'mp4';
  return 'webm';
}

function cloudWaveform(recording: DbRecording) {
  const audioAsset = recording.assets?.find((asset) => asset.kind === 'audio');
  const assetPeaks = audioAsset?.metadata.waveformPeaks;
  const recordingPeaks = recording.settings.waveformPeaks;
  return {
    mimeType: audioAsset?.mime_type ?? recording.mime_type,
    peaks: isRecordedWaveformPeaks(assetPeaks)
      ? assetPeaks
      : isRecordedWaveformPeaks(recordingPeaks)
        ? recordingPeaks
        : undefined,
    src: audioAsset?.storage_url ?? recording.storage_url ?? undefined,
  };
}

function CloudRecordingWaveform({ recording }: { recording: DbRecording }) {
  const waveform = cloudWaveform(recording);
  if (!waveform.src) return null;
  return (
    <RecordedAudioWaveform
      src={waveform.src}
      durationSeconds={Number(recording.duration_seconds)}
      mimeType={waveform.mimeType}
      peaks={waveform.peaks}
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

  const downloadLocal = (recording: RecordingMetadata, kind: RecordingAssetKind = 'composite') => {
    const asset = kind === 'composite'
      ? recording.assets?.composite
      : recording.assets?.[kind];
    const blob = asset?.blob ?? (kind === 'composite' ? recording.blob : undefined);
    const mimeType = asset?.mimeType ?? recording.mimeType;
    if (!blob) return;
    const url = kind === 'composite' && recording.previewUrl
      ? recording.previewUrl
      : URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `recordweb-${recording.id}-${kind}.${extensionForMimeType(mimeType)}`;
    anchor.click();
    if (url !== recording.previewUrl) URL.revokeObjectURL(url);
  };

  const removeLocal = async (recording: RecordingMetadata) => {
    if (!window.confirm('Delete this recording from this browser? Cloud copies are not affected.')) return;
    await deleteLocalRecording(recording.id);
    setLocal((current) => current.filter((item) => item.id !== recording.id));
    setMessage('Local recording deleted.');
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
      actions={<><button className={styles.refreshButton} onClick={() => void loadLibrary()}>Refresh</button><Link className={styles.primaryAction} href="/">New recording</Link></>}
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
                <RecordedAudioWaveform
                  blob={recording.assets.audio.blob}
                  durationSeconds={recording.durationSeconds}
                  mimeType={recording.assets.audio.mimeType}
                  peaks={recording.assets.audio.waveformPeaks}
                  compact
                />
              )}
              <div className={styles.cardActions}>
                <button onClick={() => recording.previewUrl && setPreview({ title: recording.title, url: recording.previewUrl, canDownload: true })}>Preview</button>
                <button onClick={() => downloadLocal(recording)}>Composite</button>
                {(['webcam', 'screen', 'audio'] as RecordingAssetKind[]).map((kind) => recording.assets?.[kind]?.blob && (
                  <button key={kind} onClick={() => downloadLocal(recording, kind)}>{kind}</button>
                ))}
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
              <div className={styles.cardActions}><Link href={`/share/${recording.id}`}>Open</Link><button onClick={() => void openSharing(recording)}>Share</button>{recording.assets?.filter((asset) => asset.kind !== 'composite').map((asset) => <a key={asset.id} href={asset.storage_url} download>{asset.kind}</a>)}<button onClick={() => void togglePublic(recording)}>{recording.is_public ? 'Make private' : 'Make public'}</button><button className={styles.danger} onClick={() => void removeCloud(recording)}>Delete cloud</button></div>
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
              <div className={styles.cardActions}><Link href={`/share/${recording.id}`}>Open</Link>{recording.share_permission === 'viewer_download' && recording.storage_url && <a href={recording.storage_url} download>Composite</a>}{recording.share_permission === 'viewer_download' && recording.assets?.filter((asset) => asset.kind !== 'composite').map((asset) => <a key={asset.id} href={asset.storage_url} download>{asset.kind}</a>)}</div>
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
