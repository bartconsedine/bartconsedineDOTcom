'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminNav({ apps, isAdmin = false }) {
  const pathname = usePathname();
  return <nav aria-label="Workspace navigation">
    <Link href="/admin" aria-current={pathname === '/admin' ? 'page' : undefined}>My apps</Link>
    {apps.map(app => <Link key={`${app.slug}-${app.ownerId}`} href={app.href} aria-current={pathname === `/admin/apps/${app.slug}` ? 'page' : undefined}>{app.name}{app.role !== 'owner' ? ' · Shared' : ''}</Link>)}
    {isAdmin && <Link href="/admin/access" aria-current={pathname === '/admin/access' ? 'page' : undefined}>People & access</Link>}<Link href="/">Public site</Link>
  </nav>;
}
