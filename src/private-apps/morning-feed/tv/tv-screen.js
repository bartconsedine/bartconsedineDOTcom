'use client';
import { useEffect, useState } from 'react';
import MorningFeed from '../screen';
import './tv.css';
export default function TvScreen() {
  const [state, setState] = useState({ status: 'loading' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  async function request(action) {
    const response = await fetch('/api/tv', action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) } : { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Connection failed. Retry.');
    return data;
  }
  async function connect() {
    setBusy(true); setError('');
    try { setState(await request('start')); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    if (!window.confirm('Disconnect this TV from your morning feed?')) return;
    setBusy(true); setError('');
    try { await request('forget'); setState({ status: 'unpaired' }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let disposed = false;
    request().then(data => { if (!disposed) setState(data); }).catch(() => { if (!disposed) { setState({ status: 'error' }); setError('Could not check your TV connection. Reload to retry.'); } });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (state.status !== 'pending') return;
    let disposed = false, polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try { const data = await request(); if (!disposed) { setState(data); setError(''); } }
      catch { if (!disposed) setError('Connection interrupted. Retrying…'); }
      finally { polling = false; }
    }, 5000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { disposed = true; clearInterval(timer); clearInterval(clock); };
  }, [state.status]);
  useEffect(() => {
    if (state.status !== 'connected' || !state.expiresAt) return;
    const timer = setInterval(() => { if (Date.parse(state.expiresAt) <= Date.now()) setState({ status: 'expired' }); }, 1000);
    return () => clearInterval(timer);
  }, [state.status, state.expiresAt]);
  const seconds = Math.max(0, Math.ceil((Date.parse(state.expiresAt) - now) / 1000));
  if (state.status === 'connected') return <main id="main"><MorningFeed permission="viewer" tv onDisconnect={disconnect} onTvExpired={() => setState({ status: 'expired' })}/>{error && <p className="tv-overlay-error" role="alert">{error}</p>}</main>;
  return <main id="main" className="tv-pair"><div className="tv-pair-copy"><p className="tv-eyebrow">MORNING SIGNAL / TV</p><h1>Your morning.<br/><em>On the big screen.</em></h1>
    {state.status === 'pending' && seconds > 0 ? <><p>Scan this QR code with your phone. Sign in with Google, check the code below, then approve this TV.</p><p className="tv-code">{state.code}</p><p role="status">Waiting for your approval · expires in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p><p>Keep this screen open. Your feed starts automatically.</p><button disabled={busy} onClick={disconnect}>Cancel pairing</button></> : <><p>{state.status === 'expired' || state.status === 'pending' ? 'This connection expired or was disconnected. Generate a new QR code to connect again.' : 'Use your phone to sign in. Your TV gets read-only access to your morning feed for 30 days.'}</p><button disabled={busy || state.status === 'loading'} onClick={connect}>{busy ? 'Connecting…' : state.status === 'loading' ? 'Checking connection…' : 'Show QR code'}</button><p>No Google password needed on your TV.</p></>}
    {error && <p role="alert">{error}</p>}{state.status === 'error' && <button onClick={() => window.location.reload()}>Reload connection</button>}
  </div>{state.status === 'pending' && seconds > 0 && <div className="tv-qr"><img src={state.qr} alt="Scan with your phone to approve this TV" width="360" height="360"/><p>Camera → Scan → Approve</p><a href={state.approvalUrl}>Open approval on this device</a></div>}</main>;
}
