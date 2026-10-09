'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminNav({ apps }) {
  const pathname = usePathname();
  return <nav aria-label="Workspace navigation">
    <Link href="/admin" aria-current={pathname === '/admin' ? 'page' : undefined}>My apps</Link>
    {apps.map(app => <Link key={app.slug} href={`/admin/apps/${app.slug}`} aria-current={pathname === `/admin/apps/${app.slug}` ? 'page' : undefined}>{app.name}</Link>)}
    <Link href="/">Public site ↗</Link>
  </nav>;
}
