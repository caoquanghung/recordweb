'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminJson, saveAdminDownload } from '@/lib/adminDownloadClient';
import { ADMIN_DOWNLOAD_PAGE_SIZE, ADMIN_PAGE_SIZE, adminFileStem } from '@/lib/adminLibraryPolicy';
import type { AdminDeletionJob, AdminDownloadManifest, AdminLibraryUser, AdminRecording } from '@/types/adminLibrary';

export function useAdminLibrary() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<AdminRecording[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userQuery, setUserQuery] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [users, setUsers] = useState<AdminLibraryUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminLibraryUser | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [jobs, setJobs] = useState<AdminDeletionJob[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'download' | 'delete' | null>(null);
  const [revision, setRevision] = useState(0);
  const task = useRef<AbortController | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const ownerId = selectedUser?.id ?? '';

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, sort, page: String(page), userId: ownerId });
        const data = await fetchAdminJson<{ recordings: AdminRecording[]; total: number }>(`/api/admin/recordings?${params}`, { signal: controller.signal });
        setRecords(data.recordings);
        setTotal(data.total);
        if (page > Math.max(1, Math.ceil(data.total / ADMIN_PAGE_SIZE))) setPage(Math.max(1, Math.ceil(data.total / ADMIN_PAGE_SIZE)));
      } catch (error) {
        if (!controller.signal.aborted) { setMessage((error as Error).message); setRecords([]); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, sort, page, ownerId, revision]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: userQuery, page: String(userPage) });
        const data = await fetchAdminJson<{ users: AdminLibraryUser[]; total: number }>(`/api/admin/users?${params}`, { signal: controller.signal });
        setUsers(data.users);
        setUserTotal(data.total);
        if (userPage > Math.max(1, Math.ceil(data.total / 20))) setUserPage(Math.max(1, Math.ceil(data.total / 20)));
        setSelectedUser((current) => data.users.find((user) => user.id === current?.id) ?? current);
      } catch (error) { if (!controller.signal.aborted) setMessage((error as Error).message); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [userQuery, userPage, revision]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAdminJson<{ jobs: AdminDeletionJob[] }>('/api/admin/deletions', { signal: controller.signal })
      .then((data) => setJobs(data.jobs))
      .catch((error) => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => () => task.current?.abort(), []);

  async function download(name: string, manifests: (signal: AbortSignal) => AsyncIterable<AdminDownloadManifest>, single = false) {
    if (task.current) return;
    const controller = new AbortController();
    task.current = controller;
    setBusy('download');
    setMessage('Đang chuẩn bị tải dữ liệu…');
    try {
      await saveAdminDownload(name, manifests(controller.signal), controller.signal, (file) => setMessage(`Đang tải ${file}`), single);
      setMessage('Đã chuẩn bị tải dữ liệu thành công.');
    } catch (error) {
      setMessage(controller.signal.aborted || (error as Error).name === 'AbortError' ? 'Đã huỷ tải dữ liệu.' : (error as Error).message);
      controller.abort();
    } finally { task.current = null; setBusy(null); }
  }

  function downloadRecording(recording: AdminRecording, kind?: string) {
    const asset = recording.assets?.find((asset) => asset.kind === kind);
    const mime = (asset?.mime_type ?? recording.mime_type).split(';')[0].trim();
    const extension = mime === 'application/json' ? 'json' : mime === 'audio/mp4' ? 'm4a' : mime.endsWith('/mp4') ? 'mp4' : 'webm';
    const name = `${recording.id}-${adminFileStem(recording.title)}${kind ? `-${kind}.${extension}` : '-assets.zip'}`;
    return download(name, async function* (signal) {
      const base = `/api/admin/recordings/${recording.id}`;
      yield await fetchAdminJson<AdminDownloadManifest>(kind ? `${base}/assets/${kind}/download` : `${base}/download`, { signal });
    }, Boolean(kind));
  }

  function downloadSelected() {
    const ids = [...selected];
    return download('selected-recordings.zip', async function* (signal) {
      for (let index = 0; index < ids.length; index += ADMIN_DOWNLOAD_PAGE_SIZE) {
        yield await fetchAdminJson<AdminDownloadManifest>('/api/admin/recordings/download', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids.slice(index, index + ADMIN_DOWNLOAD_PAGE_SIZE) }), signal,
        });
      }
    });
  }

  function downloadUser(user: AdminLibraryUser) {
    return download(`${adminFileStem(user.email)}-recordings.zip`, async function* (signal) {
      let cursor = '';
      let snapshotAt = '';
      do {
        const params = new URLSearchParams();
        if (cursor) params.set('cursor', cursor);
        if (snapshotAt) params.set('snapshotAt', snapshotAt);
        const manifest = await fetchAdminJson<AdminDownloadManifest>(`/api/admin/users/${encodeURIComponent(user.id)}/recordings/download?${params}`, { signal });
        cursor = manifest.nextCursor ?? '';
        snapshotAt = manifest.snapshotAt ?? '';
        yield manifest;
      } while (cursor);
    });
  }

  async function deleteData(url: string, email?: string, retry = false) {
    if (task.current) return;
    const controller = new AbortController();
    task.current = controller;
    setBusy('delete');
    setMessage('Đang xoá dữ liệu…');
    try {
      let { job } = await fetchAdminJson<{ job: AdminDeletionJob }>(url, {
        method: retry ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: retry ? undefined : JSON.stringify({ confirmEmail: email }), signal: controller.signal,
      });
      setJobs((jobs) => [job, ...jobs.filter((item) => item.id !== job.id)]);
      while (job.status === 'pending') {
        setMessage(`Đang xoá file: ${job.blob_cursor}/${job.blob_count}…`);
        ({ job } = await fetchAdminJson<{ job: AdminDeletionJob }>(`/api/admin/deletions/${job.id}/retry`, { method: 'POST', signal: controller.signal }));
        const progress = job;
        setJobs((jobs) => jobs.map((item) => item.id === progress.id ? progress : item));
      }
      setMessage(job.status === 'completed' ? 'Đã xoá dữ liệu cloud theo phạm vi đã chọn.' : job.error ?? 'Tác vụ đang chạy ở yêu cầu khác. Có thể làm mới để xem tiến độ.');
      if (job.status === 'completed') {
        setSelected([]);
        if (job.scope === 'account') { setSelectedUser(null); setPage(1); }
      }
    } catch (error) { if (!controller.signal.aborted) setMessage((error as Error).message); }
    finally { task.current = null; setBusy(null); refresh(); }
  }

  return {
    query, setQuery, sort, setSort, page, setPage, records, total, loading,
    userQuery, setUserQuery, userPage, setUserPage, users, userTotal, selectedUser, setSelectedUser,
    selected, setSelected, jobs, message, busy, refresh, downloadRecording, downloadSelected, downloadUser, deleteData,
    cancelDownload: () => task.current?.abort(),
  };
}
