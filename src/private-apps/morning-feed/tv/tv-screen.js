'use client';
import { useEffect, useRef, useState } from 'react';
import { startTvHistory, subscribeTvHistory, openTvOverlay, closeTvOverlay } from './history';
import { attachRemoteNavigation } from './remote-navigation';
import './remote-navigation.css';
import MorningFeed from '../screen';
import './tv.css';
export default function TvScreen({ ownerLoginEnabled = false }) {
  const root = useRef(null), operation = useRef(false), requestRevision = useRef(0);
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
    if (operation.current) return;
    operation.current = true; requestRevision.current++; setBusy(true); setError('');
    try { setState(await request('start')); setNow(Date.now()); }
    catch (failure) { setError(failure.message); }
    finally { operation.current = false; setBusy(false); }
  }
  async function retry() {
    if (operation.current) return;
    operation.current = true; requestRevision.current++; setBusy(true); setError('');
    try { setState(await request()); setNow(Date.now()); }
    catch (failure) { setError(failure.message || 'Connection unavailable. Try again.'); }
    finally { operation.current = false; setBusy(false); }
  }
  function disconnect() { setError(''); setConfirmDisconnect(true); openTvOverlay(window, 'disconnect'); }
  async function forget() {
    if (operation.current) return;
    operation.current = true; requestRevision.current++; setBusy(true); setError('');
    try {
      const data = await request('forget');
      if (data.disconnected !== true) throw Error('Disconnect was not confirmed. Please retry.');
      setState({ status: 'unpaired' }); setConfirmDisconnect(false); closeTvOverlay(window, 'disconnect');
    }
    catch (failure) { setError(failure.message); }
    finally { operation.current = false; setBusy(false); }
  }
  useEffect(() => {
    let disposed = false;
    request().then(data => { if (!disposed) { setState(data); setNow(Date.now()); } }).catch(() => { if (!disposed) { setState({ status: 'error' }); setError('Could not check your TV connection. Check your network, then try again.'); } });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (state.status !== 'pending') return;
    let disposed = false, polling = false;
    const timer = setInterval(async () => {
      if (polling || operation.current) return;
      polling = true;
      const revision = requestRevision.current;
      try { const data = await request(); if (!disposed && revision === requestRevision.current) { setState(data); setError(''); } }
      catch { if (!disposed && revision === requestRevision.current) setError('Connection interrupted. Your code is still here. Retrying every five seconds.'); }
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
  const pending = state.status === 'pending' && seconds > 0;
  const expired = state.status === 'expired' || state.status === 'pending' && !pending;
  const dialog = confirmDisconnect && <div className="tv-disconnect" role="dialog" aria-modal="true" aria-labelledby="tv-disconnect-title" tabIndex={-1}><div className="tv-disconnect-card"><p className="tv-eyebrow">TV CONNECTION</p><h2 id="tv-disconnect-title">{pending ? 'Cancel this pairing?' : 'Disconnect this TV?'}</h2><p>{pending ? 'This code will stop working. You can start again with a new code whenever you’re ready.' : 'Your saved morning stays in your workspace. Connect this screen again by scanning a new QR code.'}</p><div className="tv-disconnect-actions"><button data-tv-cancel disabled={busy} onClick={() => { setConfirmDisconnect(false); setError(''); closeTvOverlay(window, 'disconnect'); }}>{pending ? 'Keep pairing' : 'Keep connected'}</button><button className="tv-disconnect-confirm" disabled={busy} onClick={forget}>{busy ? 'Disconnecting…' : pending ? 'Cancel pairing' : 'Disconnect TV'}</button></div>{error && <p className="tv-pair-error" role="alert">{error}</p>}<p className="tv-dialog-hint">← → Choose · OK Select · Back Keep connected</p></div></div>;
  if (state.status === 'connected') return <main ref={root} id="main" aria-label="TV controls">{dialog}<MorningFeed permission="viewer" tv ownerLoginEnabled={ownerLoginEnabled} onDisconnect={disconnect} onTvExpired={() => setState({ status: 'expired' })}/>{error && !confirmDisconnect && <p className="tv-overlay-error" role="alert">{error}</p>}</main>;
  return <main ref={root} id="main" className="tv-pair tv-onboarding" aria-label="TV controls">
    {dialog}
    <header className="tv-onboarding-header"><div className="tv-onboarding-brand"><img src="/tv/icon.svg" alt="" width="44" height="44"/><span>Bart TV<small>A LITTLE CLOSER TO YOUR WORLD</small></span></div><p className="tv-remote-help"><span>↑ ↓ ← → Move</span><span>OK Select</span><span>Back Return</span></p></header>
    <div className={`tv-onboarding-body${pending ? ' tv-onboarding-pending' : ''}`}>
      <div className="tv-pair-copy"><p className="tv-eyebrow">{pending ? 'ONE SMALL STEP. THEN SETTLE IN.' : expired ? 'READY WHEN YOU ARE' : 'WELCOME TO YOUR BIG SCREEN'}</p><h1>{pending ? <>Your phone.<br/><em>Your way in.</em></> : <>Your signal.<br/><em>A clearer view.</em></>}</h1>
        {pending ? <><ol className="tv-pair-steps"><li><span>01</span><div><strong>Scan with your phone</strong><p>Open your camera and point it at the QR code.</p></div></li><li><span>02</span><div><strong>Sign in and compare</strong><p>Use Google, then match the code shown on this screen.</p></div></li><li><span>03</span><div><strong>Approve. You’re here.</strong><p>Your morning opens automatically. Keep this screen on.</p></div></li></ol><div className="tv-pair-actions"><button className="tv-pair-secondary" disabled={busy} onClick={disconnect}>Cancel pairing</button>{error && <button disabled={busy} onClick={retry}>{busy ? 'Checking…' : 'Check approval now'}</button>}</div></> : <><p className="tv-pair-intro">{expired ? 'This connection has ended. Scan a fresh code to bring your morning back to this screen.' : 'Your morning, the headlines, and a little room to think. Connect with your phone. No password to type on your TV.'}</p><div className="tv-pair-options"><section className="tv-pair-option"><p className="tv-eyebrow">MORNING & NEWS</p><h2>A screen for your daily rhythm.</h2><p>View your morning for 30 days. News reading progress syncs when enabled.</p>{state.status === 'error' ? <button disabled={busy} onClick={retry}>{busy ? 'Checking connection…' : 'Retry connection'}</button> : <button disabled={busy || state.status === 'loading'} onClick={connect}>{busy ? 'Connecting…' : state.status === 'loading' ? 'Checking connection…' : 'Show QR code'}</button>}</section>{ownerLoginEnabled && <section className="tv-pair-owner"><div><strong>Your personal TV?</strong><p>Use a full workspace sign-in for private Calendar and commands.</p></div><a href="/login/qr">Sign in to all apps and Calendar </a></section>}</div></>}
        {error && !confirmDisconnect && <p className="tv-pair-error" role="alert">{error}</p>}
      </div>
      {pending ? <div className="tv-qr"><span className="tv-qr-label">SCAN TO CONNECT</span><img src={state.qr} alt="Scan with your phone to approve this TV" width="640" height="640"/><div className="tv-qr-identity"><span>Match this code on your phone</span><strong className="tv-code">{state.code}</strong></div><p className="tv-pair-wait" role="status"><i/>Waiting for your approval</p><p className="tv-pair-countdown">Code expires in <strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong></p><a href={state.approvalUrl}>Open approval on this device</a></div> : <aside className="tv-onboarding-preview" aria-label="What’s on Bart TV"><span className="tv-preview-orbit" aria-hidden="true"/><p className="tv-eyebrow">LESS SCROLL. MORE SIGNAL.</p><h2>Make yourself<br/><em>at home.</em></h2><div className="tv-preview-features"><span><b aria-hidden="true">01</b> Your morning</span><span><b aria-hidden="true">02</b> The daily signal</span><span><b aria-hidden="true">03</b> Your own pace</span></div><p>Choose a screen. Take your time.</p></aside>}
    </div>
    <footer className="tv-onboarding-footer"><span>{pending ? 'Only approve a code you can see on your TV.' : 'YOUR SPACE, ON A BIGGER CANVAS.'}</span><span>{pending ? 'Connection checks every 5 seconds' : 'Phone sign-in · Remote control · Room to breathe'}</span></footer>
  </main>;
}
