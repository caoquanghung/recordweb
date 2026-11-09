import { LibraryIcon } from './LibraryPrimitives';
import { LIBRARY_PAGE_SIZE, type LibrarySort } from './useLibraryController';
import styles from './LibraryClient.module.css';

export function LibraryToolbar({ query, sort, onQueryChange, onSortChange, searchLabel = 'Tìm bài giảng' }: {
  query: string;
  sort: LibrarySort;
  onQueryChange: (value: string) => void;
  onSortChange: (value: LibrarySort) => void;
  searchLabel?: string;
}) {
  return (
    <section className={styles.toolbarPanel} aria-label="Bộ lọc thư viện">
      <label className={styles.searchField}>
        <span className={styles.srOnly}>{searchLabel}</span>
        <LibraryIcon name="search" />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={searchLabel} />
      </label>
      <label className={styles.sortField}>
        <span className={styles.sortGlyph} aria-hidden="true">↕</span>
        <span className={styles.srOnly}>Sắp xếp bài giảng</span>
        <select value={sort} onChange={(event) => onSortChange(event.target.value as LibrarySort)}>
          <option value="newest">Mới nhất trước</option>
          <option value="oldest">Cũ nhất trước</option>
        </select>
      </label>
    </section>
  );
}

export function LibraryPagination({ page, pageCount, visibleCount, onPageChange }: {
  page: number;
  pageCount: number;
  visibleCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <footer className={styles.libraryFooter}>
      <p><span aria-hidden="true" />Hiển thị{' '}
        {(page - 1) * LIBRARY_PAGE_SIZE + 1} – {Math.min(page * LIBRARY_PAGE_SIZE, visibleCount)}{' '}
        trên tổng số {visibleCount} bài giảng
      </p>
      <nav className={styles.pagination} aria-label="Phân trang thư viện">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>‹ <span>Trang trước</span></button>
        {Array.from({ length: Math.min(pageCount, page + 2) - Math.max(1, page - 2) + 1 }, (_, index) => Math.max(1, page - 2) + index)
          .map((pageNumber) => (
            <button type="button" key={pageNumber} className={pageNumber === page ? styles.currentPage : ''}
              aria-current={pageNumber === page ? 'page' : undefined} onClick={() => onPageChange(pageNumber)}>
              {pageNumber}
            </button>
          ))}
        <button type="button" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page === pageCount}><span>Trang sau</span> ›</button>
      </nav>
    </footer>
  );
}
