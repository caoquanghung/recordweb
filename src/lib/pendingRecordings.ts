import type { RecordingDraftSummary } from '@/lib/idb';
import type { DbRecording } from '@/types/database';

export const PENDING_RECORDINGS_HREF = '/pending-recordings';

export function recordingBackupTitle(startedAt: string): string {
  const date = new Date(startedAt);
  const day = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return `Bản ghi ${day} lúc ${time}`;
}

export type RecentRecordingEntry =
  | { kind: 'cloud'; recording: DbRecording; recordedAt: string }
  | { kind: 'draft'; draft: RecordingDraftSummary; recordedAt: string };

/** A backup and its committed cloud row describe one recording, not two cards. */
export function recentRecordingEntries(recordings: DbRecording[], drafts: RecordingDraftSummary[]): RecentRecordingEntry[] {
  const draftIds = new Set(drafts.map((draft) => draft.id));
  const entries: RecentRecordingEntry[] = [
    ...recordings.filter((recording) => !draftIds.has(recording.local_id ?? recording.id))
      .map((recording) => ({ kind: 'cloud' as const, recording, recordedAt: recording.recorded_at })),
    ...drafts.map((draft) => ({ kind: 'draft' as const, draft, recordedAt: draft.startedAt })),
  ];
  return entries.sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt)).slice(0, 3);
}
