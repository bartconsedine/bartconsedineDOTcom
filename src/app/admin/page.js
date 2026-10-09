import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { listApps } from '@/lib/apps';

export default async function AdminHome() {
  await requireOwner();
  const apps = await listApps();
  return <><div className="admin-topline"><p className="eyebrow">YOUR PERSONAL SPACE</p><span className="private-badge">● Owner only</span></div><h1>Welcome back, Barton.</h1><p className="admin-intro">Your apps and tools, in one place.</p><div className="admin-section-title"><h2>My apps <span>{apps.length}</span></h2></div>{apps.length ? <div className="app-grid">{apps.map(app => <Link className="app-card" href={`/admin/apps/${app.slug}`} key={app.slug}><h3>{app.name} ↗</h3><p>{app.description}</p></Link>)}</div> : <section className="empty-apps"><span className="empty-symbol" aria-hidden="true">⊞</span><h2>Your workspace starts here.</h2><p>No custom apps yet. When your first app is added,<br/>you’ll find it here, ready to open.</p><a className="inline-link" href="mailto:bartconsedine@gmail.com?subject=An%20idea%20for%20my%20workspace">Capture an app idea ↗</a></section>}<div className="workspace-note"><div><h3>A space that grows with you.</h3><p>Add purpose-built tools as you need them. Your public showcase stays separate from your private workspace.</p></div></div></>;
}
