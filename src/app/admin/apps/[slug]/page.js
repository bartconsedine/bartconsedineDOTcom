import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getApp } from '@/lib/apps';

export default async function AppPage({ params }) {
  await requireOwner();
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const Component = app.Component;
  return <><Link className="back-link" href="/admin">← All apps</Link><h1>{app.name}</h1><p className="admin-intro">{app.description}</p><Component/></>;
}
