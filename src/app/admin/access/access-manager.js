'use client';
import { useEffect, useRef, useState } from 'react';
import { appHref } from '@/lib/workspace-policy';
import './access.css';
const endpoint = '/api/admin/access';
export default function AccessManager({ initialApp = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [slug, setSlug] = useState(initialApp);
  const [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(null);
  const lock = useRef(false);
  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store' }); const next = await response.json();
      if (!response.ok) throw new Error(next.error || 'Could not load app access.');
      setData(next); setSlug(current => next.apps.some(a => a.slug === current) ? current : next.apps[0]?.slug || '');
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function mutate(body) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok || result.saved !== true) throw new Error(result.error || 'Access was not saved.');
      setMessage(body.action === 'revoke' ? 'Access revoked. Future requests are denied.' : 'Access saved. Share the app link below; no email has been sent.');
      setConfirm(null);
      if (body.action === 'invite') setEmail('');
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); lock.current = false; }
  }
  async function copyLink(app) {
    try { await navigator.clipboard.writeText(new URL(appHref(app, data.ownerId), window.location.origin).href); setMessage('App link copied. Send it to the invited email’s owner.'); }
    catch { setError('Could not copy the link. Use the Open app link and copy its address.'); }
  }
  if (loading && !data) return <p role="status">Loading app access…</p>;
  if (!data) return <section className="access-panel"><p role="alert">{error}</p><button onClick={load}>Retry loading access</button></section>;
  return <div className="access-manager">
    <p className="access-note">Guests sign in with Google using the exact email you invite. They only see invited apps and cannot invite others. An app invitation includes all data in that app, including any booking details or private notes. Revoking access blocks future requests; it cannot erase copies someone already viewed.</p>
    {error && <p role="alert" className="access-error">{error}</p>}{message && <p role="status" className="access-success">{message}</p>}
    <form className="access-panel" onSubmit={e => { e.preventDefault(); mutate({ action: 'invite', slug, email, role }); }}>
      <h2>Invite to an app</h2><fieldset disabled={busy || loading || !data.apps.length}><label>App<select value={slug} onChange={e => setSlug(e.target.value)}>{data.apps.map(app => <option key={app.slug} value={app.slug}>{app.name}</option>)}</select></label><label>Google account email<input type="email" maxLength={254} autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label><label>Permission<select value={role} onChange={e => setRole(e.target.value)}><option value="viewer">Can view</option><option value="editor">Can edit</option></select></label><button type="submit">{busy ? 'Saving access…' : 'Grant access'}</button></fieldset>
      <p>After saving, copy and send the app link. The link only works for invited accounts.</p>
    </form>
    <section className="access-panel"><div className="access-heading"><h2>Current access</h2><button disabled={busy || loading} onClick={load}>{loading ? 'Refreshing…' : 'Refresh access'}</button></div>
      {!data.grants.length && <p>No invitations yet. Your apps are private until you grant access.</p>}
      {data.grants.map(grant => <article className="access-person" key={`${grant.app_slug}-${grant.invited_email}`}><div><strong>{grant.invited_email}</strong><p>{data.apps.find(a => a.slug === grant.app_slug)?.name || grant.app_slug}</p></div><label>Permission for {grant.invited_email}<select value={grant.role} disabled={busy || loading} onChange={e => mutate({ action: 'change', slug: grant.app_slug, email: grant.invited_email, role: e.target.value, expectedAt: grant.updated_at })}><option value="viewer">Can view</option><option value="editor">Can edit</option></select></label><div className="access-actions"><button disabled={busy || loading} onClick={() => copyLink(grant.app_slug)}>Copy app link</button><a href={appHref(grant.app_slug, data.ownerId)}>Open app</a><button disabled={busy || loading} onClick={() => setConfirm(grant)}>Revoke</button></div>
      {confirm?.app_slug === grant.app_slug && confirm?.invited_email === grant.invited_email && <div className="access-confirm"><p>Remove {grant.invited_email}’s access to this app?</p><button disabled={busy || loading} onClick={() => mutate({ action: 'revoke', slug: grant.app_slug, email: grant.invited_email, expectedAt: grant.updated_at })}>Confirm revoke</button><button disabled={busy} onClick={() => setConfirm(null)}>Keep access</button></div>}</article>)}
    </section>
  </div>;
}
