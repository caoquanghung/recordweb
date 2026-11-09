'use client';

import { useEffect, useRef, useState } from 'react';
import { usePermissions } from '@/components/auth/PermissionProvider';
import { LibraryLayout } from '@/components/library/LibraryLayout';
import { LibraryCardGrid, LibraryRecordingCard } from '@/components/library/LibraryRecordingCard';
import { LibraryToolbar, LibraryPagination } from '@/components/library/LibraryControls';
import { RecordingPreviewDialog } from '@/components/library/LibraryDialogs';
import { formatLibraryBytes, formatLibraryDate, formatLibraryDuration, LibraryIcon } from '@/components/library/LibraryPrimitives';
import { getCloudRecordingInspection } from '@/components/review/recordingInspection';
import type { RecordingPreview } from '@/components/library/useLibraryController';
import { ADMIN_PAGE_SIZE, canAdminDeleteUser } from '@/lib/adminLibraryPolicy';
import type { AdminDeletionScope } from '@/types/adminLibrary';
import { useAdminLibrary } from './useAdminLibrary';
import shared from '@/components/library/LibraryClient.module.css';
import styles from './AdminLibraryClient.module.css';

interface DeleteConfirmation { title: string; scope: AdminDeletionScope; email: string; url: string; count: number; }

const scopeLabels = { recording: 'Xoá một bản ghi', recordings: 'Xoá toàn bộ bản ghi', account: 'Xoá tài khoản và dữ liệu' };
const statusLabels = { pending: 'Chờ tiếp tục', running: 'Đang chạy', failed: 'Cần thử lại', completed: 'Hoàn tất' };

function ConfirmDeletion({ confirmation, onClose, onConfirm }: {
  confirmation: DeleteConfirmation; onClose: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const bulk = confirmation.scope !== 'recording';
  return <dialog ref={dialog} className={styles.dialog} onCancel={onClose} aria-labelledby="admin-delete-title">
    <form onSubmit={(event) => { event.preventDefault(); if (!bulk || email === confirmation.email) onConfirm(); }}>
      <h2 id="admin-delete-title">{scopeLabels[confirmation.scope]}</h2>
      <p><strong>{confirmation.title}</strong><br />Chủ sở hữu: {confirmation.email}</p>
      <p>{confirmation.scope === 'account'
        ? 'Xoá vĩnh viễn tài khoản đăng nhập Clerk, toàn bộ bản ghi, file cloud, presets, projects và liên kết chia sẻ của user.'
        : `Xoá vĩnh viễn ${confirmation.count} bản ghi và các file cloud liên quan. Tài khoản, presets và projects được giữ lại.`}</p>
      <p className={styles.note}>Upload thuộc phạm vi xoá sẽ bị huỷ. Thao tác không thể hoàn tác và không xoá bản sao trên thiết bị user.</p>
      {bulk && <label className={styles.field}>Nhập email {confirmation.email} để xác nhận
        <input autoFocus value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" spellCheck={false} />
      </label>}
      <div className={styles.row}>
        <button className={styles.button} type="button" onClick={onClose} autoFocus={!bulk}>Huỷ</button>
        <button className={`${styles.button} ${styles.danger}`} type="submit" disabled={bulk && email !== confirmation.email}>Xoá vĩnh viễn</button>
      </div>
    </form>
  </dialog>;
}

export function AdminLibraryClient({ actorId }: { actorId: string }) {
  const library = useAdminLibrary();
  const { hasPermission } = usePermissions();
  const [preview, setPreview] = useState<RecordingPreview | null>(null);
  const [confirmation, setConfirmation] = useState<DeleteConfirmation | null>(null);
  const user = library.selectedUser;
  const protectedUser = !user || !canAdminDeleteUser(actorId, user.id, user.role);
  const pageCount = Math.max(1, Math.ceil(library.total / ADMIN_PAGE_SIZE));
  const disabled = Boolean(library.busy);

  if (!hasPermission('recordings:manage')) return <p>Bạn không có quyền quản trị thư viện.</p>;

  return <LibraryLayout activeHref="/admin/library" eyebrow="Developer" countLabel={`${library.total} bản ghi`}
    title="Quản trị thư viện" description="Xem và quản lý dữ liệu bài giảng của toàn bộ user."
    summary={<button className={shared.syncButton} type="button" onClick={library.refresh} disabled={disabled}><LibraryIcon name="sync" />Làm mới</button>}
    overlay={<>
      {preview && <RecordingPreviewDialog preview={preview} onClose={() => setPreview(null)} />}
      {confirmation && <ConfirmDeletion confirmation={confirmation} onClose={() => setConfirmation(null)} onConfirm={() => {
        const chosen = confirmation;
        setConfirmation(null);
        setPreview(null);
        void library.deleteData(chosen.url, chosen.email);
      }} />}
    </>}
  >
    <section className={styles.panel} aria-label="Quản lý dữ liệu theo user">
      <h2>Dữ liệu theo user</h2>
      <div className={styles.row}>
        <label className={styles.field}>Tìm user theo email hoặc tên
          <input value={library.userQuery} onChange={(event) => { library.setUserQuery(event.target.value); library.setUserPage(1); }} placeholder="email@..." disabled={disabled} />
        </label>
        <label className={styles.field}>Lọc bản ghi theo user
          <select value={user?.id ?? ''} disabled={disabled} onChange={(event) => {
            library.setSelectedUser(library.users.find((user) => user.id === event.target.value) ?? null); library.setPage(1);
          }}>
            <option value="">Tất cả user</option>
            {user && !library.users.some((candidate) => candidate.id === user.id) && <option value={user.id}>{user.email}</option>}
            {library.users.map((user) => <option key={user.id} value={user.id}>{user.email} · {user.recording_count} bản ghi · {user.role}</option>)}
          </select>
        </label>
      </div>
      <div className={styles.row}>
        <button className={styles.button} type="button" disabled={disabled || library.userPage === 1} onClick={() => library.setUserPage(library.userPage - 1)}>User trước</button>
        <span className={styles.note}>Trang {library.userPage}/{Math.max(1, Math.ceil(library.userTotal / 20))} · {library.userTotal} user</span>
        <button className={styles.button} type="button" disabled={disabled || library.userPage * 20 >= library.userTotal} onClick={() => library.setUserPage(library.userPage + 1)}>User sau</button>
      </div>
      {user && <>
        <p className={styles.email}><strong>{user.email}</strong> · {user.recording_count} bản ghi</p>
        <div className={styles.row}>
          <button className={styles.button} type="button" disabled={disabled || !user.recording_count} onClick={() => void library.downloadUser(user)}>Tải tất cả bản ghi của user</button>
          <button className={`${styles.button} ${styles.danger}`} type="button" disabled={disabled || protectedUser} onClick={() => setConfirmation({
            title: user.email, email: user.email, scope: 'recordings', count: user.recording_count,
            url: `/api/admin/users/${encodeURIComponent(user.id)}/recordings`,
          })}>Xoá tất cả bản ghi của user</button>
          <button className={`${styles.button} ${styles.danger}`} type="button" disabled={disabled || protectedUser} onClick={() => setConfirmation({
            title: user.email, email: user.email, scope: 'account', count: user.recording_count,
            url: `/api/admin/users/${encodeURIComponent(user.id)}`,
          })}>Xoá tài khoản và toàn bộ dữ liệu</button>
        </div>
        {protectedUser && <p className={styles.note}>Không hỗ trợ xoá chính mình hoặc developer khác trong trang quản trị.</p>}
      </>}
    </section>

    <LibraryToolbar query={library.query} sort={library.sort} searchLabel="Tìm tên bản ghi hoặc email chủ sở hữu"
      onQueryChange={(query) => { library.setQuery(query); library.setPage(1); }}
      onSortChange={(sort) => { library.setSort(sort); library.setPage(1); }} />
    <div className={styles.row}>
      <label><input type="checkbox" disabled={disabled || library.loading || !library.records.length}
        checked={library.records.length > 0 && library.records.every((recording) => library.selected.includes(recording.id))}
        onChange={(event) => library.setSelected(event.target.checked
          ? [...new Set([...library.selected, ...library.records.map((recording) => recording.id)])]
          : library.selected.filter((id) => !library.records.some((recording) => recording.id === id)))} />Chọn trang này</label>
      <button className={styles.button} type="button" disabled={disabled || !library.selected.length} onClick={() => void library.downloadSelected()}>Tải {library.selected.length} bản ghi đã chọn</button>
      <button className={styles.button} type="button" disabled={disabled || !library.selected.length} onClick={() => library.setSelected([])}>Bỏ chọn</button>
      {library.busy === 'download' && <button className={styles.button} type="button" onClick={library.cancelDownload}>Huỷ tải</button>}
    </div>
    {library.message && <p className={shared.message} role="status">{library.message}</p>}
    {library.loading ? <div className={shared.empty} aria-busy="true">Đang tải thư viện…</div> : library.records.length === 0
      ? <div className={shared.empty}>Không có bản ghi phù hợp.</div>
      : <LibraryCardGrid label="Bản ghi của toàn bộ user">
        {library.records.map((recording) => {
          const url = recording.storage_url || recording.assets?.find((asset) => asset.kind === 'composite')?.storage_url;
          const open = () => url && setPreview({ title: `${recording.title} · ${recording.owner_email}`, url, canDownload: true, inspection: getCloudRecordingInspection(recording) });
          const kinds = [...new Set([...(recording.assets?.map((asset) => asset.kind) ?? []), ...(recording.storage_url ? ['composite'] : [])])];
          return <LibraryRecordingCard key={recording.id} title={recording.title} description={recording.owner_email}
            thumbnail={{ src: url, badge: recording.owner_role, summary: `${formatLibraryDuration(Number(recording.duration_seconds))} · ${formatLibraryBytes(Number(recording.file_size_bytes))}`, onClick: open }}
            metadata={<><span>{recording.owner_display_name ?? recording.owner_email}</span><time>{formatLibraryDate(recording.recorded_at)}</time></>}
            actions={<div className={styles.cardActions}>
              <label><input type="checkbox" checked={library.selected.includes(recording.id)} disabled={disabled}
                aria-label={`Chọn ${recording.title} của ${recording.owner_email}`}
                onChange={(event) => library.setSelected(event.target.checked ? [...library.selected, recording.id] : library.selected.filter((id) => id !== recording.id))} /> Chọn bản ghi</label>
              <div className={styles.row}>
                <button type="button" onClick={open} disabled={!url}><LibraryIcon name="play" />Xem lại</button>
                <button type="button" disabled={disabled || !kinds.length} onClick={() => void library.downloadRecording(recording)}><LibraryIcon name="download" />Tải ZIP</button>
                <button className={shared.danger} type="button" disabled={disabled || !canAdminDeleteUser(actorId, recording.user_id, recording.owner_role)} onClick={() => setConfirmation({
                  title: recording.title, email: recording.owner_email, scope: 'recording', count: 1, url: `/api/admin/recordings/${recording.id}`,
                })}><LibraryIcon name="trash" />Xoá bản ghi</button>
              </div>
              {kinds.length > 0 && <details><summary>Tải từng file ({kinds.length})</summary><div className={styles.assetList}>
                {kinds.map((kind) => <button type="button" key={kind} disabled={disabled} onClick={() => void library.downloadRecording(recording, kind)}><LibraryIcon name="download" />{kind}</button>)}
              </div></details>}
            </div>}
          />;
        })}
      </LibraryCardGrid>}
    {!library.loading && library.total > 0 && <LibraryPagination page={library.page} pageCount={pageCount} visibleCount={library.total} onPageChange={library.setPage} />}

    {library.jobs.length > 0 && <section className={styles.panel} aria-label="Tiến độ xoá dữ liệu">
      <h2>Tác vụ xoá gần đây</h2>
      {library.jobs.map((job) => <div key={job.id} className={styles.job}>
        <strong className={styles.email}>{scopeLabels[job.scope]} · {job.target_email}</strong>
        <span className={styles.note}>{statusLabels[job.status]} · {job.recording_count} bản ghi · {job.blob_cursor}/{job.blob_count} file</span>
        {job.error && <p className={styles.note}>{job.error}</p>}
        {job.status !== 'completed' && <div><button className={styles.button} type="button" disabled={disabled} onClick={() => void library.deleteData(`/api/admin/deletions/${job.id}/retry`, undefined, true)}>Tiếp tục / thử lại</button></div>}
      </div>)}
    </section>}
  </LibraryLayout>;
}
