import Link from 'next/link';
import { qrEnabled } from '@/lib/admin-qr/api';
import QrDevice from './qr-device';
export const dynamic='force-dynamic';
export const metadata={title:'Admin QR sign-in',robots:{index:false,follow:false}};
export default function Page(){return <main id="main" className="login-page"><div className="login-panel"><h1>Sign in with your phone</h1><p>Full admin access on this device, including TVs. Anyone using this browser can open your private apps. Access expires after 30 days; renewal requires a new phone approval. This does not start background work.</p>{qrEnabled()?<QrDevice/>:<p>Admin QR sign-in is not active yet.</p>}<Link href="/login">Use Google sign-in</Link></div></main>;}
