import { RecordingDetailsClient } from '@/components/library/RecordingDetailsClient';

export const instant = false;

export default async function RecordingDetailsPage({
  params,
}: PageProps<'/library/[recordingId]'>) {
  const { recordingId } = await params;

  return <RecordingDetailsClient recordingId={recordingId} />;
}
