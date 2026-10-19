'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppSidebar } from '@/components/app/AppSidebar';
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
type LibrarySort = 'newest' | 'oldest';
type LibraryIconName = 'search' | 'sync' | 'play' | 'share' | 'download' | 'cursor' | 'lock' | 'trash' | 'chevron';

type LibraryEntry =
  | { kind: 'local'; recording: RecordingMetadata; title: string; createdAt: number }
  | { kind: 'cloud'; recording: DbRecording; title: string; createdAt: number }
  | { kind: 'shared'; recording: DbSharedRecording; title: string; createdAt: number };

const PAGE_SIZE = 6;
const CLOUD_ALLOWANCE_BYTES = 50 * 1024 * 1024 * 1024;

function LibraryIcon({ name }: { name: LibraryIconName }) {
  const paths: Record<LibraryIconName, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    sync: <><path d="M20 12a8 8 0 0 0-14.9-4" /><path d="M5 3v5h5" /><path d="M4 12a8 8 0 0 0 14.9 4" /><path d="M19 21v-5h-5" /></>,
    play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></>,
    share: <><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></>,
    download: <><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M5 20h14" /></>,
    cursor: <><path d="m5 3 6.5 16 2.2-5.3L19 11.5Z" /><path d="m14 14 4 4" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
  };

  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function formatLibraryDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function RecordingThumbnail({
  src,
  badge,
  summary,
  title,
  onClick,
}: {
  src?: string | null;
  badge: string;
  summary: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button className={styles.thumbnail} type="button" onClick={onClick} aria-label={`Xem lại ${title}`} disabled={!src}>
      {src ? <video src={src} muted playsInline preload="metadata" tabIndex={-1} /> : <span className={styles.thumbnailFallback} aria-hidden="true" />}
      <span className={styles.thumbnailShade} aria-hidden="true" />
      <span className={styles.mediaBadge}>{badge}</span>
      <span className={styles.mediaSummary}>{summary}</span>
    </button>
  );
}

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
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('newest');
  const [page, setPage] = useState(1);
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

  const filteredEntries = useMemo<LibraryEntry[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    const visibleLocal = tab === 'mine' || tab === 'local' ? localOnly : [];
    const visibleCloud = tab === 'mine' || tab === 'cloud' ? cloud : [];
    const visibleShared = tab === 'shared' ? shared : [];
    const entries: LibraryEntry[] = [
      ...visibleLocal.map((recording) => ({
        kind: 'local' as const,
        recording,
        title: recording.title,
        createdAt: new Date(recording.createdAt).getTime(),
      })),
      ...visibleCloud.map((recording) => ({
        kind: 'cloud' as const,
        recording,
        title: recording.title,
        createdAt: new Date(recording.created_at).getTime(),
      })),
      ...visibleShared.map((recording) => ({
        kind: 'shared' as const,
        recording,
        title: recording.title,
        createdAt: new Date(recording.created_at).getTime(),
      })),
    ];

    return entries
      .filter((entry) => !normalizedQuery || entry.title.toLocaleLowerCase('vi').includes(normalizedQuery))
      .sort((left, right) => sort === 'newest' ? right.createdAt - left.createdAt : left.createdAt - right.createdAt);
  }, [cloud, localOnly, query, shared, sort, tab]);

  const visibleCount = filteredEntries.length;
  const pageCount = Math.max(1, Math.ceil(visibleCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedEntries = filteredEntries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const cloudBytes = cloud.reduce((total, recording) => total + Number(recording.file_size_bytes || 0), 0);
  const cloudGigabytes = cloudBytes / 1024 / 1024 / 1024;
  const storagePercent = Math.min(100, (cloudBytes / CLOUD_ALLOWANCE_BYTES) * 100);
  const totalCount = cloud.length + localOnly.length + shared.length;

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
    <div className={styles.libraryShell}>
      <AppSidebar activeHref="/library" />
      <main className={styles.libraryMain}>
        <div className={styles.libraryContent}>
          <header className={styles.summaryPanel}>
            <div className={styles.summaryCopy}>
              <div className={styles.summaryMeta}>
                <span className={styles.liveDot} aria-hidden="true" />
                <span className={styles.eyebrow}>Kho lưu trữ bài giảng</span>
                <span className={styles.countBadge}>{totalCount} bài giảng đã ghi</span>
              </div>
              <h1>Thư viện bài giảng đã ghi</h1>
              <p>Quản lý, xem lại và chia sẻ video bài giảng của Thầy/Cô cho học sinh một cách an toàn và thuận tiện.</p>
            </div>

            <section className={styles.storageCard} aria-label="Dung lượng lưu trữ bài giảng">
              <div className={styles.storageDetails}>
                <div className={styles.storageHeading}>
                  <span>Dung lượng học viện cấp</span>
                  <strong>{cloudGigabytes.toFixed(cloudGigabytes >= 1 ? 1 : 2)} / 50.0 GB ({storagePercent.toFixed(storagePercent >= 1 ? 0 : 2)}%)</strong>
                </div>
                <div className={styles.progressTrack} aria-hidden="true"><span style={{ width: `${Math.max(storagePercent, cloudBytes > 0 ? 2 : 0)}%` }} /></div>
                <small>Đã tự động sao lưu an toàn vào máy chủ trường</small>
              </div>
              <button className={styles.syncButton} type="button" onClick={() => void loadLibrary()} disabled={loading}>
                <LibraryIcon name="sync" />{loading ? 'Đang đồng bộ' : 'Đồng bộ ngay'}
              </button>
            </section>
          </header>

          <section className={styles.toolbarPanel} aria-label="Bộ lọc thư viện">
            <label className={styles.searchField}>
              <span className={styles.srOnly}>Tìm bài giảng</span>
              <LibraryIcon name="search" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm bài giảng" />
            </label>

            <div className={styles.tabs} role="tablist" aria-label="Lọc bài giảng">
              {([
                ['mine', 'Tất cả bài giảng', cloud.length + localOnly.length],
                ['shared', 'Được chia sẻ', shared.length],
                ['local', 'Chỉ trên máy', localOnly.length],
                ['cloud', 'Đã lưu đám mây', cloud.length],
              ] as Array<[LibraryTab, string, number]>).map(([value, label, count]) => (
                <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? styles.tabActive : ''} onClick={() => { setTab(value); setPage(1); }}>
                  {label} ({count})
                </button>
              ))}
            </div>

            <label className={styles.sortField}>
              <span className={styles.sortGlyph} aria-hidden="true">↕</span>
              <span className={styles.srOnly}>Sắp xếp bài giảng</span>
              <select value={sort} onChange={(event) => { setSort(event.target.value as LibrarySort); setPage(1); }}>
                <option value="newest">Mới nhất trước</option>
                <option value="oldest">Cũ nhất trước</option>
              </select>
            </label>
          </section>

          {message && <p className={styles.message} role="status">{message}</p>}
          {loading && <div className={styles.empty} aria-busy="true">Đang tải thư viện bài giảng…</div>}
          {!loading && visibleCount === 0 && (
            <div className={styles.empty}>
              <strong>Chưa có bài giảng trong mục này</strong>
              <span>{query ? 'Thử một từ khoá khác hoặc xoá bộ lọc tìm kiếm.' : 'Quay bài giảng trong Studio hoặc chọn một bộ lọc khác.'}</span>
              {!query && <Link href="/">Ghi bài giảng mới</Link>}
            </div>
          )}

          {!loading && visibleCount > 0 && (
            <section className={styles.recordingGrid} aria-label="Danh sách bài giảng">
              {paginatedEntries.map((entry) => {
                if (entry.kind === 'local') {
                  const recording = entry.recording;
                  const canDownload = Boolean(recording.blob || RECORDING_ARCHIVE_KINDS.some((kind) => recording.assets?.[kind]?.blob));
                  return (
                    <article className={styles.card} key={`local-${recording.id}`}>
                      <RecordingThumbnail
                        src={recording.previewUrl}
                        badge="Bài giảng trên máy"
                        summary={`${formatDuration(recording.durationSeconds)} • ${formatBytes(recording.fileSizeBytes)}`}
                        title={recording.title}
                        onClick={() => recording.previewUrl && setPreview({ title: recording.title, url: recording.previewUrl, canDownload: true })}
                      />
                      <div className={styles.cardBody}>
                        <div className={styles.cardCopy}>
                          <h2>{recording.title}</h2>
                          <p>Bản ghi được lưu an toàn trong trình duyệt này và chưa đồng bộ lên đám mây.</p>
                        </div>
                        <div className={styles.cardMeta}><span><i className={styles.readyDot} />Sẵn sàng xem lại</span><time>{formatLibraryDate(recording.createdAt)}</time></div>
                        {recording.assets?.audio?.blob && <div className={styles.waveform}><RecordedAudioWaveforms durationSeconds={recording.durationSeconds} mixed={recording.assets.audio} microphone={recording.assets['microphone-audio']} systemAudio={recording.assets['system-audio']} compact /></div>}
                        <div className={styles.cardActions}>
                          {recording.previewUrl && <button className={styles.primaryCardButton} type="button" onClick={() => setPreview({ title: recording.title, url: recording.previewUrl!, canDownload: true })}><LibraryIcon name="play" />Xem lại</button>}
                          {canDownload && <button type="button" onClick={() => void downloadLocalFiles(recording)}><LibraryIcon name="download" />Tải về</button>}
                          {recording.assets?.cursor?.blob && <button type="button" onClick={() => setCursorPreview({ title: recording.title, blob: recording.assets!.cursor!.blob! })}><LibraryIcon name="cursor" />Con trỏ</button>}
                          <button className={styles.danger} type="button" onClick={() => void removeLocal(recording)}><LibraryIcon name="trash" />Xoá</button>
                        </div>
                      </div>
                    </article>
                  );
                }

                if (entry.kind === 'cloud') {
                  const recording = entry.recording;
                  return (
                    <article className={styles.card} key={`cloud-${recording.id}`}>
                      <RecordingThumbnail
                        src={recording.storage_url}
                        badge={recording.is_public ? 'Đã gửi lớp học' : 'Bài giảng đám mây'}
                        summary={`${formatDuration(Number(recording.duration_seconds))} • ${formatBytes(Number(recording.file_size_bytes))}`}
                        title={recording.title}
                        onClick={() => recording.storage_url && setPreview({ title: recording.title, url: recording.storage_url, canDownload: true })}
                      />
                      <div className={styles.cardBody}>
                        <div className={styles.cardCopy}>
                          <h2>{recording.title}</h2>
                          <p>{recording.is_public ? 'Bài giảng đã sẵn sàng chia sẻ qua liên kết cho học sinh.' : 'Bài giảng riêng tư đã được đồng bộ an toàn lên đám mây.'}</p>
                        </div>
                        <div className={styles.cardMeta}><span>{recording.is_public ? 'Liên kết công khai' : recording.resolution}</span><time>{formatLibraryDate(recording.created_at)}</time></div>
                        <div className={styles.waveform}><CloudRecordingWaveform recording={recording} /></div>
                        <div className={styles.cardActions}>
                          <Link className={styles.primaryCardButton} href={`/library/${recording.id}`}><LibraryIcon name="play" />Xem lại</Link>
                          <button type="button" onClick={() => void openSharing(recording)}><LibraryIcon name="share" />Chia sẻ</button>
                          {(recording.storage_url || recording.assets?.length) && <button type="button" onClick={() => void downloadCloudFiles(recording)}><LibraryIcon name="download" />Tải về</button>}
                          {recording.assets?.filter((asset) => asset.kind === 'cursor').map((asset) => <button type="button" key={`visualize-${asset.id}`} onClick={() => void openCloudCursor(recording.title, asset)}><LibraryIcon name="cursor" />Con trỏ</button>)}
                          <button type="button" onClick={() => void togglePublic(recording)}><LibraryIcon name="lock" />{recording.is_public ? 'Đặt riêng tư' : 'Mở liên kết'}</button>
                          <button className={styles.danger} type="button" onClick={() => void removeCloud(recording)}><LibraryIcon name="trash" />Xoá</button>
                        </div>
                      </div>
                    </article>
                  );
                }

                const recording = entry.recording;
                return (
                  <article className={styles.card} key={`shared-${recording.id}`}>
                    <RecordingThumbnail
                      src={recording.storage_url}
                      badge="Được chia sẻ"
                      summary={`${formatDuration(Number(recording.duration_seconds))} • ${recording.resolution}`}
                      title={recording.title}
                      onClick={() => recording.storage_url && setPreview({ title: recording.title, url: recording.storage_url, canDownload: recording.share_permission === 'viewer_download' })}
                    />
                    <div className={styles.cardBody}>
                      <div className={styles.cardCopy}>
                        <h2>{recording.title}</h2>
                        <p>Được chia sẻ bởi {recording.owner_display_name || recording.owner_email}.</p>
                      </div>
                      <div className={styles.cardMeta}><span>{recording.share_permission === 'viewer_download' ? 'Được xem và tải' : 'Chỉ được xem'}</span><time>{formatLibraryDate(recording.created_at)}</time></div>
                      <div className={styles.waveform}><CloudRecordingWaveform recording={recording} /></div>
                      <div className={styles.cardActions}>
                        <Link className={styles.primaryCardButton} href={`/library/${recording.id}`}><LibraryIcon name="play" />Xem lại</Link>
                        {recording.share_permission === 'viewer_download' && (recording.storage_url || recording.assets?.length) && <button type="button" onClick={() => void downloadCloudFiles(recording)}><LibraryIcon name="download" />Tải về</button>}
                        {recording.share_permission === 'viewer_download' && recording.assets?.filter((asset) => asset.kind === 'cursor').map((asset) => <button type="button" key={`visualize-${asset.id}`} onClick={() => void openCloudCursor(recording.title, asset)}><LibraryIcon name="cursor" />Con trỏ</button>)}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {!loading && visibleCount > 0 && (
            <footer className={styles.libraryFooter}>
              <p><span aria-hidden="true" />Tất cả bài giảng đã được đồng bộ an toàn • Hiển thị {(currentPage - 1) * PAGE_SIZE + 1} – {Math.min(currentPage * PAGE_SIZE, visibleCount)} trên tổng số {visibleCount} bài giảng</p>
              <nav className={styles.pagination} aria-label="Phân trang thư viện">
                <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>‹ <span>Trang trước</span></button>
                {Array.from({ length: pageCount }, (_, index) => index + 1).slice(Math.max(0, currentPage - 3), Math.min(pageCount, currentPage + 2)).map((pageNumber) => (
                  <button type="button" key={pageNumber} className={pageNumber === currentPage ? styles.currentPage : ''} aria-current={pageNumber === currentPage ? 'page' : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>
                ))}
                <button type="button" onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage === pageCount}><span>Trang sau</span> ›</button>
              </nav>
            </footer>
          )}
        </div>

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
      </main>
    </div>
  );
}
