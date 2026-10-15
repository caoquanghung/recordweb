import type {
  RecordingMediaProfile,
  RecordingProject,
  RecordingProjectStatus,
} from '@/types/recordingProject';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? body.message ?? `Request failed with status ${response.status}.`);
  }
  return body as T;
}

export async function listRecordingProjects(): Promise<RecordingProject[]> {
  const result = await requestJson<{ projects: RecordingProject[] }>('/api/recording-projects');
  return result.projects;
}

export async function createRecordingProject(input: {
  title: string;
  mediaProfile?: RecordingMediaProfile | null;
  settings?: Record<string, unknown>;
}): Promise<RecordingProject> {
  const result = await requestJson<{ project: RecordingProject }>('/api/recording-projects', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      media_profile: input.mediaProfile ?? null,
      settings: input.settings ?? {},
    }),
  });
  return result.project;
}

export async function updateRecordingProject(input: {
  id: string;
  expectedRevision: number;
  title?: string;
  status?: RecordingProjectStatus;
  settings?: Record<string, unknown>;
}): Promise<RecordingProject> {
  const result = await requestJson<{ project: RecordingProject }>('/api/recording-projects', {
    method: 'PATCH',
    body: JSON.stringify({
      id: input.id,
      expected_revision: input.expectedRevision,
      title: input.title,
      status: input.status,
      settings: input.settings,
    }),
  });
  return result.project;
}

export async function deleteRecordingProject(id: string): Promise<void> {
  await requestJson('/api/recording-projects', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}

export async function attachRecordingProjectSegment(input: {
  projectId: string;
  recordingId: string;
  expectedRevision: number;
  mediaProfile: RecordingMediaProfile;
}): Promise<{ segmentId: string; revision: number }> {
  const result = await requestJson<{
    segment: { id: string };
    revision: number;
  }>('/api/recording-projects/segments', {
    method: 'POST',
    body: JSON.stringify({
      project_id: input.projectId,
      recording_id: input.recordingId,
      expected_revision: input.expectedRevision,
      media_profile: input.mediaProfile,
    }),
  });
  return { segmentId: result.segment.id, revision: result.revision };
}

export async function reorderRecordingProjectSegments(input: {
  projectId: string;
  segmentIds: string[];
  expectedRevision: number;
}): Promise<number> {
  const result = await requestJson<{ revision: number }>('/api/recording-projects/segments', {
    method: 'PATCH',
    body: JSON.stringify({
      project_id: input.projectId,
      segment_ids: input.segmentIds,
      expected_revision: input.expectedRevision,
    }),
  });
  return result.revision;
}

export async function detachRecordingProjectSegment(input: {
  projectId: string;
  segmentId: string;
  expectedRevision: number;
}): Promise<number> {
  const result = await requestJson<{ revision: number }>('/api/recording-projects/segments', {
    method: 'DELETE',
    body: JSON.stringify({
      project_id: input.projectId,
      segment_id: input.segmentId,
      expected_revision: input.expectedRevision,
    }),
  });
  return result.revision;
}

