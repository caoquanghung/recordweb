'use client';

import Link from 'next/link';
import { AppSidebar } from '@/components/app/AppSidebar';
import styles from './LibraryClient.module.css';
import {
  CursorPreviewDialog,
  RecordingPreviewDialog,
  SharingDialog,
} from './LibraryDialogs';
import { LibraryIcon } from './LibraryPrimitives';
import { LibraryRecordingGrid } from './LibraryRecordingGrid';
import {
  LIBRARY_PAGE_SIZE,
  type LibrarySort,
  type LibraryTab,
  useLibraryController,
} from './useLibraryController';

export function LibraryClient() {
  const library = useLibraryController();
  const {
    tab, setTab, query, setQuery, sort, setSort, page, setPage,
    cloud, shared, localOnly, loading, message,
    preview, setPreview, cursorPreview, setCursorPreview,
    sharingRecording, setSharingRecording, shares,
    recipientEmail, setRecipientEmail, permission, setPermission, shareBusy,
    loadLibrary, paginatedEntries, visibleCount, pageCount,
    cloudBytes, cloudGigabytes, storagePercent, totalCount,
  } = library;

  const tabs: Array<[LibraryTab, string, number]> = [
    ['mine', 'Tất cả bài giảng', cloud.length + localOnly.length],
    ['shared', 'Được chia sẻ', shared.length],
    ['local', 'Chỉ trên máy', localOnly.length],
    ['cloud', 'Đã lưu đám mây', cloud.length],
  ];

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
                <div className={styles.progressTrack} aria-hidden="true">
                  <span style={{ width: `${Math.max(storagePercent, cloudBytes > 0 ? 2 : 0)}%` }} />
                </div>
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
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                placeholder="Tìm bài giảng"
              />
            </label>

            <div className={styles.tabs} role="tablist" aria-label="Lọc bài giảng">
              {tabs.map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  className={tab === value ? styles.tabActive : ''}
                  onClick={() => { setTab(value); setPage(1); }}
                >
                  {label} ({count})
                </button>
              ))}
            </div>

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
                : 'Quay bài giảng trong Studio hoặc chọn một bộ lọc khác.'}</span>
              {!query && <Link href="/studio">Ghi bài giảng mới</Link>}
            </div>
          )}

          {!loading && visibleCount > 0 && (
            <LibraryRecordingGrid
              entries={paginatedEntries}
              setPreview={setPreview}
              setCursorPreview={setCursorPreview}
              downloadLocalFiles={library.downloadLocalFiles}
              downloadCloudFiles={library.downloadCloudFiles}
              removeLocal={library.removeLocal}
              removeCloud={library.removeCloud}
              openSharing={library.openSharing}
              openCloudCursor={library.openCloudCursor}
              togglePublic={library.togglePublic}
            />
          )}

          {!loading && visibleCount > 0 && (
            <footer className={styles.libraryFooter}>
              <p>
                <span aria-hidden="true" />Tất cả bài giảng đã được đồng bộ an toàn • Hiển thị{' '}
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
        {cursorPreview && <CursorPreviewDialog preview={cursorPreview} onClose={() => setCursorPreview(null)} />}
        {sharingRecording && (
          <SharingDialog
            recording={sharingRecording}
            shares={shares}
            recipientEmail={recipientEmail}
            permission={permission}
            busy={shareBusy}
            onClose={() => setSharingRecording(null)}
            onRecipientEmailChange={setRecipientEmail}
            onPermissionChange={setPermission}
            onTogglePublic={library.togglePublic}
            onCopyLink={library.copyShareLink}
            onGrantAccess={library.grantAccess}
            onRevokeAccess={library.revokeAccess}
          />
        )}
      </main>
    </div>
  );
}
