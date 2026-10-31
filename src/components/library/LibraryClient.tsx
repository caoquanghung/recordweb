'use client';

import Link from 'next/link';
import { AppSidebar } from '@/components/app/AppSidebar';
import styles from './LibraryClient.module.css';
import { RecordingPreviewDialog } from './LibraryDialogs';
import { LibraryIcon } from './LibraryPrimitives';
import { LibraryRecordingGrid } from './LibraryRecordingGrid';
import {
  LIBRARY_PAGE_SIZE,
  type LibrarySort,
  useLibraryController,
} from './useLibraryController';

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
              <p>Quản lý, xem lại và tải xuống dữ liệu bài giảng phục vụ nghiên cứu.</p>
            </div>

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
          </header>

          <section className={styles.toolbarPanel} aria-label="Bộ lọc thư viện">
            <label className={styles.searchField}>
              <span className={styles.srOnly}>Tìm bài giảng</span>
              <LibraryIcon name="search" />
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                placeholder="Tìm bài giảng"
              />
            </label>

            <label className={styles.sortField}>
              <span className={styles.sortGlyph} aria-hidden="true">↕</span>
              <span className={styles.srOnly}>Sắp xếp bài giảng</span>
              <select
                value={sort}
                onChange={(event) => { setSort(event.target.value as LibrarySort); setPage(1); }}
              >
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
            <footer className={styles.libraryFooter}>
              <p>
                <span aria-hidden="true" />Hiển thị{' '}
                {(page - 1) * LIBRARY_PAGE_SIZE + 1} – {Math.min(page * LIBRARY_PAGE_SIZE, visibleCount)}{' '}
                trên tổng số {visibleCount} bài giảng
              </p>
              <nav className={styles.pagination} aria-label="Phân trang thư viện">
                <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>‹ <span>Trang trước</span></button>
                {Array.from({ length: pageCount }, (_, index) => index + 1)
                  .slice(Math.max(0, page - 3), Math.min(pageCount, page + 2))
                  .map((pageNumber) => (
                    <button
                      type="button"
                      key={pageNumber}
                      className={pageNumber === page ? styles.currentPage : ''}
                      aria-current={pageNumber === page ? 'page' : undefined}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                <button type="button" onClick={() => setPage(Math.min(pageCount, page + 1))} disabled={page === pageCount}><span>Trang sau</span> ›</button>
              </nav>
            </footer>
          )}
        </div>

        {preview && <RecordingPreviewDialog preview={preview} onClose={() => setPreview(null)} />}
      </main>
    </div>
  );
}
