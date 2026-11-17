import { requireWorkspace } from '@/lib/auth';
import { listApps } from '@/lib/apps';
import WorkspaceHome from '@/components/workspace-home';

export default async function AdminHome() {
  const workspace = await requireWorkspace();
  const apps = await listApps();
  return <WorkspaceHome apps={apps} isAdmin={workspace.isAdmin}/>;
}
