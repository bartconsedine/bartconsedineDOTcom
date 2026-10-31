import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { validSecret } from '@/private-apps/morning-feed/tv/api';
import TvConsent from '@/private-apps/morning-feed/tv/consent';
import '@/private-apps/morning-feed/tv/tv.css';
export const metadata = { title: 'Approve your TV', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function ApproveTV({ searchParams }) {
  const { code } = await searchParams;
  const next = `/auth/tv${validSecret(code) ? `?code=${code}` : ''}`;
  const actor = await checkAdmin();
  if (!actor.ok) {
    if (actor.status === 401) redirect(`/login?next=${encodeURIComponent(next)}`);
    return <main id="main" className="tv-consent"><h1>TV approval unavailable</h1><p role="alert">{actor.status === 403 ? 'Only an approved workspace administrator can connect their morning feed.' : 'Could not verify your account. Retry shortly.'}</p><a href="/login">Sign in</a></main>;
  }
  const client = await serverClient();
  const list = await client.rpc('morning_tv', { p_action: 'list', p_secret: null });
  const pending = validSecret(code) ? await client.rpc('morning_tv', { p_action: 'inspect', p_secret: code }) : null;
  const failure = list.error || pending?.error || (code && !validSecret(code));
  return <main id="main" className="tv-consent"><p className="tv-eyebrow">MORNING SIGNAL / PHONE APPROVAL</p><h1>Your screen. Your say.</h1><p>Signed in as {actor.user.email}.</p>{failure ? <p role="alert">{pending?.error?.message === 'tv_expired' ? 'This QR code expired or was already used. Generate a new one on your TV.' : 'Could not load TV connections. Retry; pairing setup may still be pending.'}</p> : <TvConsent code={code} confirmation={pending?.data?.code} devices={list.data?.devices || []}/>}<p><a href="/admin/apps/morning-feed">Back to Morning signal</a></p></main>;
}
