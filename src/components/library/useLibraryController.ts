'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteLocalRecording, getAllLocalRecordings } from '@/lib/idb';
import {
  downloadRecordingArchive,
  RECORDING_ARCHIVE_KINDS,
} from '@/lib/recordingArchive';
import type {
  DbRecording,
  DbRecordingAsset,
  DbRecordingShare,
  DbSharedRecording,
} from '@/types/database';
import type { RecordingMetadata } from '@/types/recording';
import type { RecordingInspectionData } from '@/components/review/recordingInspection';

export type LibraryTab = 'mine' | 'shared' | 'local' | 'cloud';
export type LibrarySort = 'newest' | 'oldest';
export type LibraryEntry =
  | { kind: 'local'; recording: RecordingMetadata; title: string; createdAt: number }
  | { kind: 'cloud'; recording: DbRecording; title: string; createdAt: number }
  | { kind: 'shared'; recording: DbSharedRecording; title: string; createdAt: number };

export type RecordingPreview = {
  title: string;
  url: string;
  canDownload: boolean;
  inspection?: RecordingInspectionData;
};

export type CursorPreview = {
  title: string;
  blob: Blob;
};

export const LIBRARY_PAGE_SIZE = 6;
const CLOUD_ALLOWANCE_BYTES = 50 * 1024 * 1024 * 1024;

export function useLibraryController() {
  const [tab, setTab] = useState<LibraryTab>('mine');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('newest');
  const [page, setPage] = useState(1);
  const [cloud, setCloud] = useState<DbRecording[]>([]);
  const [shared, setShared] = useState<DbSharedRecording[]>([]);
  const [local, setLocal] = useState<RecordingMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<RecordingPreview | null>(null);
  const [cursorPreview, setCursorPreview] = useState<CursorPreview | null>(null);
  const [sharingRecording, setSharingRecording] = useState<DbRecording | null>(null);
  const [shares, setShares] = useState<DbRecordingShare[]>([]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [permission, setPermission] = useState<'viewer' | 'viewer_download'>('viewer');
  const [shareBusy, setShareBusy] = useState(false);
  const localUrlsRef = useRef<string[]>([]);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [response, localRecordings] = await Promise.all([
        fetch('/api/recordings', { cache: 'no-store' }),
        getAllLocalRecordings(),
      ]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not load cloud recordings.');

      localUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localUrlsRef.current = [];
      const hydratedLocal = localRecordings.map((recording) => {
        if (!recording.blob) return recording;
        const previewUrl = URL.createObjectURL(recording.blob);
        localUrlsRef.current.push(previewUrl);
        return { ...recording, previewUrl };
      });

      setCloud(data.recordings ?? []);
      setShared(data.sharedRecordings ?? []);
      setLocal(hydratedLocal);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadLibrary(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadLibrary]);

  useEffect(() => () => {
    localUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const localOnly = useMemo(() => {
    const uploadedLocalIds = new Set(cloud.map((recording) => recording.local_id).filter(Boolean));
    return local.filter((recording) => !uploadedLocalIds.has(recording.localId ?? recording.id));
  }, [cloud, local]);

  const filteredEntries = useMemo<LibraryEntry[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    const visibleLocal = tab === 'mine' || tab === 'local' ? localOnly : [];
    const visibleCloud = tab === 'mine' || tab === 'cloud' ? cloud : [];
    const visibleShared = tab === 'shared' ? shared : [];
    const entries: LibraryEntry[] = [
      ...visibleLocal.map((recording) => ({
        kind: 'local' as const,
        recording,
        title: recording.title,
        createdAt: new Date(recording.createdAt).getTime(),
      })),
      ...visibleCloud.map((recording) => ({
        kind: 'cloud' as const,
        recording,
        title: recording.title,
        createdAt: new Date(recording.recorded_at).getTime(),
      })),
      ...visibleShared.map((recording) => ({
        kind: 'shared' as const,
        recording,
        title: recording.title,
        createdAt: new Date(recording.recorded_at).getTime(),
      })),
    ];

    return entries
      .filter((entry) => !normalizedQuery || entry.title.toLocaleLowerCase('vi').includes(normalizedQuery))
      .sort((left, right) => sort === 'newest' ? right.createdAt - left.createdAt : left.createdAt - right.createdAt);
  }, [cloud, localOnly, query, shared, sort, tab]);

  const visibleCount = filteredEntries.length;
  const pageCount = Math.max(1, Math.ceil(visibleCount / LIBRARY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedEntries = filteredEntries.slice(
    (currentPage - 1) * LIBRARY_PAGE_SIZE,
    currentPage * LIBRARY_PAGE_SIZE,
  );
  const cloudBytes = cloud.reduce((total, recording) => total + Number(recording.file_size_bytes || 0), 0);
  const cloudGigabytes = cloudBytes / 1024 / 1024 / 1024;
  const storagePercent = Math.min(100, (cloudBytes / CLOUD_ALLOWANCE_BYTES) * 100);
  const totalCount = cloud.length + localOnly.length + shared.length;

  const removeLocal = async (recording: RecordingMetadata) => {
    if (!window.confirm('Delete this recording from this browser? Cloud copies are not affected.')) return;
    await deleteLocalRecording(recording.id);
    setLocal((current) => current.filter((item) => item.id !== recording.id));
    setMessage('Local recording deleted.');
  };

  const openCloudCursor = async (title: string, asset: DbRecordingAsset) => {
    setMessage('Loading cursor trajectory…');
    try {
      const response = await fetch(asset.storage_url);
      if (!response.ok) throw new Error(`Could not load cursor trajectory (${response.status}).`);
      setCursorPreview({ title, blob: await response.blob() });
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const downloadLocalFiles = async (recording: RecordingMetadata) => {
    const assets = RECORDING_ARCHIVE_KINDS.flatMap((kind) => {
      const asset = recording.assets?.[kind];
      const blob = asset?.blob ?? (kind === 'composite' ? recording.blob : undefined);
      const mimeType = asset?.mimeType ?? (kind === 'composite' ? recording.mimeType : '');
      return blob ? [{ kind, mimeType, blob }] : [];
    });
    setMessage('Preparing recording ZIP…');
    try {
      await downloadRecordingArchive(recording.title, assets);
      setMessage(`${assets.length} recording files downloaded as one ZIP.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const downloadCloudFiles = async (recording: DbRecording | DbSharedRecording) => {
    const assets = recording.assets?.map((asset) => ({
      kind: asset.kind,
      mimeType: asset.mime_type,
      storageUrl: asset.storage_url,
    })) ?? [];
    if (recording.storage_url && !assets.some((asset) => asset.kind === 'composite')) {
      assets.unshift({
        kind: 'composite',
        mimeType: recording.mime_type,
        storageUrl: recording.storage_url,
      });
    }
    setMessage('Downloading recording files and preparing ZIP…');
    try {
      await downloadRecordingArchive(recording.title, assets);
      setMessage(`${assets.length} recording files downloaded as one ZIP.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const togglePublic = async (recording: DbRecording) => {
    const response = await fetch('/api/recordings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recording.id, is_public: !recording.is_public }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? 'Could not update link access.');
      return;
    }
    setCloud((current) => current.map((item) => item.id === recording.id ? data.recording : item));
    setSharingRecording((current) => current?.id === recording.id ? data.recording : current);
    setMessage(data.recording.is_public ? 'Public link enabled.' : 'Public link disabled.');
  };

  const copyShareLink = async (recordingId: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/share/${recordingId}`);
    setMessage('Share link copied.');
  };

  const removeCloud = async (recording: DbRecording) => {
    if (!window.confirm('Delete this cloud recording, its Blob video, and all share grants? This cannot be undone.')) return;
    const response = await fetch('/api/recordings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recording.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? 'Could not delete cloud recording.');
      return;
    }
    setCloud((current) => current.filter((item) => item.id !== recording.id));
    setMessage('Cloud recording and Blob object deleted.');
  };

  const openSharing = async (recording: DbRecording) => {
    setSharingRecording(recording);
    setShares([]);
    setRecipientEmail('');
    setShareBusy(true);
    try {
      const response = await fetch(`/api/shares?recordingId=${encodeURIComponent(recording.id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not load recipients.');
      setShares(data.shares ?? []);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  const grantAccess = async () => {
    if (!sharingRecording || !recipientEmail.trim()) return;
    setShareBusy(true);
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordingId: sharingRecording.id,
          recipientEmail: recipientEmail.trim(),
          permission,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not share recording.');
      setShares((current) => [
        data.share,
        ...current.filter((item) => item.recipient_user_id !== data.share.recipient_user_id),
      ]);
      setRecipientEmail('');
      setMessage('Recipient access updated.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  const revokeAccess = async (share: DbRecordingShare) => {
    if (!sharingRecording) return;
    setShareBusy(true);
    try {
      const response = await fetch('/api/shares', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordingId: sharingRecording.id,
          recipientUserId: share.recipient_user_id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not revoke access.');
      setShares((current) => current.filter((item) => item.recipient_user_id !== share.recipient_user_id));
      setMessage('Recipient access revoked.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  return {
    tab,
    setTab,
    query,
    setQuery,
    sort,
    setSort,
    page: currentPage,
    setPage,
    cloud,
    shared,
    localOnly,
    loading,
    message,
    preview,
    setPreview,
    cursorPreview,
    setCursorPreview,
    sharingRecording,
    setSharingRecording,
    shares,
    recipientEmail,
    setRecipientEmail,
    permission,
    setPermission,
    shareBusy,
    loadLibrary,
    paginatedEntries,
    visibleCount,
    pageCount,
    cloudBytes,
    cloudGigabytes,
    storagePercent,
    totalCount,
    removeLocal,
    openCloudCursor,
    downloadLocalFiles,
    downloadCloudFiles,
    togglePublic,
    copyShareLink,
    removeCloud,
    openSharing,
    grantAccess,
    revokeAccess,
  };
}

export type LibraryController = ReturnType<typeof useLibraryController>;
