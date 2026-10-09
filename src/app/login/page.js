import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authConfig } from '@/lib/auth-config';
import { checkOwner } from '@/lib/auth';
import LoginForm from './login-form';

export const metadata = { title: 'Private workspace', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
const messages = {
  unauthenticated: 'Sign in to open your private workspace. Your session may have expired.',
  forbidden: 'This account does not have access to the private workspace.',
  expired: 'This sign-in attempt has expired or was cancelled. Please try Google sign-in again.',
  unavailable: 'Sign-in is temporarily unavailable. Please try again later.',
  signedout: 'You’re signed out.',
};
export default async function Login({ searchParams }) {
  const configured = Boolean(authConfig());
  if (configured && (await checkOwner()).ok) redirect('/admin');
  const { state } = await searchParams;
  return <main id="main" className="login-page"><Link className="back-link" href="/">← Back to the public site</Link><div className="login-shell"><div className="login-aside"><Link className="wordmark" href="/">bc<span>↗</span></Link><div><p className="eyebrow">BART’S PRIVATE WORKSPACE</p><h1>A home for<br/>the things<br/><em>you build.</em></h1><p>Your apps, experiments, and everyday tools.<br/>All in one personal workspace.</p></div><span className="login-star" aria-hidden="true">✳</span></div><div className="login-panel"><span className="lock-icon" aria-hidden="true">⌑</span><p className="eyebrow">OWNER ACCESS</p><h2>Welcome back.</h2><p>Sign in with your Google account.<br/>Your workspace stays private.</p>{!configured ? <p className="setup-note" role="status">Sign-in setup is pending. The workspace is locked until authentication is connected.</p> : messages[state] && <p className="setup-note" role="status">{messages[state]}</p>}<LoginForm configured={configured}/><p className="login-footnote">This is a private workspace. Access is limited to the site owner.</p></div></div></main>;
}
