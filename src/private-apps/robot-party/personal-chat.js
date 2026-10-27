'use client';
import { useEffect, useRef, useState } from 'react';
import './party.css';
import './personal.css';

export default function PersonalChat() {
  const [status, setStatus] = useState('loading');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  async function refresh() {
    const current = ++sequence.current;
    setStatus('loading');
    try {
      const response = await fetch('/api/admin/robot-party/personal', { cache: 'no-store' });
      const result = await response.json();
      if (current !== sequence.current) return;
      // A status response cannot enable sending: this build has no transport.
      setStatus(response.ok && result.state === 'disconnected' && result.canSend === false ? 'disconnected' : 'unavailable');
    } catch { if (current === sequence.current) setStatus('unavailable'); }
  }
  useEffect(() => { refresh(); return () => { sequence.current++; }; }, []);
  async function copy() {
    setNotice('');
    try { await navigator.clipboard.writeText(draft); setNotice('Draft copied. Paste it into your existing dot conversation in ChatGPT.'); }
    catch { setNotice('Clipboard unavailable. Select and copy the draft below.'); }
  }
  return <div className="rp rp-personal">
    <section className="rp-personal-heading"><div><p className="rp-eyebrow">JUST YOU + YOUR DOT</p><h2>A quieter corner.</h2><p>Keep a thought ready for your dot.</p></div><span className="rp-private">PERSONAL · OWNER ONLY</span></section>
    <section className="rp-panel rp-connection" aria-label="Dot connection">
      <p className="rp-type">Connection status</p>
      <h3 role="status">{status === 'loading' ? 'Checking connection…' : status === 'disconnected' ? 'Your dot is not connected here yet' : 'Connection status unavailable'}</h3>
      <p>{status === 'unavailable' ? 'We could not verify the connection status. Your draft remains on this page.' : 'Private delivery to your existing dot still needs to be set up and verified.'}</p>
      <p>No messages are queued or sent from this page. Your shared board connection does not enable personal chat.</p>
      <button type="button" disabled={status === 'loading'} onClick={refresh}>Check connection</button>
    </section>
    <section className="rp-panel rp-personal-compose" aria-labelledby="personal-draft-title">
      <h3 id="personal-draft-title">What’s on your mind?</h3>
      <p id="personal-draft-help">This is a temporary draft. It is not saved and will be lost if you reload or leave. Copy it to keep it.</p>
      <label htmlFor="personal-draft">Draft for your dot<textarea id="personal-draft" aria-describedby="personal-draft-help" rows={7} maxLength={8000} value={draft} onChange={event => { setDraft(event.target.value); setNotice(''); }} placeholder="A question, a half-formed idea, a next step…"/></label>
      <div className="rp-personal-actions"><button type="button" className="rp-primary" disabled={!draft.trim()} onClick={copy}>Copy draft</button><button type="button" disabled aria-describedby="personal-send-help">Send to your dot</button></div>
      <p id="personal-send-help">Sending is unavailable until your dot’s private connection is verified.</p>
      {notice && <p role="status">{notice}</p>}
    </section>
    <footer className="rp-footer">Board members and board robots have no access to this personal screen. No private history is imported.</footer>
  </div>;
}
