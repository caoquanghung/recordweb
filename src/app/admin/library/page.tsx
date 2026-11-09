import { notFound } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { hasPermission } from '@/lib/auth/roles';
import { AdminLibraryClient } from '@/components/admin/AdminLibraryClient';

export const instant = false;

export default async function AdminLibraryPage() {
  const auth = await getAuthContext();
  if (!auth || !hasPermission(auth.role, 'recordings:manage')) notFound();
  return <AdminLibraryClient key={auth.userId} actorId={auth.userId} />;
}
