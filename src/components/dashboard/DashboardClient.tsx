'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSidebar } from '@/components/app/AppSidebar';
import { getAllLocalRecordings, getRecordingDraftSummaries, type RecordingDraftSummary } from '@/lib/idb';
import type { DbRecording, DbStudioPreset } from '@/types/database';
import styles from './DashboardClient.module.css';

const quickStarts = [
  { title: 'Trình chiếu bài giảng', detail: 'Màn hình, camera và giọng nói rõ ràng', mode: 'screen-pip', background: 'original', audioMode: 'Voice clarity' },
  { title: 'Hướng dẫn thực hành', detail: 'Ưu tiên màn hình với camera thu gọn', mode: 'screen-pip', background: 'original', audioMode: 'Natural' },
  { title: 'Lời nhắn qua camera', detail: 'Chỉ dùng camera với hình ảnh gốc', mode: 'webcam-only', background: 'original', audioMode: 'Voice clarity' },
  { title: 'Giới thiệu sản phẩm', detail: 'Màn hình và người trình bày', mode: 'screen-pip', background: 'original', audioMode: 'Podcast' },
  { title: 'Bài giảng trực tuyến', detail: 'Ghi màn hình với lọc tiếng ồn', mode: 'screen-pip', background: 'original', audioMode: 'Noise reduction' },
];

const dashboardAsset = (name: string) => `/figma/dashboard/${name}`;

function formatLongDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  if (minutes === 0) return `${remainder} giây`;
  return `${minutes} phút${remainder ? ` ${remainder} giây` : ''}`;
}

function Icon({ src, size = 18 }: { src: string; size?: number }) {
  return <Image src={dashboardAsset(src)} alt="" width={size} height={size} aria-hidden="true" />;
}

export function DashboardClient() {
  const { userId } = useAuth();
  const router = useRouter();
  const [recordings, setRecordings] = useState<DbRecording[]>([]);
  const [presets, setPresets] = useState<DbStudioPreset[]>([]);
  const [drafts, setDrafts] = useState<RecordingDraftSummary[]>([]);
  const [localCount, setLocalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadDashboard = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [recordingResponse, presetResponse, local, storedDrafts] = await Promise.all([
        fetch('/api/recordings', { cache: 'no-store' }),
        fetch('/api/presets', { cache: 'no-store' }),
        getAllLocalRecordings(),
        getRecordingDraftSummaries(userId),
      ]);
      const recordingData = await recordingResponse.json();
      const presetData = await presetResponse.json();
      if (!recordingResponse.ok) throw new Error(recordingData.error ?? 'Không thể tải danh sách bài giảng.');
      if (!presetResponse.ok) throw new Error(presetData.error ?? 'Không thể tải cấu hình đã lưu.');
      setRecordings(recordingData.recordings ?? []);
      setPresets(presetData.presets ?? []);
      setLocalCount(local.length);
      setDrafts(storedDrafts);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadDashboard]);

  const cloudBytes = useMemo(
    () => recordings.reduce((total, recording) => total + Number(recording.file_size_bytes || 0), 0),
    [recordings],
  );

  const startQuickRecording = (configuration: typeof quickStarts[number]) => {
    localStorage.setItem('recordweb-quick-start', JSON.stringify(configuration));
    router.push('/studio');
  };

  const openPresetInStudio = (preset: DbStudioPreset) => {
    localStorage.setItem('recordweb-pending-preset', JSON.stringify(preset));
    router.push('/studio');
  };

  const deletePreset = async (id: string) => {
    if (!window.confirm('Xoá cấu hình đã lưu này?')) return;
    const response = await fetch('/api/presets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? 'Không thể xoá cấu hình.');
      return;
    }
    setPresets((current) => current.filter((preset) => preset.id !== id));
    setMessage('Đã xoá cấu hình.');
  };

  const recentRecordings = recordings.slice(0, drafts.length > 0 ? 2 : 3);
  const recentCount = Math.min(3, recentRecordings.length + (drafts.length > 0 ? 1 : 0));

  return (
    <div className={styles.dashboardShell}>
      <AppSidebar behavior="adaptive" activeHref="/dashboard" />

      <main className={styles.dashboardMain}>
        <div className={styles.dashboardContent}>
          {drafts.length > 0 && (
            <section className={styles.recoveryBanner} aria-labelledby="recovery-title">
              <div className={styles.recoveryLead}>
                <span className={styles.alertIcon}><Icon src="alert.svg" size={30} /></span>
                <div className={styles.recoveryCopy}>
                  <div className={styles.recoveryMeta}>
                    <span className={styles.urgentBadge}><i />Cần xử lý ngay</span>
                    <span>Chưa hoàn tất lưu trữ</span>
                  </div>
                  <h2 id="recovery-title">
                    {drafts.length} bản ghi chưa lưu thành công <small>(có bản sao lưu trên thiết bị này)</small>
                  </h2>
                  <p>Hãy lưu lại bản ghi để hoàn tất tải lên. Giữ trang mở cho đến khi quá trình lưu trữ kết thúc.</p>
                </div>
              </div>
              <div className={styles.recoveryActions}>
                <Link className={styles.secondaryButton} href="/studio">
                  <Icon src="eye.svg" />
                  Xem lại hoặc huỷ
                </Link>
                <Link className={styles.dangerButton} href={`/studio?recover=${encodeURIComponent(drafts[0].id)}`}>
                  <Icon src="save.svg" />
                  Lưu bài giảng ngay
                </Link>
              </div>
            </section>
          )}

          {message && <p className={styles.message} role="status">{message}</p>}

          <section className={styles.hero} aria-labelledby="dashboard-heading">
            <div className={styles.heroCopy}>
              <span className={styles.greeting}><Icon src="greeting.svg" />Kính chào Thầy/Cô</span>
              <h1 id="dashboard-heading">Hôm nay Thầy/Cô muốn giảng bài gì?</h1>
              <p>Chỉ cần một bấm chuột, hệ thống sẽ tự động bật máy ảnh, mở trình chiếu slide và thu âm bài giảng rõ ràng, sắc nét.</p>
            </div>
            <button className={styles.heroButton} type="button" onClick={() => startQuickRecording(quickStarts[0])}>
              <Icon src="video.svg" size={27} />
              Bắt đầu ghi bài giảng mới
            </button>
          </section>

          <section className={styles.recentSection} aria-labelledby="recent-title">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>
                <Icon src="lectures.svg" size={24} />
                <h2 id="recent-title">Bài giảng gần đây</h2>
                <span>{loading ? 'Đang tải' : `${recentCount} bài gần nhất`}</span>
              </div>
              <Link href="/library">Xem toàn bộ thư viện <Icon src="arrow.svg" size={14} /></Link>
            </div>

            <div className={styles.recordingGrid}>
              {loading && (
                <article className={styles.recordingCard} aria-busy="true">
                  <div className={styles.cardBody}>
                    <span className={`${styles.statusBadge} ${styles.statusProcessing}`}><Icon src="hourglass.svg" size={14} />Đang tải dữ liệu...</span>
                    <h3>Đang đồng bộ thư viện bài giảng</h3>
                    <p>Hệ thống đang lấy dữ liệu mới nhất</p>
                    <div className={`${styles.thumbnail} ${styles.processingThumbnail}`}>
                      <Image src={dashboardAsset('recording-processing.png')} alt="" fill sizes="(max-width: 720px) 100vw, 33vw" />
                      <span><Icon src="spinner.svg" size={27} />Vui lòng chờ trong giây lát</span>
                    </div>
                  </div>
                  <button className={styles.disabledAction} type="button" disabled><Icon src="processing.svg" />Đang tải bài giảng...</button>
                </article>
              )}

              {!loading && drafts.length > 0 && (
                <article className={`${styles.recordingCard} ${styles.draftCard}`}>
                  <div className={styles.cardBody}>
                    <span className={`${styles.statusBadge} ${styles.statusDraft}`}><i />Bản ghi chưa lưu thành công</span>
                    <h3>Bản ghi chưa hoàn tất gần nhất</h3>
                    <p>Đã quay được: {formatLongDuration(drafts[0].durationMs / 1000)}</p>
                    <div className={styles.thumbnail}>
                      <Image src={dashboardAsset('recording-draft.png')} alt="Xem trước bản ghi bài giảng chưa hoàn tất" fill sizes="(max-width: 720px) 100vw, 33vw" />
                    </div>
                  </div>
                  <button className={styles.primaryCardAction} type="button" onClick={() => router.push(`/studio?recover=${encodeURIComponent(drafts[0].id)}`)}>
                    <Icon src="save.svg" />Lưu lại bản ghi
                  </button>
                </article>
              )}

              {!loading && recentRecordings.map((recording) => (
                <article className={styles.recordingCard} key={recording.id}>
                  <div className={styles.cardBody}>
                    <span className={`${styles.statusBadge} ${styles.statusReady}`}><Icon src="check.svg" size={15} />Sẵn sàng xem</span>
                    <h3>{recording.title}</h3>
                    <p>Đã quay: {new Date(recording.recorded_at).toLocaleDateString('vi-VN')} • Thời lượng {formatLongDuration(Number(recording.duration_seconds))}</p>
                    <div className={styles.thumbnail}>
                      <Image src={dashboardAsset('recording-ready.png')} alt={`Xem trước ${recording.title}`} fill sizes="(max-width: 720px) 100vw, 33vw" />
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <Link className={styles.watchButton} href={`/share/${recording.id}`}><Icon src="watch.svg" size={20} />Xem lại</Link>
                    <Link className={styles.shareButton} href={`/share/${recording.id}`}><Icon src="share.svg" size={18} />Gửi sinh viên</Link>
                  </div>
                </article>
              ))}

              {!loading && recentCount === 0 && (
                <div className={styles.emptyState}>
                  <Icon src="video.svg" size={32} />
                  <h3>Chưa có bài giảng nào</h3>
                  <p>Bắt đầu bản ghi đầu tiên; dữ liệu chỉ được tải lên đám mây khi Thầy/Cô chủ động lưu.</p>
                  <button type="button" onClick={() => startQuickRecording(quickStarts[0])}>Ghi bài giảng mới</button>
                </div>
              )}
            </div>
          </section>

          <section className={styles.workspaceSection} aria-labelledby="workspace-title">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}><h2 id="workspace-title">Tổng quan không gian làm việc</h2></div>
            </div>
            <div className={styles.statsGrid} aria-label="Tóm tắt không gian làm việc">
              <article><span>Bản ghi đám mây</span><strong>{loading ? '—' : recordings.length}</strong><small>Đã lưu trên Neon + Blob</small></article>
              <article><span>Bản ghi cục bộ</span><strong>{loading ? '—' : localCount}</strong><small>Có trong trình duyệt này</small></article>
              <article><span>Dung lượng đám mây</span><strong>{loading ? '—' : `${(cloudBytes / 1024 / 1024).toFixed(1)} MB`}</strong><small>Theo metadata tệp ghi</small></article>
              <article><span>Cấu hình đã lưu</span><strong>{loading ? '—' : presets.length}</strong><small>Sẵn sàng dùng lại</small></article>
            </div>

            <div className={styles.utilityGrid}>
              <div className={styles.utilityPanel}>
                <div className={styles.utilityHeading}><span>Bắt đầu nhanh</span><h3>Chọn quy trình ghi</h3></div>
                <div className={styles.quickGrid}>
                  {quickStarts.map((item, index) => (
                    <button key={item.title} type="button" onClick={() => startQuickRecording(item)}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.utilityPanel}>
                <div className={styles.utilityHeading}><span>Cấu hình</span><h3>Thiết lập đã lưu</h3></div>
                <div className={styles.presetList}>
                  {!loading && presets.length === 0 && <p className={styles.emptyCopy}>Lưu một thiết lập từ bảng Hiệu ứng trong Studio để dùng lại tại đây.</p>}
                  {presets.slice(0, 5).map((preset) => (
                    <div className={styles.presetRow} key={preset.id}>
                      <div><strong>{preset.preset_name}</strong><small>{preset.pip_shape} · {preset.pip_size} · {preset.bg_removal_mode}</small></div>
                      <button type="button" onClick={() => openPresetInStudio(preset)}>Dùng</button>
                      <button className={styles.deleteButton} type="button" onClick={() => void deletePreset(preset.id)}>Xoá</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
