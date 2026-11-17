import { qrEnabled } from '@/lib/admin-qr/api';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/auth';
import { listApps } from '@/lib/apps';
import AdminNav from '@/components/admin-nav';
import './workspace.css';

export const metadata = { title: 'Workspace', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }) {
  const workspace = await requireWorkspace();
  const apps = await listApps();
  return <div className="admin-shell"><aside className="admin-sidebar"><Link className="ws-brand" href="/admin" aria-label="BC workspace home"><span className="ws-brand-mark">bc<span>.</span></span><span className="ws-brand-name">Bart’s workspace<small>MAKE YOURSELF AT HOME</small></span></Link><AdminNav apps={apps} isAdmin={workspace.isAdmin}/><div className="ws-sidebar-foot">{workspace.isAdmin && qrEnabled() && <Link className="ws-device-link" href="/auth/qr">Manage admin devices</Link>}<div className="ws-account"><span className="ws-avatar" aria-hidden="true">{workspace.isAdmin ? 'BC' : 'G'}</span><span>{workspace.isAdmin ? 'Personal workspace' : 'Shared workspace'}<small>{workspace.isAdmin ? 'Administrator' : 'Invited guest'}</small></span></div><form action="/auth/signout" method="post"><button type="submit">Sign out</button></form></div></aside><main id="main" className="admin-main">{children}</main></div>;
}
