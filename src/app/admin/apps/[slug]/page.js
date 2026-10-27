import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/auth';
import { getApp } from '@/lib/apps';

export default async function AppPage({ params, searchParams }) {
  const workspace = await requireWorkspace();
  const { slug } = await params;
  const app = await getApp(slug, (await searchParams).owner);
  if (!app) notFound();
  const Component = app.Component;
  return <><Link className="back-link" href="/admin">All apps</Link><h1>{app.name}</h1><p className="admin-intro">{app.description}</p>{app.access.role === 'owner' && <Link className="inline-link" href={`/admin/access?app=${slug}`}>Invite people / manage access</Link>}<Component key={`${slug}:${workspace.user.id}:${app.access.ownerId}:${app.access.role}`} workspaceOwner={app.access.ownerId} permission={app.access.role}/></>;
}
