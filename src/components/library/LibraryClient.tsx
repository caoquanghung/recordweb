'use client';

import Link from 'next/link';
import { LibraryLayout } from './LibraryLayout';
import styles from './LibraryClient.module.css';
import { RecordingPreviewDialog } from './LibraryDialogs';
import { LibraryIcon } from './LibraryPrimitives';
import { LibraryRecordingGrid } from './LibraryRecordingGrid';
import { LibraryToolbar, LibraryPagination } from './LibraryControls';
import { useLibraryController } from './useLibraryController';

export function LibraryClient() {
  const library = useLibraryController();
  const {
    query, setQuery, sort, setSort, page, setPage,
    loading, message,
    preview, setPreview,
    loadLibrary, paginatedEntries, visibleCount, pageCount,
    cloudBytes, cloudGigabytes, storagePercent, totalCount,
  } = library;

  return (
    <LibraryLayout
      activeHref="/library"
      eyebrow="Kho lưu trữ bài giảng"
      countLabel={`${totalCount} bài giảng đã ghi`}
      title="Thư viện bài giảng đã ghi"
      description="Quản lý, xem lại và tải xuống dữ liệu bài giảng phục vụ nghiên cứu."
      summary={
        <section className={styles.storageCard} aria-label="Dung lượng lưu trữ bài giảng">
          <div className={styles.storageDetails}>
            <div className={styles.storageHeading}>
              <span>Dung lượng học viện cấp</span>
              <strong>{cloudGigabytes.toFixed(cloudGigabytes >= 1 ? 1 : 2)} / 50.0 GB ({storagePercent.toFixed(storagePercent >= 1 ? 0 : 2)}%)</strong>
            </div>
            <div className={styles.progressTrack} aria-hidden="true">
              <span style={{ width: `${Math.max(storagePercent, cloudBytes > 0 ? 2 : 0)}%` }} />
            </div>
            <small>Dung lượng các bản ghi trong thư viện</small>
          </div>
          <button className={styles.syncButton} type="button" onClick={() => void loadLibrary()} disabled={loading}>
            <LibraryIcon name="sync" />{loading ? 'Đang đồng bộ' : 'Đồng bộ ngay'}
          </button>
        </section>
      }
      overlay={preview && <RecordingPreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    >
      <LibraryToolbar query={query} sort={sort}
        onQueryChange={(value) => { setQuery(value); setPage(1); }}
        onSortChange={(value) => { setSort(value); setPage(1); }} />

      {message && <p className={styles.message} role="status">{message}</p>}
      {loading && <div className={styles.empty} aria-busy="true">Đang tải thư viện bài giảng…</div>}
      {!loading && visibleCount === 0 && (
        <div className={styles.empty}>
          <strong>Chưa có bài giảng trong mục này</strong>
          <span>{query
            ? 'Thử một từ khoá khác hoặc xoá bộ lọc tìm kiếm.'
            : 'Quay bài giảng trong Studio để dữ liệu xuất hiện tại đây.'}</span>
          {!query && <Link href="/studio">Ghi bài giảng mới</Link>}
        </div>
      )}

      {!loading && visibleCount > 0 && (
        <LibraryRecordingGrid
          entries={paginatedEntries}
          setPreview={setPreview}
          downloadCloudFiles={library.downloadCloudFiles}
          removeCloud={library.removeCloud}
        />
      )}

      {!loading && visibleCount > 0 && (
        <LibraryPagination page={page} pageCount={pageCount} visibleCount={visibleCount} onPageChange={setPage} />
      )}
    </LibraryLayout>
  );
}
