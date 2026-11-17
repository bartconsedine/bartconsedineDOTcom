import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/auth';
import { getApp } from '@/lib/apps';
import WorkspaceIcon from '@/components/workspace-icon';
import { appPresentation, roleLabel } from '@/lib/workspace-presentation';

export default async function AppPage({ params, searchParams }) {
  const workspace = await requireWorkspace();
  const { slug } = await params;
  const app = await getApp(slug, (await searchParams).owner);
  if (!app) notFound();
  const Component = app.Component;
  return <><header className="ws-app-header" style={{ '--app-color': appPresentation(slug).color }}><div className="ws-app-title"><span className="ws-app-title-icon"><WorkspaceIcon name={slug}/></span><h1>{app.name}</h1>{app.access.role !== 'owner' && <span className="private-badge">{roleLabel(app.access.role)}</span>}{app.access.role === 'owner' && <Link className="ws-share-link" href={`/admin/access?app=${slug}`}>Manage access</Link>}</div></header><Component key={`${slug}:${workspace.user.id}:${app.access.ownerId}:${app.access.role}`} workspaceOwner={app.access.ownerId} permission={app.access.role}/></>;
}
