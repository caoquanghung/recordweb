'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadRecordingArchive } from '@/lib/recordingArchive';
import type { DbRecording, DbRecordingAsset } from '@/types/database';
import type { RecordingInspectionData } from '@/components/review/recordingInspection';

export type LibrarySort = 'newest' | 'oldest';
export type LibraryEntry = { recording: DbRecording; title: string; createdAt: number };

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
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('newest');
  const [page, setPage] = useState(1);
  const [cloud, setCloud] = useState<DbRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<RecordingPreview | null>(null);
  const [cursorPreview, setCursorPreview] = useState<CursorPreview | null>(null);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/recordings', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not load cloud recordings.');

      const hasCloudVideo = (recording: DbRecording) => Boolean(
        recording.storage_url || recording.assets?.some((asset) => asset.kind === 'composite'),
      );
      setCloud(((data.recordings ?? []) as DbRecording[]).filter(hasCloudVideo));
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

  const filteredEntries = useMemo<LibraryEntry[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    const entries: LibraryEntry[] = cloud.map((recording) => ({
      recording,
      title: recording.title,
      createdAt: new Date(recording.recorded_at).getTime(),
    }));

    return entries
      .filter((entry) => !normalizedQuery || entry.title.toLocaleLowerCase('vi').includes(normalizedQuery))
      .sort((left, right) => sort === 'newest' ? right.createdAt - left.createdAt : left.createdAt - right.createdAt);
  }, [cloud, query, sort]);

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
  const totalCount = cloud.length;

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

  const downloadCloudFiles = async (recording: DbRecording) => {
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

  const removeCloud = async (recording: DbRecording) => {
    if (!window.confirm('Delete this cloud recording and its Blob files? This cannot be undone.')) return;
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

  return {
    query,
    setQuery,
    sort,
    setSort,
    page: currentPage,
    setPage,
    cloud,
    loading,
    message,
    preview,
    setPreview,
    cursorPreview,
    setCursorPreview,
    loadLibrary,
    paginatedEntries,
    visibleCount,
    pageCount,
    cloudBytes,
    cloudGigabytes,
    storagePercent,
    totalCount,
    openCloudCursor,
    downloadCloudFiles,
    removeCloud,
  };
}

export type LibraryController = ReturnType<typeof useLibraryController>;
