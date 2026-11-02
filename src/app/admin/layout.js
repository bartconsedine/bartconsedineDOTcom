import { qrEnabled } from '@/lib/admin-qr/api';
import Link from 'next/link';
import { requireWorkspace } from '@/lib/auth';
import { listApps } from '@/lib/apps';
import AdminNav from '@/components/admin-nav';

export const metadata = { title: 'Workspace', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }) {
  const workspace = await requireWorkspace();
  const apps = await listApps();
  return <div className="admin-shell"><aside className="admin-sidebar"><Link className="wordmark" href="/">BC<span> / </span></Link><p className="eyebrow">PRIVATE WORKSPACE</p><AdminNav apps={apps} isAdmin={workspace.isAdmin}/>{workspace.isAdmin && qrEnabled() && <p><Link href="/auth/qr">Manage admin devices</Link></p>}<form action="/auth/signout" method="post"><button type="submit">Sign out</button></form></aside><main id="main" className="admin-main">{children}</main></div>;
}
