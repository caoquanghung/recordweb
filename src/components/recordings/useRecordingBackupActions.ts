'use client';

import { useAuth } from '@clerk/nextjs';
import { useRef, useState } from 'react';
import type { RecordingDraftSummary } from '@/lib/idb';
import { recordingBackupTitle } from '@/lib/pendingRecordings';
import { discardRecordingBackup } from '@/lib/recordingBackupClient';

export function useRecordingBackupActions(onDeleted?: () => void) {
  const { userId } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');

  const removeBackup = async (draft: RecordingDraftSummary) => {
    if (!userId || busyRef.current) return;
    if (!window.confirm(`Xoá “${recordingBackupTitle(draft.startedAt)}”?\n\nBản sao lưu và các tệp của bản ghi này trên thiết bị sẽ bị xoá và không thể khôi phục. Bài giảng đã lưu thành công trên đám mây vẫn được giữ nguyên.`)) return;
    busyRef.current = true;
    setDeletingId(draft.id);
    setMessage('');
    try {
      await discardRecordingBackup(draft.id, userId);
      setMessage('Đã xoá bản ghi trên thiết bị.');
      onDeleted?.();
    } catch (cause) {
      setMessage(`Chưa thể xoá bản ghi: ${(cause as Error).message}`);
    } finally {
      busyRef.current = false;
      setDeletingId(null);
    }
  };

  return { deletingId, message, removeBackup };
}
