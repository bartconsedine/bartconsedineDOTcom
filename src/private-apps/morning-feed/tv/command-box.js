'use client';
import { useEffect, useRef, useState } from 'react';

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
  return <section className="morning-command tv-command-panel" aria-label="Commands to your dot">
    <div><p className="tv-panel-kicker">YOUR PRIVATE DOT</p><h2>Talk to your dot.</h2><p>{paired ? 'This TV is approved for Morning signal and news reading progress. Sign in as the owner to send private commands.' : !connection ? 'Checking your dot connection…' : ready ? 'Connected to your verified private Robot Party channel.' : 'Connect your existing dot’s private channel before sending commands.'}</p></div>
    {paired ? <div className="tv-panel-actions">{ownerLoginEnabled && <a href="/login/qr">Sign in with phone QR</a>}<a href="/login">Owner sign-in</a></div> : <>
      <form onSubmit={send} className="tv-command-compose"><label htmlFor="tv-dot-command">Command to your dot<textarea id="tv-dot-command" maxLength={2000} rows={3} value={draft} readOnly={Boolean(pending.current)} disabled={!ready || busy} onChange={event => { setDraft(event.target.value); setNotice(''); }} placeholder="What would you like your dot to do?"/></label><button type="submit" disabled={!ready || busy || !draft.trim()}>{busy ? 'Saving command…' : pending.current ? 'Retry same command' : 'Send to my dot'}</button></form>
      <div className="tv-panel-actions"><button onClick={refresh} disabled={busy}>Check connection</button><a href="/admin/apps/robot-party/personal">{ready ? 'View private replies' : 'Connect my dot'}</a></div>
      <p>Unsent commands are temporary and are lost on reload. Delivery attempts run while this screen is open. Replies appear in your private conversation.</p>
    </>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {pending.current && <p>Keep this draft unchanged and retry to recover an uncertain save. The same command ID prevents duplicate messages.</p>}
  </section>;
}
