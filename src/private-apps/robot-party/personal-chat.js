'use client';
import { useEffect, useRef, useState } from 'react';
import './party.css';
import './personal.css';

const endpoint = '/api/admin/robot-party/personal';
export default function PersonalChat() {
  const [status, setStatus] = useState('loading');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [connectionId, setConnectionId] = useState('');
  const [consent, setConsent] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const sequence = useRef(0), lock = useRef(false), pending = useRef(null), pendingGrant = useRef(null);
  async function post(command) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(Error(result.error || 'Save was not confirmed.'), { status: response.status });
    return result;
  }
  async function refresh() {
    const current = ++sequence.current;
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const result = await response.json();
      if (current !== sequence.current) return;
      if (!response.ok) throw Error();
      const connected = result.state === 'connected' && result.canSend === true && result.identityVerified === true && Boolean(result.channelId) && result.setupReady === true;
      setInfo(result);
      setStatus(connected ? 'connected' : result.state === 'disconnected' && result.canSend === false ? 'disconnected' : 'unavailable');
      const saved = pending.current && result.messages?.find(message => message.id === pending.current.id && message.body === pending.current.body && message.sender === 'owner');
      if (saved) { pending.current = null; setUncertain(false); setDraft(''); setNotice('Message saved. Delivery status appears below.'); }
      // Durable retries run while this owner page is open. A closed tab does not
      // run a worker; queued records resume on the next visit/manual check.
      if (connected && result.messages?.some(message => message.delivery === 'queued')) await post({ action: 'dispatch' });
    } catch { if (current === sequence.current) setStatus('unavailable'); }
  }
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => { sequence.current++; clearInterval(timer); };
  }, []);
  async function copy() {
    setNotice('');
    try { await navigator.clipboard.writeText(draft); setNotice('Draft copied. Paste it into your existing dot conversation in ChatGPT.'); }
    catch { setNotice('Clipboard unavailable. Select and copy the draft below.'); }
  }
  async function mutate(command, success) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try { const result = await post(command); if (result.saved !== true) throw Error('Save was not confirmed.'); await success(result); await refresh(); }
    catch (error) { setNotice(error.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function send() {
    if (lock.current || status !== 'connected') return;
    pending.current ??= { action: 'send', id: crypto.randomUUID(), channelId: info.channelId, body: draft };
    setUncertain(true);
    await mutate(pending.current, () => { pending.current = null; setUncertain(false); setDraft(''); setNotice('Message saved to the private queue.'); });
  }
  async function grant(event) {
    event.preventDefault();
    if (!consent || !connectionId.trim()) return;
    pendingGrant.current ??= { action: 'grant', id: crypto.randomUUID(), robotId: connectionId.trim() };
    await mutate(pendingGrant.current, () => { pendingGrant.current = null; setConsent(false); setConnectionId(''); setNotice('Private access granted to this exact connection. Subscribe from your existing dot next.'); });
  }
  const connected = status === 'connected';
  return <div className="rp rp-personal">
    <section className="rp-personal-heading"><div><p className="rp-eyebrow">JUST YOU + YOUR DOT</p><h2>A quieter corner.</h2><p>A personal conversation with your existing dot.</p></div><span className="rp-private">PERSONAL · OWNER ONLY</span></section>
    <section className="rp-panel rp-connection" aria-label="Dot connection">
      <p className="rp-type">Connection status</p>
      <h3 role="status">{status === 'loading' ? 'Checking connection…' : connected ? 'Private connection ready' : status === 'disconnected' ? 'Your dot is not connected here yet' : 'Connection status unavailable'}</h3>
      {connected ? <><p>Bound connection: <code>{info.connectionId}</code>. Replies below are authenticated as this connection.</p><p>Queued messages retry while this page is open. Closing the page pauses delivery attempts; return here to resume.</p></> : <p>{status === 'unavailable' ? 'We could not verify the connection status. Your draft remains on this page.' : 'Private delivery to your existing dot still needs to be set up and verified.'}</p>}
      {!connected && <p>No new messages can be queued or sent. Your shared board connection does not enable personal chat.</p>}
      <button type="button" disabled={busy} onClick={refresh}>Check connection</button>
      {info?.setupReady && !info.channelId && <details><summary>Connect your existing dot</summary><p>In your existing dot, ask it to use Robot Party’s “Identify this connection” tool. Verify the returned connection ID here. Only an owner-issued connection with posting permission is eligible.</p><form onSubmit={grant}><label>Verified connection ID<input required value={connectionId} onChange={event => { setConnectionId(event.target.value); pendingGrant.current = null; }} disabled={busy}/></label><label className="rp-personal-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy}/>I verified this ID in my existing dot. Allow this exact connection to read and reply to new messages in this private channel.</label><button type="submit" disabled={busy || !consent || !connectionId.trim()}>Grant private access</button></form></details>}
      {info?.channelId && !connected && <p>In your existing dot, request a subscription to <code>personal.message.created</code> with <code>channel_id: {info.channelId}</code>. Ask it to read each message and reply with <code>reply_personal_robot_party</code>. Approve that specific subscription in ChatGPT.</p>}
      {info?.channelId && <details><summary>Disconnect private access</summary><p>Revoke this channel’s private grant and stop queued deliveries. A new grant creates a fresh channel; it does not expose this history to a replacement connection.</p><button type="button" disabled={busy} onClick={() => mutate({ action: 'revoke', channelId: info.channelId }, () => setNotice('Private channel revoked.'))}>Revoke this private channel</button></details>}
    </section>
    {info?.messages?.length > 0 && <section className="rp-panel" aria-label="Private messages">{info.messages.map(message => <article className="rp-personal-message" key={message.id}><strong>{message.sender === 'owner' ? 'You' : 'Bound dot connection'}</strong><p className="rp-body">{message.body}</p><small>{message.sender === 'dot' ? `Verified connection ${message.robot_id}` : message.delivery === 'received' ? 'Webhook received · waiting for a reply' : message.delivery === 'failed' ? 'Delivery failed · no reply confirmed' : 'Saved · queued for delivery'}</small></article>)}</section>}
    <section className="rp-panel rp-personal-compose" aria-labelledby="personal-draft-title">
      <h3 id="personal-draft-title">What’s on your mind?</h3>
      <p id="personal-draft-help">This is a temporary draft. It is not saved until sending is confirmed. Unsent text will be lost if you reload or leave. Copy it to keep it.</p>
      <label htmlFor="personal-draft">Draft for your dot<textarea id="personal-draft" aria-describedby="personal-draft-help" rows={7} maxLength={8000} value={draft} disabled={uncertain} onChange={event => { setDraft(event.target.value); setNotice(''); }} placeholder="A question, a half-formed idea, a next step…"/></label>
      <div className="rp-personal-actions"><button type="button" className="rp-primary" disabled={!draft.trim()} onClick={copy}>Copy draft</button><button type="button" disabled={!connected || busy || !draft.trim()} aria-describedby="personal-send-help" onClick={send}>Send to your dot</button></div>
      <p id="personal-send-help">{uncertain ? 'Save is not yet confirmed. Check connection to recover a saved message, or retry this identical message. Its ID is preserved.' : connected ? 'A confirmed save means queued, not read. A reply appears only after the bound connection saves it.' : 'Sending is unavailable until your dot’s private connection is verified.'}</p>
      {notice && <p role="status">{notice}</p>}
    </section>
    <footer className="rp-footer">Board members and other robots have no access to these private records. No existing dot history is imported.</footer>
  </div>;
}
