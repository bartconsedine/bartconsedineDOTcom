'use client';
import { useEffect, useRef, useState } from 'react';
import { startTvHistory, subscribeTvHistory, openTvOverlay, closeTvOverlay } from './history';
import { attachRemoteNavigation } from './remote-navigation';
import './remote-navigation.css';
import MorningFeed from '../screen';
import './tv.css';
export default function TvScreen() {
  const root = useRef(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  useEffect(() => attachRemoteNavigation(root.current), []);
  useEffect(() => { const stop = startTvHistory(window); const off = subscribeTvHistory(window, location => setConfirmDisconnect(location?.overlay === 'disconnect')); return () => { off(); stop(); }; }, []);
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
  function disconnect() { setConfirmDisconnect(true); openTvOverlay(window, 'disconnect'); }
  async function forget() {
    setBusy(true); setError('');
    try { await request('forget'); setState({ status: 'unpaired' }); setConfirmDisconnect(false); closeTvOverlay(window, 'disconnect'); }
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
  const dialog = confirmDisconnect && <div className="tv-disconnect" role="dialog" aria-modal="true" aria-label="Disconnect this TV" tabIndex={-1}><h2>Disconnect this TV?</h2><p>You can connect again by scanning a new QR code.</p><div className="tv-disconnect-actions"><button data-tv-cancel disabled={busy} onClick={() => { setConfirmDisconnect(false); closeTvOverlay(window, 'disconnect'); }}>Keep connected</button><button disabled={busy} onClick={forget}>{busy ? 'Disconnecting…' : 'Disconnect TV'}</button></div>{error && <p role="alert">{error}</p>}</div>;
  if (state.status === 'connected') return <main ref={root} id="main" aria-label="TV controls">{dialog}<MorningFeed permission="viewer" tv onDisconnect={disconnect} onTvExpired={() => setState({ status: 'expired' })}/>{error && !confirmDisconnect && <p className="tv-overlay-error" role="alert">{error}</p>}</main>;
  return <main ref={root} id="main" className="tv-pair" aria-label="TV controls">{dialog}<div className="tv-pair-copy"><p className="tv-eyebrow">BART TV / CONNECT</p><p className="tv-remote-help">↑ ↓ ← → Move · OK / Enter Select · Back Close</p><h1>Your signal.<br/><em>On the big screen.</em></h1>
    {state.status === 'pending' && seconds > 0 ? <><p>Scan this QR code with your phone. Sign in with Google, check the code below, then approve this TV.</p><p className="tv-code">{state.code}</p><p role="status">Waiting for your approval · expires in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p><p>Keep this screen open. Your feed starts automatically.</p><button disabled={busy} onClick={disconnect}>Cancel pairing</button></> : <><p>{state.status === 'expired' || state.status === 'pending' ? 'This connection expired or was disconnected. Generate a new QR code to connect again.' : 'Use your phone to sign in. Your TV gets read-only access to your morning feed for 30 days.'}</p><button disabled={busy || state.status === 'loading'} onClick={connect}>{busy ? 'Connecting…' : state.status === 'loading' ? 'Checking connection…' : 'Show QR code'}</button><p>No Google password needed on your TV.</p></>}
    {error && !confirmDisconnect && <p role="alert">{error}</p>}{state.status === 'error' && <button onClick={() => window.location.reload()}>Reload connection</button>}
  </div>{state.status === 'pending' && seconds > 0 && <div className="tv-qr"><img src={state.qr} alt="Scan with your phone to approve this TV" width="360" height="360"/><p>Camera → Scan → Approve</p><a href={state.approvalUrl}>Open approval on this device</a></div>}</main>;
}
