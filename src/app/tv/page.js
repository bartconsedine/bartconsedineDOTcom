import { qrEnabled } from '@/lib/admin-qr/api';
import { checkAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { TV_VIEWS } from '@/private-apps/morning-feed/tv/history';
import TvScreen from '@/private-apps/morning-feed/tv/tv-screen';
export const metadata = { title: { absolute: 'Bart TV' }, applicationName: 'Bart TV', manifest: '/tv/manifest.webmanifest', icons: { icon: [{ url: '/tv/icon.svg', type: 'image/svg+xml' }, { url: '/tv/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/tv/icon-180.png' }, appleWebApp: { title: 'Bart TV', capable: true }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function TV({ searchParams }) {
  const access = await checkAdmin();
  if (access.ok) {
    const requested = (await searchParams)?.view;
    const view = TV_VIEWS.includes(requested) ? requested : 'home';
    redirect(`/admin/apps/morning-feed?view=${view}`);
  }
  return <TvScreen ownerLoginEnabled={qrEnabled()}/>;
}
