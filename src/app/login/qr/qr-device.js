'use client';
import { useEffect, useRef, useState } from 'react';
import { attachRemoteNavigation } from '@/private-apps/morning-feed/tv/remote-navigation';

export default function QrDevice({ autoStart = false, embedded = false } = {}) {
  const [label, setLabel] = useState('Living room TV');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(null);
  const lock = useRef(false), root = useRef(null);

  useEffect(() => {
    root.current.querySelector('button')?.focus();
    if (!embedded) return attachRemoteNavigation(root.current.closest('main'));
  }, []);

  useEffect(() => { if (autoStart) void call('start'); }, []);

  const hasRequest = Boolean(data);
  useEffect(() => {
    root.current.querySelector(hasRequest ? '[data-tv-cancel]' : '[data-qr-start]')?.focus();
  }, [hasRequest]);

  async function call(action) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(''); setRetry(null);
    try {
      const response = await fetch('/api/admin-qr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(action === 'start' ? { label } : {}) }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 410) setData(null);
        else setRetry(action);
        throw Error(result.error || 'Sign-in is unavailable. Please retry.');
      }
      if (result.connected) { window.location.assign('/tv?view=calendar'); return; }
      if (result.status === 'expired') {
        setData(null);
        throw Error('This request expired or was declined. Generate a new code.');
      }
      setData(result.cancelled ? null : result);
    } catch (e) {
      setError(e.name === 'TimeoutError' ? 'The connection timed out. Retry to check this request.' : e.message);
      if (e.name === 'TimeoutError' || e.name === 'TypeError') setRetry(action);
    } finally { lock.current = false; setBusy(false); }
  }

  useEffect(() => {
    if (error || !data || !['pending', 'ready'].includes(data.status)) return;
    const timer = setTimeout(() => call(data.status === 'ready' ? 'exchange' : 'poll'), 2500);
    return () => clearTimeout(timer);
  }, [data, error]);

  return <section className={`qr-device${data ? ' qr-device-request' : ''}`} ref={root} aria-label="Owner QR sign-in controls">
    {!data ? <>
      <p className="qr-eyebrow">CONNECT THIS SCREEN</p>
      <h2>Sign in with your phone</h2>
      <label>Device name<input maxLength={100} value={label} onChange={e => setLabel(e.target.value)} disabled={busy}/></label>
      <button data-qr-start aria-busy={busy} disabled={!label.trim()} onClick={() => call('start')}>{busy ? 'Creating request…' : 'Generate QR code'}</button>
      <p>No password to type on your TV.</p>
    </> : <>
      <p className="qr-eyebrow">SCAN WITH YOUR PHONE</p>
      <h2>{label}</h2>
      {data.qr && <img src={data.qr} width="280" height="280" alt="Scan to review full owner sign-in on your phone"/>}
      <p className="qr-confirmation">Match this code: <strong>{data.confirmation}</strong></p>
      <p role="status">{data.status === 'ready' ? 'Approval received. Signing in…' : 'Waiting for phone approval'}</p>
      <p className="qr-instructions">Check the device name and code on your signed-in phone. Approve full access, then choose the same Google account. This code expires in 10 minutes.</p>
      <button aria-busy={busy} data-tv-cancel onClick={() => call('cancel')}>Cancel sign-in</button>
    </>}
    {error && <div className="qr-error" role="alert"><p>{error}</p>{retry && <button aria-busy={busy} onClick={() => call(retry)}>Retry connection</button>}</div>}
  </section>;
}
