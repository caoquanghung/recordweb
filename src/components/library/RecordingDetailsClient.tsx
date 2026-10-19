'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppSidebar } from '@/components/app/AppSidebar';
import {
  RecordedAudioWaveforms,
  type RecordedWaveformSource,
} from '@/components/review/RecordedAudioWaveforms';
import { isRecordedWaveformPeaks } from '@/lib/audioWaveform';
import { downloadRecordingArchive } from '@/lib/recordingArchive';
import type { DbRecording, DbSharedRecording } from '@/types/database';
import styles from './RecordingDetailsClient.module.css';

type DetailRecord = {
  recording: DbRecording | DbSharedRecording;
  access: 'owner' | 'shared';
};

type Chapter = {
  label: string;
  seconds: number;
};

const ICON_ROOT = '/figma/recording-details';

function DetailIcon({ name, size = 20 }: { name: string; size?: number }) {
  return <Image src={`${ICON_ROOT}/${name}.svg`} alt="" width={size} height={size} aria-hidden="true" />;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number) {
  const safeBytes = Math.max(0, Number(bytes) || 0);
  if (safeBytes < 1024 * 1024) return `${Math.max(1, Math.round(safeBytes / 1024))} KB`;
  if (safeBytes < 1024 * 1024 * 1024) return `${(safeBytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(safeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function waveformSource(
  recording: DbRecording,
  kind: 'audio' | 'microphone-audio' | 'system-audio',
): RecordedWaveformSource | undefined {
  const asset = recording.assets?.find((candidate) => candidate.kind === kind);
  if (asset) {
    const peaks = asset.metadata.waveformPeaks;
    return {
      mimeType: asset.mime_type,
      waveformPeaks: isRecordedWaveformPeaks(peaks) ? peaks : undefined,
      src: asset.storage_url,
    };
  }

  if (kind !== 'audio' || !recording.storage_url) return undefined;
  const peaks = recording.settings.waveformPeaks;
  return {
    mimeType: recording.mime_type,
    waveformPeaks: isRecordedWaveformPeaks(peaks) ? peaks : undefined,
    src: recording.storage_url,
  };
}

function getChapters(settings: Record<string, unknown>): Chapter[] {
  if (!Array.isArray(settings.chapters)) return [];

  return settings.chapters
    .map((value): Chapter | null => {
      if (!value || typeof value !== 'object') return null;
      const entry = value as Record<string, unknown>;
      const seconds = typeof entry.seconds === 'number'
        ? entry.seconds
        : typeof entry.time === 'number' ? entry.time : Number.NaN;
      const label = typeof entry.label === 'string'
        ? entry.label
        : typeof entry.title === 'string' ? entry.title : '';
      if (!Number.isFinite(seconds) || seconds < 0 || !label.trim()) return null;
      return { seconds, label: label.trim() };
    })
    .filter((chapter): chapter is Chapter => chapter !== null)
    .sort((left, right) => left.seconds - right.seconds);
}

function StatusPage({ kind, message }: { kind: 'loading' | 'error'; message?: string }) {
  return (
    <div className={styles.shell}>
      <AppSidebar activeHref="/library" />
      <main className={styles.main}>
        <header className={styles.topBar}>
          <Link className={styles.backLink} href="/library">
            <DetailIcon name="back" size={20} />
            Quay lại thư viện
          </Link>
        </header>
        <div className={styles.stateWrap}>
          <section className={styles.stateCard} role={kind === 'error' ? 'alert' : 'status'}>
            <span className={styles.stateIcon}><DetailIcon name={kind === 'error' ? 'storage' : 'aspect'} size={26} /></span>
            <h1>{kind === 'loading' ? 'Đang tải bài giảng…' : 'Không thể mở bài giảng'}</h1>
            <p>{message ?? 'Dữ liệu và các tệp ghi hình đang được chuẩn bị.'}</p>
            {kind === 'error' && <Link href="/library">Trở về thư viện</Link>}
          </section>
        </div>
      </main>
    </div>
  );
}

export function RecordingDetailsClient({ recordingId }: { recordingId: string }) {
  const [detail, setDetail] = useState<DetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecording() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/recordings', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Không thể tải thư viện bài giảng.');
        const owned = (data.recordings as DbRecording[] | undefined)?.find((item) => item.id === recordingId);
        const shared = (data.sharedRecordings as DbSharedRecording[] | undefined)?.find((item) => item.id === recordingId);
        const resolved = owned
          ? { recording: owned, access: 'owner' as const }
          : shared ? { recording: shared, access: 'shared' as const } : null;
        if (!resolved) throw new Error('Bài giảng không tồn tại hoặc bạn không có quyền truy cập.');
        if (!cancelled) setDetail(resolved);
      } catch (loadError) {
        if (!cancelled) setError((loadError as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRecording();
    return () => { cancelled = true; };
  }, [recordingId]);

  const recording = detail?.recording;
  const isOwner = detail?.access === 'owner';
  const hasDownloadPermission = Boolean(recording && (isOwner || ('share_permission' in recording && recording.share_permission === 'viewer_download')));
  const canDownload = Boolean(
    recording
    && hasDownloadPermission
    && (recording.storage_url || recording.assets?.length),
  );
  const chapters = useMemo(() => recording ? getChapters(recording.settings) : [], [recording]);
  const mixed = recording ? waveformSource(recording, 'audio') : undefined;
  const microphone = recording ? waveformSource(recording, 'microphone-audio') : undefined;
  const systemAudio = recording ? waveformSource(recording, 'system-audio') : undefined;
  const screenAsset = recording?.assets?.find((asset) => asset.kind === 'screen');
  const webcamAsset = recording?.assets?.find((asset) => asset.kind === 'webcam');
  const cursorAsset = recording?.assets?.find((asset) => asset.kind === 'cursor');

  const copyShareLink = async () => {
    if (!recording) return;
    setShareBusy(true);
    setMessage('');
    try {
      if (isOwner && !recording.is_public) {
        const response = await fetch('/api/recordings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: recording.id, is_public: true }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Không thể bật liên kết chia sẻ.');
        setDetail({ recording: data.recording, access: 'owner' });
      }
      await navigator.clipboard.writeText(`${window.location.origin}/share/${recording.id}`);
      setMessage('Đã sao chép liên kết bài giảng.');
    } catch (shareError) {
      setMessage((shareError as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  const downloadFiles = async () => {
    if (!recording || !canDownload) return;
    const assets = recording.assets?.map((asset) => ({
      kind: asset.kind,
      mimeType: asset.mime_type,
      storageUrl: asset.storage_url,
    })) ?? [];
    if (recording.storage_url && !assets.some((asset) => asset.kind === 'composite')) {
      assets.unshift({ kind: 'composite', mimeType: recording.mime_type, storageUrl: recording.storage_url });
    }
    setDownloadBusy(true);
    setMessage('Đang chuẩn bị tệp tải xuống…');
    try {
      await downloadRecordingArchive(recording.title, assets);
      setMessage('Tệp bài giảng đã sẵn sàng tải xuống.');
    } catch (downloadError) {
      setMessage((downloadError as Error).message);
    } finally {
      setDownloadBusy(false);
    }
  };

  const seekToChapter = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = seconds;
    videoRef.current.focus();
  };

  if (loading) return <StatusPage kind="loading" />;
  if (error || !recording) return <StatusPage kind="error" message={error} />;

  const ownerName = 'owner_display_name' in recording
    ? recording.owner_display_name || recording.owner_email
    : 'Bạn';
  const accessDescription = isOwner
    ? 'Chủ sở hữu'
    : 'share_permission' in recording && recording.share_permission === 'viewer_download'
      ? 'Xem và tải'
      : 'Chỉ xem';
  const sources = [
    screenAsset ? { label: 'Màn hình bài giảng', detail: screenAsset.resolution || recording.resolution, icon: 'aspect' } : null,
    webcamAsset ? { label: 'Camera giảng viên', detail: webcamAsset.resolution || 'Nguồn camera', icon: 'user' } : null,
    microphone ? { label: 'Microphone', detail: 'Âm thanh giọng nói', icon: 'audio' } : null,
    systemAudio ? { label: 'Âm thanh hệ thống', detail: 'Âm thanh thiết bị', icon: 'system-audio' } : null,
    cursorAsset ? { label: 'Dữ liệu con trỏ', detail: 'Quỹ đạo đã lưu', icon: 'cursor' } : null,
  ].filter((source): source is { label: string; detail: string; icon: string } => source !== null);

  return (
    <div className={styles.shell}>
      <AppSidebar activeHref="/library" />
      <main className={styles.main}>
        <header className={styles.topBar}>
          <Link className={styles.backLink} href="/library">
            <DetailIcon name="back" size={20} />
            Quay lại thư viện
          </Link>
          <span className={styles.topLabel}>Chi tiết bài giảng</span>
        </header>

        <div className={styles.content}>
          <section className={styles.summaryCard} aria-labelledby="recording-title">
            <div className={styles.summaryCopy}>
              <div className={styles.breadcrumb}><Link href="/library">Thư viện</Link><span>/</span><span>Chi tiết bài giảng</span></div>
              <div className={styles.titleRow}>
                <h1 id="recording-title">{recording.title}</h1>
                <span className={styles.readyBadge}><DetailIcon name="status-check" size={14} />Sẵn sàng</span>
              </div>
              <div className={styles.metadata}>
                <span><DetailIcon name="calendar" size={17} />{formatDate(recording.created_at)}</span>
                <span><DetailIcon name="duration" size={17} />{formatDuration(Number(recording.duration_seconds))}</span>
                <span><DetailIcon name="size" size={17} />{formatBytes(Number(recording.file_size_bytes))}</span>
                <span><DetailIcon name="aspect" size={17} />{recording.resolution || 'Không rõ'}</span>
              </div>
            </div>
            <div className={styles.summaryActions}>
              {canDownload && (
                <button type="button" className={styles.secondaryButton} onClick={() => void downloadFiles()} disabled={downloadBusy}>
                  <DetailIcon name="download" size={18} />{downloadBusy ? 'Đang chuẩn bị…' : 'Tải xuống'}
                </button>
              )}
              <button type="button" className={styles.primaryButton} onClick={() => void copyShareLink()} disabled={shareBusy}>
                <DetailIcon name="share" size={18} />{shareBusy ? 'Đang xử lý…' : 'Chia sẻ'}
              </button>
            </div>
          </section>

          {message && <p className={styles.notice} role="status">{message}</p>}

          <div className={styles.workspace}>
            <div className={styles.leftColumn}>
              <section className={styles.card} aria-labelledby="video-heading">
                <div className={styles.cardHeader}>
                  <div><span className={styles.cardIcon}><DetailIcon name="aspect" size={20} /></span><div><h2 id="video-heading">Video bài giảng</h2><p>Bản ghi tổng hợp màn hình và camera</p></div></div>
                  <span className={styles.videoMeta}>{recording.resolution} · {recording.fps} FPS</span>
                </div>
                <div className={styles.videoFrame}>
                  {recording.storage_url ? (
                    <video ref={videoRef} src={recording.storage_url} controls controlsList={hasDownloadPermission ? undefined : 'nodownload'} playsInline preload="metadata" />
                  ) : (
                    <div className={styles.missingMedia}><DetailIcon name="aspect" size={30} /><strong>Chưa có video tổng hợp</strong><span>Thông tin bài giảng vẫn được lưu an toàn.</span></div>
                  )}
                </div>
              </section>

              <section className={`${styles.card} ${styles.waveformCard}`} aria-labelledby="audio-heading">
                <div className={styles.cardHeader}>
                  <div><span className={styles.cardIcon}><DetailIcon name="audio" size={20} /></span><div><h2 id="audio-heading">Âm thanh bài giảng</h2><p>Dạng sóng của bản phối hoàn chỉnh</p></div></div>
                </div>
                {mixed ? (
                  <RecordedAudioWaveforms durationSeconds={Number(recording.duration_seconds)} mixed={mixed} microphone={microphone} systemAudio={systemAudio} compact />
                ) : (
                  <div className={styles.emptyInline}>Bài giảng này chưa có dữ liệu dạng sóng âm thanh.</div>
                )}
              </section>

              <section className={styles.card} aria-labelledby="sources-heading">
                <button className={styles.disclosure} type="button" onClick={() => setSourcesExpanded((current) => !current)} aria-expanded={sourcesExpanded}>
                  <span><span className={styles.cardIcon}><DetailIcon name="system-audio" size={20} /></span><span><strong id="sources-heading">Nguồn ghi & hiệu ứng</strong><small>Các thành phần đã lưu cùng bài giảng</small></span></span>
                  <span className={sourcesExpanded ? styles.chevronOpen : ''}><DetailIcon name="chevron" size={18} /></span>
                </button>
                {sourcesExpanded && (
                  <div className={styles.sourceGrid}>
                    {sources.length > 0 ? sources.map((source) => (
                      <div className={styles.sourceItem} key={source.label}>
                        <span><DetailIcon name={source.icon} size={19} /></span>
                        <div><strong>{source.label}</strong><small>{source.detail}</small></div>
                        <i aria-hidden="true" />
                      </div>
                    )) : <div className={styles.emptyInline}>Không có nguồn phụ được lưu cho bài giảng này.</div>}
                  </div>
                )}
              </section>
            </div>

            <aside className={styles.rightColumn} aria-label="Thông tin bổ sung">
              <section className={`${styles.card} ${styles.shareCard}`}>
                <span className={styles.railIcon}><DetailIcon name="share-panel" size={24} /></span>
                <h2>Chia sẻ bài giảng</h2>
                <p>{isOwner ? 'Gửi liên kết để học sinh xem bài giảng.' : `Được chia sẻ bởi ${ownerName}.`}</p>
                <button type="button" onClick={() => void copyShareLink()} disabled={shareBusy}>
                  <DetailIcon name="copy" size={17} />Sao chép liên kết
                </button>
                <span className={styles.accessLabel}>{isOwner ? (recording.is_public ? 'Liên kết đang công khai' : 'Liên kết sẽ được bật khi sao chép') : 'Liên kết dành cho người được chia sẻ'}</span>
              </section>

              <section className={styles.card} aria-labelledby="chapters-heading">
                <div className={styles.railHeader}><div><span className={styles.cardIcon}><DetailIcon name="bookmark" size={20} /></span><h2 id="chapters-heading">Nội dung bài giảng</h2></div><span>{chapters.length}</span></div>
                {chapters.length > 0 ? (
                  <ol className={styles.chapterList}>
                    {chapters.map((chapter, index) => (
                      <li key={`${chapter.seconds}-${chapter.label}`}>
                        <button type="button" onClick={() => seekToChapter(chapter.seconds)} disabled={!recording.storage_url}>
                          <span className={styles.chapterNumber}>{index + 1}</span>
                          <span><strong>{chapter.label}</strong><small>{formatDuration(chapter.seconds)}</small></span>
                          <DetailIcon name="chapter-play" size={18} />
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className={styles.emptyChapters}><DetailIcon name="bookmark" size={24} /><strong>Chưa có chương</strong><span>Bài giảng này chưa lưu mốc nội dung.</span></div>
                )}
              </section>

              <section className={styles.card} aria-labelledby="info-heading">
                <div className={styles.railHeader}><div><span className={styles.cardIcon}><DetailIcon name="storage" size={20} /></span><h2 id="info-heading">Thông tin tệp</h2></div></div>
                <dl className={styles.fileInfo}>
                  <div><dt>Định dạng</dt><dd>{recording.mime_type.split(';')[0].replace('video/', '').toUpperCase()}</dd></div>
                  <div><dt>Độ phân giải</dt><dd>{recording.resolution || '—'}</dd></div>
                  <div><dt>Tốc độ khung hình</dt><dd>{recording.fps ? `${recording.fps} FPS` : '—'}</dd></div>
                  <div><dt>Kích thước</dt><dd>{formatBytes(Number(recording.file_size_bytes))}</dd></div>
                  <div><dt>Quyền truy cập</dt><dd>{accessDescription}</dd></div>
                </dl>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
