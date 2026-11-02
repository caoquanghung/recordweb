'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LibraryLayout } from '@/components/library/LibraryLayout';
import { LibraryCardGrid, LibraryRecordingCard } from '@/components/library/LibraryRecordingCard';
import { LibraryToolbar, LibraryPagination } from '@/components/library/LibraryControls';
import { RecordingPreviewDialog } from '@/components/library/LibraryDialogs';
import { formatLibraryDuration, LibraryIcon } from '@/components/library/LibraryPrimitives';
import { LIBRARY_PAGE_SIZE, type LibrarySort, type RecordingPreview } from '@/components/library/useLibraryController';
import { PENDING_RECORDINGS_HREF, recordingBackupTitle } from '@/lib/pendingRecordings';
import { loadRecordingBackupPreview } from '@/lib/recordingBackupClient';
import type { RecordingDraftSummary } from '@/lib/idb';
import { useRecordingRecovery } from './RecordingRecoveryProvider';
import { useRecordingBackupActions } from './useRecordingBackupActions';
import { RecordingPoster } from './RecordingPoster';
import styles from '@/components/library/LibraryClient.module.css';

export function PendingRecordingsClient() {
  const { userId } = useAuth();
  const { drafts, loading, error, refresh } = useRecordingRecovery();
  const { deletingId, message, removeBackup } = useRecordingBackupActions();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('newest');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<RecordingPreview | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const previewUrlRef = useRef<string | null>(null);
  const previewRequestRef = useRef(0);

  useEffect(() => () => {
    ++previewRequestRef.current;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, [userId]);

  const closePreview = () => {
    ++previewRequestRef.current;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
    setPreviewingId(null);
  };

  const openPreview = async (draft: RecordingDraftSummary) => {
    if (!userId) return;
    const request = ++previewRequestRef.current;
    setPreviewingId(draft.id);
    setPreviewError('');
    try {
      // Load only the selected backup, never every gallery video's full source files.
      const blob = await loadRecordingBackupPreview(draft.id, userId);
      if (request !== previewRequestRef.current) return;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreview({ title: recordingBackupTitle(draft.startedAt), url, canDownload: true });
    } catch (cause) {
      if (request === previewRequestRef.current) setPreviewError((cause as Error).message);
    } finally {
      if (request === previewRequestRef.current) setPreviewingId(null);
    }
  };

  const entries = useMemo(() => drafts.filter((draft) => recordingBackupTitle(draft.startedAt)
    .toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')))
    .sort((left, right) => (sort === 'newest' ? -1 : 1) * (Date.parse(left.startedAt) - Date.parse(right.startedAt))),
  [drafts, query, sort]);
  const pageCount = Math.max(1, Math.ceil(entries.length / LIBRARY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleEntries = entries.slice((currentPage - 1) * LIBRARY_PAGE_SIZE, currentPage * LIBRARY_PAGE_SIZE);

  return (
    <LibraryLayout
      activeHref={PENDING_RECORDINGS_HREF}
      eyebrow="Bản sao lưu trên thiết bị"
      countLabel={`${drafts.length} bản ghi cần xử lý`}
      title="Bài giảng chưa lưu"
      description="Xem lại và lưu các bản ghi chưa hoàn tất lên đám mây, hoặc xoá bản sao lưu không cần dùng."
      summary={
        <section className={styles.storageCard} aria-label="Thông tin bản sao lưu">
          <div className={styles.storageDetails}>
            <div className={styles.storageHeading}><strong>Chỉ có trên trình duyệt này</strong></div>
            <small>Giữ dữ liệu trình duyệt cho đến khi lưu xong. Thư viện bài giảng đã lưu vẫn nằm ở mục riêng.</small>
          </div>
          <button className={styles.syncButton} type="button" onClick={() => void refresh()} disabled={loading}>
            <LibraryIcon name="sync" />Làm mới
          </button>
        </section>
      }
      overlay={preview && <RecordingPreviewDialog preview={preview} onClose={closePreview} />}
    >
      <LibraryToolbar query={query} sort={sort}
        onQueryChange={(value) => { setQuery(value); setPage(1); }}
        onSortChange={(value) => { setSort(value); setPage(1); }} />

      {error && <p className={styles.message} role="alert">{error}</p>}
      {message && <p className={styles.message} role="status">{message}</p>}
      {previewError && <p className={styles.message} role="alert">{previewError}</p>}
      {previewingId && <p className={styles.message} role="status">Đang chuẩn bị video xem trước…</p>}
      {loading && <div className={styles.empty} aria-busy="true">Đang đọc bản sao lưu trên thiết bị…</div>}
      {!loading && entries.length === 0 && (
        <div className={styles.empty}>
          <strong>{query ? 'Không tìm thấy bản ghi phù hợp' : 'Không còn bài giảng chưa lưu'}</strong>
          <span>{query ? 'Thử ngày quay khác hoặc xoá bộ lọc tìm kiếm.' : 'Các bài giảng đã lưu thành công có trong Thư viện bài giảng.'}</span>
          <Link href="/library">Mở thư viện bài giảng</Link>
        </div>
      )}
      {!loading && visibleEntries.length > 0 && (
        <LibraryCardGrid label="Danh sách bài giảng chưa lưu">
          {visibleEntries.map((draft) => {
            const title = recordingBackupTitle(draft.startedAt);
            const deleting = deletingId === draft.id;
            return (
              <LibraryRecordingCard key={draft.id}
                title={title}
                description="Bấm vào ảnh để xem trước. Lưu lại để hoàn tất tải lên đám mây."
                thumbnail={{
                  poster: <RecordingPoster recordingId={draft.id} />,
                  badge: 'Chưa hoàn tất lưu', summary: formatLibraryDuration(draft.durationMs / 1000),
                  canPreview: !deleting && previewingId !== draft.id, onClick: () => void openPreview(draft),
                }}
                metadata={<><span>Bản sao lưu cục bộ</span><time dateTime={draft.startedAt}>{new Date(draft.startedAt).toLocaleTimeString('vi-VN')}</time></>}
                actions={<>
                    {deleting ? <button type="button" disabled>Đang xoá…</button> : (
                      <Link className={styles.primaryCardButton} href={`/studio?recover=${encodeURIComponent(draft.id)}`}>
                        <LibraryIcon name="sync" />Lưu lại bản ghi
                      </Link>
                    )}
                    <button className={styles.danger} type="button" disabled={Boolean(deletingId)} onClick={() => void removeBackup(draft)}>
                      <LibraryIcon name="trash" />Xoá bản ghi
                    </button>
                </>}
              />
            );
          })}
        </LibraryCardGrid>
      )}
      {!loading && entries.length > 0 && <LibraryPagination page={currentPage} pageCount={pageCount} visibleCount={entries.length} onPageChange={setPage} />}
    </LibraryLayout>
  );
}
