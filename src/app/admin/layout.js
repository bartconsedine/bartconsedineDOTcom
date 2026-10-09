import Link from 'next/link';
import { requireOwner } from '@/lib/auth';

export const metadata = { title: 'Workspace', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }) {
  await requireOwner();
  return <div className="admin-shell"><aside className="admin-sidebar"><Link className="wordmark" href="/">BC<span> / </span></Link><p className="eyebrow">PRIVATE WORKSPACE</p><nav aria-label="Workspace navigation"><Link href="/admin">▦ &nbsp; My apps</Link><Link href="/">↗ &nbsp; Public site</Link></nav><form action="/auth/signout" method="post"><button type="submit">Sign out ↗</button></form></aside><main id="main" className="admin-main">{children}</main></div>;
}
