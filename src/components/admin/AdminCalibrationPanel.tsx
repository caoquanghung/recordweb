'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchAdminJson, saveAdminDownload } from '@/lib/adminDownloadClient';
import { CALIBRATION_CELL_COUNT, CALIBRATION_CELL_ORDER } from '@/lib/calibration/policy';
import type { AdminDownloadManifest } from '@/types/adminLibrary';
import type { AdminCalibrationUser } from '@/types/calibration';
import library from './AdminLibraryClient.module.css';
import styles from './AdminCalibrationPanel.module.css';

const PAGE_SIZE = 20;

/** Developer view of every user's calibration profile: status, thumbnails and ZIP download. */
export function AdminCalibrationPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminCalibrationUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const task = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, page: String(page) });
        const data = await fetchAdminJson<{ users: AdminCalibrationUser[]; total: number }>(
          `/api/admin/calibration?${params}`, { signal: controller.signal },
        );
        setUsers(data.users);
        setTotal(data.total);
        setMessage('');
        const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (page > pages) setPage(pages);
      } catch (error) {
        if (!controller.signal.aborted) { setMessage((error as Error).message); setUsers([]); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, page]);

  useEffect(() => () => task.current?.abort(), []);

  function download(user: AdminCalibrationUser) {
    if (task.current) return;
    const controller = new AbortController();
    task.current = controller;
    setDownloading(user.id);
    setMessage('Đang chuẩn bị tải profile calibration…');
    const manifests = async function* (signal: AbortSignal) {
      yield await fetchAdminJson<AdminDownloadManifest>(`/api/admin/calibration/${encodeURIComponent(user.id)}/download`, { signal });
    };
    const stem = user.email.replace(/[^A-Za-z0-9._-]+/g, '-');
    void saveAdminDownload(`${stem}-calibration.zip`, manifests(controller.signal), controller.signal, (file) => setMessage(`Đang tải ${file}`))
      .then(() => setMessage('Đã chuẩn bị tải profile calibration.'))
      .catch((error: Error) => setMessage(controller.signal.aborted || error.name === 'AbortError' ? 'Đã huỷ tải.' : error.message))
      .finally(() => { task.current = null; setDownloading(null); });
  }

  return (
    <details className={library.panel} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><strong>Calibration dáng đứng của user</strong></summary>
      {open && (
        <>
          <label className={library.field}>Tìm user theo email hoặc tên
            <input value={query} placeholder="email@..." onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          </label>
          {message && <p className={library.note} role="status">{message}</p>}
          {loading ? <p className={library.note} aria-busy="true">Đang tải…</p> : (
            <div className={styles.list}>
              {users.map((user) => {
                const full = user.completeness >= CALIBRATION_CELL_COUNT;
                const byCell = new Map(user.postures.map((posture) => [`${posture.cellRow}-${posture.cellCol}`, posture.url]));
                return (
                  <div key={user.id} className={styles.user}>
                    <div className={styles.head}>
                      <span className={library.email}><strong>{user.email}</strong>{user.display_name ? ` · ${user.display_name}` : ''}</span>
                      <span className={`${styles.badge} ${full ? styles.badgeFull : ''}`}>
                        {user.consent_version ? `${user.completeness}/${CALIBRATION_CELL_COUNT} ô` : 'Chưa calibrate'}
                      </span>
                    </div>
                    {user.completeness > 0 && (
                      <>
                        <div className={styles.thumbs}>
                          {CALIBRATION_CELL_ORDER.map(([row, col]) => {
                            const url = byCell.get(`${row}-${col}`);
                            return (
                              <div key={`${row}-${col}`} className={`${styles.thumb} ${url ? styles.thumbFilled : ''}`}>
                                {url
                                  // eslint-disable-next-line @next/next/no-img-element -- remote Blob thumbnail
                                  ? <img src={url} alt={`Ô ${row},${col} của ${user.email}`} loading="lazy" />
                                  : `${row},${col}`}
                              </div>
                            );
                          })}
                        </div>
                        <div className={library.row}>
                          {user.updated_at && <span className={library.note}>Cập nhật {new Date(user.updated_at).toLocaleString('vi-VN')}</span>}
                          <button className={library.button} type="button" disabled={Boolean(downloading)} onClick={() => download(user)}>
                            {downloading === user.id ? 'Đang tải…' : 'Tải ZIP calibration'}
                          </button>
                          {downloading === user.id && <button className={library.button} type="button" onClick={() => task.current?.abort()}>Huỷ tải</button>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {!users.length && !message && <p className={library.note}>Không có user phù hợp.</p>}
            </div>
          )}
          <div className={library.row}>
            <button className={library.button} type="button" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Trước</button>
            <span className={library.note}>Trang {page}/{Math.max(1, Math.ceil(total / PAGE_SIZE))} · {total} user</span>
            <button className={library.button} type="button" disabled={loading || page * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Sau</button>
          </div>
        </>
      )}
    </details>
  );
}
