import Link from 'next/link';
import { qrEnabled } from '@/lib/admin-qr/api';
import QrDevice from './qr-device';
import './qr.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bart TV · Owner sign-in', robots: { index: false, follow: false } };
export default async function Page({ searchParams }) {
  const autoStart = (await searchParams)?.calendar === '1';
  return <main id="main" className="qr-login"><header><Link href="/tv">← Back to Bart TV</Link><span>PRIVATE WORKSPACE</span></header><div className="qr-login-layout"><section className="qr-login-copy"><p className="qr-eyebrow">BART TV / OWNER ACCESS</p><h1>Your apps.<br/><em>Your calendar.</em></h1><p>Use your phone to sign in on this screen. Approve this device, then continue with the same Google account.</p><p>Full owner access lasts up to 30 days. Anyone using this screen can open and edit your private apps. Calendar uses your Google connection and may need reconnecting when Google access expires.</p><Link href="/login">Use Google sign-in on this device</Link></section>{qrEnabled() ? <QrDevice autoStart={autoStart}/> : <section className="qr-device"><h2>Owner QR sign-in needs setup.</h2><p>The phone approval service has not been enabled yet. Your existing TV connection still works.</p></section>}</div></main>;
}
