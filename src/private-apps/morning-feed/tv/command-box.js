'use client';
import { useEffect, useRef, useState } from 'react';
import PagedText from './paged-text';
import './panels.css';

export default function TvCommandBox({ paired = false, ownerLoginEnabled = false }) {
  const [connection, setConnection] = useState(null), [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const pending = useRef(null), lock = useRef(false), sequence = useRef(0);
  async function post(command) {
    const response = await fetch('/api/tv/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Command was not confirmed. Retry the same command.');
    return result;
  }
  async function refresh() {
    if (paired) return;
    const current = ++sequence.current;
    try {
      const response = await fetch('/api/tv/commands', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (current !== sequence.current) return;
      if (!response.ok) throw Error(result.error || 'Could not check your dot connection.');
      setConnection(result); setError('');
      if (result.canSend === true && result.state === 'ready') {
        // The existing durable outbox retries while this screen remains open.
        await post({ action: 'dispatch' });
      }
    } catch (failure) { if (current === sequence.current) { setConnection({ state: 'unavailable', canSend: false }); setError(failure.message); } }
  }
  useEffect(() => {
    if (paired) return;
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => { sequence.current++; clearInterval(timer); };
  }, [paired]);
  async function send(event) {
    event.preventDefault();
    if (lock.current || connection?.canSend !== true || connection?.state !== 'ready' || !draft.trim()) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    pending.current ??= { action: 'send', id: crypto.randomUUID(), body: draft };
    try {
      const result = await post(pending.current);
      if (result.saved !== true || result.accepted !== true || result.id !== pending.current.id || result.delivery !== 'queued') throw Error('Save was not confirmed. Retry this same command.');
      pending.current = null; setDraft(''); setNotice('Saved to your private queue. Waiting for your dot; this does not confirm execution.');
      try { await post({ action: 'dispatch' }); }
      catch { setError('Your command is saved. Delivery will retry while this screen is open.'); }
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  const ready = !paired && connection?.state === 'ready' && connection?.canSend === true;
  const status = paired ? 'Owner sign-in needed' : !connection ? 'Checking connection' : ready ? 'Ready to queue' : 'Connection needed';
  return <section className="morning-command tv-command-panel" aria-label="Commands to your dot">
    <header className="tv-command-heading"><div><p className="tv-panel-kicker">YOUR PRIVATE DOT / COMMANDS</p><h2>A thought. A next step.</h2></div><span className="tv-command-readiness" data-ready={ready}><i aria-hidden="true"/>{status}</span></header>
    {paired ? <div className="tv-command-locked"><span className="tv-panel-symbol" aria-hidden="true">✳</span><h3>Your dot is one sign-in away.</h3><p>This TV is approved for Morning signal and news reading progress. Sign in as the owner to send private commands.</p><div className="tv-panel-actions">{ownerLoginEnabled && <a className="tv-panel-primary" href="/login/qr">Sign in with phone QR</a>}<a href="/login">Owner sign-in</a></div></div> : <>
      <div className="tv-command-workspace">
        <form onSubmit={send} className="tv-command-compose"><label htmlFor="tv-dot-command">What would you like to do?</label><textarea id="tv-dot-command" maxLength={2000} rows={4} value={draft} readOnly={Boolean(pending.current)} disabled={!ready || busy} onChange={event => { setDraft(event.target.value); setNotice(''); }} placeholder={ready ? 'Give your dot a clear next step…' : 'Connect your private channel to get started.'} aria-describedby="tv-command-draft-note"/><div className="tv-command-submit"><span>{draft.length.toLocaleString()} / 2,000</span><button className="tv-panel-primary" type="submit" disabled={!ready || busy || !draft.trim()}>{busy ? 'Saving command…' : pending.current ? 'Retry same command' : 'Send to my dot'}</button></div><p id="tv-command-draft-note">{pending.current ? 'Keep this draft unchanged and retry to recover an uncertain save. The same command ID prevents duplicate messages.' : 'Unsent commands are temporary. Leaving this screen or reloading clears them.'}</p></form>
        <aside className="tv-command-support" aria-label="Connection and delivery"><div className="tv-command-channel"><span aria-hidden="true">✳</span><div><p className="tv-panel-kicker">PRIVATE CHANNEL</p><h3>{ready ? 'Your dot, connected.' : !connection ? 'Finding your connection…' : 'Let’s get connected.'}</h3></div></div><div className="tv-command-feedback">
          {error || notice ? <div className={`tv-command-message${error ? ' tv-panel-alert' : ''}`} role={error ? 'alert' : 'status'}><PagedText text={[notice, error].filter(Boolean).join('\n\n')} label={error ? 'Connection message' : 'Queue receipt'}/></div> : <div className="tv-command-explanation"><PagedText text={`${!connection ? 'Checking your dot connection…' : ready ? 'Connected to your verified private Robot Party channel.' : 'Connect your existing dot’s private channel before sending commands.'}\n\nQueued is the first step. Your dot’s reply and the outcome appear in your private conversation.`} label="Delivery guide"/></div>}

        </div><div className="tv-panel-actions"><a className="tv-command-replies" href="/admin/apps/robot-party/personal">{ready ? 'View private replies' : 'Connect my dot'} <span aria-hidden="true">↗</span></a><button onClick={refresh} disabled={busy}>Check connection</button></div></aside>
      </div>
      <footer className="tv-command-footnote"><span aria-hidden="true">◇</span><p>Delivery attempts run while this screen is open. A queued command does not confirm execution. Replies appear in your private conversation.</p></footer>
    </>}
  </section>;
}
