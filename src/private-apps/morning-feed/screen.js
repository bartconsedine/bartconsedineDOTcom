'use client';

import { useEffect, useRef, useState } from 'react';
import { attachRemoteNavigation } from './tv/remote-navigation';
import './tv/remote-navigation.css';
import TldrTicker from './tldr/ticker';
import { dayInZone, emptyScreen, KINDS, moveCard, validateScreen } from './model.js';
import './screen.css';

function safeLink(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export default function MorningFeed({ workspaceOwner, permission = 'owner', tv = false, onDisconnect, onTvExpired }) {
  const [screen, setScreen] = useState(null);
  const [revision, setRevision] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showBriefing, setShowBriefing] = useState(true);
  const [display, setDisplay] = useState(tv);
  const [now, setNow] = useState(null);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState('');
  const [removed, setRemoved] = useState(null);
  const root = useRef(null);
  const busy = useRef(false);
  const endpoint = tv ? '/api/tv' : `/api/admin/apps/morning-feed${workspaceOwner ? `?owner=${encodeURIComponent(workspaceOwner)}` : ''}`;
  const canEdit = !tv && permission !== 'viewer';
  useEffect(() => { if (display && !tv && root.current) return attachRemoteNavigation(root.current); }, [display, phase, tv]);
  const saving = phase === 'saving';

  async function load(signal) {
    setPhase('loading'); setError('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (signal?.aborted) return;
      if (tv && data.status !== 'connected') { setScreen(null); setPhase('expired'); onTvExpired?.(); return; }
      const value = data.screen === null ? emptyScreen() : validateScreen(data.screen);
      setScreen(value); setRevision(data.updatedAt); setDirty(false); setPhase('ready'); setNotice(''); setRemoved(null);
    } catch { if (signal?.aborted) return; setPhase('error'); setError('Could not load your morning. Check your connection or sign in again, then retry.'); }
  }
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [endpoint]); // Each owner context loads independently.
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!display) return;
    let disposed = false, controller;
    const refresh = async () => {
      if (busy.current) return;
      busy.current = true; controller = new AbortController();
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (tv && data.status !== 'connected') { if (!disposed) { setScreen(null); setPhase('expired'); onTvExpired?.(); } return; }
        const value = data.screen === null ? emptyScreen() : validateScreen(data.screen);
        if (!disposed) { setScreen(value); setRevision(data.updatedAt); setError(''); setNotice(''); }
      } catch { if (!disposed) setError('Display is offline or your session expired. Showing the last loaded screen; retrying every 30 seconds.'); }
      finally { busy.current = false; }
    };
    const timer = setInterval(refresh, 30000);
    return () => { disposed = true; clearInterval(timer); controller?.abort(); };
  }, [display, endpoint]);
  const visible = screen?.cards.filter(card => card.enabled) ?? [];
  useEffect(() => {
    if (!display || !visible.length) return;
    const timer = setInterval(() => setActive(index => (index + 1) % visible.length), screen.rotationSeconds * 1000);
    return () => clearInterval(timer);
  }, [display, visible.length, screen?.rotationSeconds]);
  useEffect(() => {
    if (!display) return;
    root.current?.focus();
    function key(event) {
      if (event.defaultPrevented) return;
      if (event.key === 'Tab') {
        const controls = root.current?.querySelectorAll('button:not(:disabled), a[href]');
        if (controls?.length) {
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus(); }
        }
      }
      if (event.key === 'Escape' && !tv) setDisplay(false);
      if (event.key === 'ArrowRight') { event.preventDefault(); setActive(index => (index + 1) % Math.max(1, visible.length)); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setActive(index => (index - 1 + Math.max(1, visible.length)) % Math.max(1, visible.length)); }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [display, visible.length]);

  function change(next) { setScreen(next); setDirty(true); setNotice(''); setError(''); }
  function updateCard(id, patch) { change({ ...screen, cards: screen.cards.map(card => card.id === id ? { ...card, ...patch } : card) }); }
  async function save() {
    if (busy.current || !canEdit) return;
    try { validateScreen(screen); } catch (failure) { setError(failure.message); return; }
    busy.current = true; setPhase('saving'); setError(''); setNotice('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screen, expectedAt: revision }) });
      const data = await response.json();
      if (!response.ok || !data.saved || !data.updatedAt) throw new Error([400, 409, 413, 415].includes(response.status) ? data.error : 'Save failed. Your edits are still here. Check your connection and retry.');
      setRevision(data.updatedAt); setDirty(false); setNotice('Saved to your private workspace.'); setRemoved(null);
    } catch (failure) { setError(failure.message || 'Save failed. Your edits are still here. Retry saving.'); }
    finally { busy.current = false; setPhase('ready'); }
  }
  function addCard() {
    change({ ...screen, cards: [...screen.cards, { id: crypto.randomUUID(), kind: 'ritual', title: 'New ritual', body: '', minutes: 5, url: '', enabled: true, completedOn: '' }] }); setEditing(true);
  }
  async function fullscreen() {
    try {
      if (!document.fullscreenElement && root.current?.requestFullscreen) await root.current.requestFullscreen();
      else setNotice('Use your browser’s full-screen control for an edge-to-edge view.');
    } catch { setNotice('Full screen is unavailable here. TV mode is still active.'); }
  }
  async function exitDisplay() {
    setDisplay(false);
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* The display still exits if the browser denies fullscreen changes. */ }
  }

  if (phase === 'loading') return <section className="morning" aria-busy="true"><p role="status">Tuning in to your morning…</p></section>;
  if (phase === 'expired') return <section className="morning"><p role="status">This TV connection ended.</p><a href="/tv">Connect the TV again</a></section>;
  if (phase === 'error') return <section className="morning"><p role="alert">{error}</p><button onClick={() => load()}>Retry loading</button></section>;
  let timezone = screen.timezone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { timezone = 'UTC'; }
  const today = now ? dayInZone(now, timezone) : '';
  const rituals = visible.filter(card => card.kind === 'ritual');
  const done = rituals.filter(card => card.completedOn === today).length;
  const featured = visible[active % Math.max(1, visible.length)];
  const clock = now ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(now) : '—';
  const date = now ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' }).format(now) : 'Your morning, on your time';

  return <section ref={root} className={`morning${display ? ' morning-display' : ''}${display && (!visible.length || !showBriefing) ? ' morning-ticker-only' : ''}`} aria-label="Morning signal" role={display ? 'dialog' : undefined} aria-modal={display ? true : undefined} tabIndex={display ? -1 : undefined}>
    <header className="morning-top"><span className="morning-brand"><span aria-hidden="true">✳</span> {screen.title}</span><span className="morning-tag">YOUR OWN FREQUENCY</span><div className="morning-actions">
      {display ? <><button onClick={fullscreen}>Full screen</button><button aria-pressed={showBriefing} onClick={() => setShowBriefing(!showBriefing)}>{showBriefing ? 'Hide morning briefing' : 'Show morning briefing'}</button><button onClick={tv ? onDisconnect : exitDisplay}>{tv ? 'Disconnect TV' : 'Exit TV mode'}</button></> : <><button disabled={saving || dirty} title={dirty ? 'Save your changes before opening TV mode.' : undefined} onClick={() => { setActive(0); setDisplay(true); setEditing(false); setError(''); }}>TV mode ↗</button>{canEdit && <button disabled={saving} onClick={() => setEditing(!editing)}>{editing ? 'Preview feed' : 'Edit morning'}</button>}</>}
    </div></header>
    <div className="morning-hero"><div><p className="morning-kicker">{date}</p><h2>Make room for<br/><em>a good morning.</em></h2><p className="morning-subtitle">A little intention. A little momentum. All your morning in one place.</p></div><div className="morning-clock"><strong>{clock}</strong><span>{timezone.replaceAll('_', ' ')}</span></div></div>
    <div className="morning-status" aria-live="polite">{error ? <p role="alert">{error}</p> : notice ? <p>{notice}</p> : <p>{dirty ? 'Unsaved changes · save before opening TV mode' : revision ? 'Saved morning' : 'Your screen is ready to build'}</p>}{!display && canEdit && <button className="morning-primary" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : error && dirty ? 'Retry save' : 'Save morning'}</button>}</div>
    <TldrTicker key={endpoint} endpoint={endpoint} display={display} onExpired={tv ? onTvExpired : undefined}/>
    {editing && !display && canEdit && <fieldset className="morning-editor" disabled={saving}>
      <legend>Your morning, your rules</legend><div className="morning-settings">
        <label>Screen name<input maxLength={80} value={screen.title} onChange={event => change({ ...screen, title: event.target.value })}/></label>
        <label>Time zone<input maxLength={80} value={screen.timezone} onChange={event => change({ ...screen, timezone: event.target.value })}/></label>
        <label>Seconds per slide<input type="number" min="10" max="300" value={screen.rotationSeconds} onChange={event => change({ ...screen, rotationSeconds: Number(event.target.value) })}/></label>
      </div><label>Morning intention<textarea maxLength={400} value={screen.focus} placeholder="What deserves your attention?" onChange={event => change({ ...screen, focus: event.target.value })}/></label>
      {screen.cards.map((card, index) => <div className="morning-card-editor" key={card.id}>
        <div className="morning-card-controls"><strong>Card {String(index + 1).padStart(2, '0')}</strong><button disabled={index === 0} aria-label={`Move ${card.title} up`} onClick={() => change({ ...screen, cards: moveCard(screen.cards, card.id, -1) })}>↑</button><button disabled={index === screen.cards.length - 1} aria-label={`Move ${card.title} down`} onClick={() => change({ ...screen, cards: moveCard(screen.cards, card.id, 1) })}>↓</button><button onClick={() => { setRemoved({ card, index }); change({ ...screen, cards: screen.cards.filter(item => item.id !== card.id) }); }}>Remove</button></div>
        <div className="morning-settings"><label>Card title<input aria-label={`Card ${index + 1} title`} value={card.title} maxLength={100} onChange={event => updateCard(card.id, { title: event.target.value })}/></label><label>Type<select value={card.kind} onChange={event => updateCard(card.id, { kind: event.target.value })}>{KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label><label>Minutes<input type="number" min="0" max="180" value={card.minutes} onChange={event => updateCard(card.id, { minutes: Number(event.target.value) })}/></label></div>
        <label>Details<textarea value={card.body} maxLength={1600} onChange={event => updateCard(card.id, { body: event.target.value })}/></label>
        <label>Link (optional except for link cards)<input type="url" placeholder="https://…" maxLength={1000} value={card.url} onChange={event => updateCard(card.id, { url: event.target.value })}/></label>
        <label className="morning-check"><input type="checkbox" checked={card.enabled} onChange={event => updateCard(card.id, { enabled: event.target.checked })}/>Show on my screen</label>
      </div>)}
      {removed && <button onClick={() => { const cards = [...screen.cards]; cards.splice(Math.min(removed.index, cards.length), 0, removed.card); change({ ...screen, cards }); setRemoved(null); }}>Undo removal</button>}
      <button disabled={screen.cards.length >= 24} onClick={addCard}>+ Add card</button>
    </fieldset>}
    <div className="morning-summary"><article className="morning-focus"><p className="morning-kicker">THE INTENTION</p><h3>{screen.focus || 'Start with what matters.'}</h3>{!screen.focus && <p>Add a morning intention in Edit morning.</p>}</article><article className="morning-progress"><p className="morning-kicker">BUILD YOUR MOMENTUM</p><strong>{done}<span> / {rituals.length}</span></strong><p>rituals complete today · {rituals.reduce((total, card) => total + card.minutes, 0)} minutes planned</p><progress value={done} max={Math.max(1, rituals.length)} aria-label="Today's ritual progress"/></article></div>
    {display && featured ? <div className="morning-feature"><p className="morning-kicker">ON AIR · {featured.kind} {featured.minutes > 0 && `· ${featured.minutes} MIN`}</p><h3>{featured.title}</h3><p className="morning-feature-body">{featured.body || 'Take a breath. Give this moment your attention.'}</p>{safeLink(featured.url) && <a href={safeLink(featured.url)} target="_blank" rel="noopener noreferrer">Open link ↗</a>}<div className="morning-slide-controls"><button aria-label="Previous card" onClick={() => setActive(index => (index - 1 + visible.length) % visible.length)}>←</button><span>{(active % visible.length) + 1} / {visible.length}</span><button aria-label="Next card" onClick={() => setActive(index => (index + 1) % visible.length)}>→</button></div></div> : <>
      <div className="morning-section-head"><h3>Your morning lineup</h3><span>{visible.length} cards · in your order</span></div>
      {!visible.length ? <div className="morning-empty"><span aria-hidden="true">↗</span><h3>{screen.cards.length ? 'Your lineup is taking a breather.' : 'Big plans start with a small ritual.'}</h3><p>{screen.cards.length ? 'Enable a card in the editor to bring it back on screen.' : 'Build a feed of routines, personal briefings and links. Make it as simple or as wonderfully elaborate as you like.'}</p>{canEdit && <button disabled={saving} onClick={() => { if (!screen.cards.length) addCard(); else setEditing(true); }}>{screen.cards.length ? 'Edit cards' : 'Build your morning'}</button>}</div> : <div className="morning-grid">{visible.map((card, index) => <article className={`morning-card morning-kind-${card.kind}`} key={card.id}><div className="morning-card-meta"><span>{String(index + 1).padStart(2, '0')} / {card.kind.toUpperCase()}</span><span>{card.minutes ? `${card.minutes} MIN` : 'AT YOUR PACE'}</span></div><h3>{card.title}</h3><p>{card.body || 'Your next small step.'}</p><div className="morning-card-footer">{safeLink(card.url) && <a href={safeLink(card.url)} target="_blank" rel="noopener noreferrer">Open link ↗</a>}{card.kind === 'ritual' && <button disabled={saving || !canEdit || !today} aria-pressed={card.completedOn === today} onClick={() => updateCard(card.id, { completedOn: card.completedOn === today ? '' : today })}>{card.completedOn === today ? '✓ Done today' : 'Mark complete'}</button>}</div></article>)}</div>}
    </>}
    {!display && <details className="morning-tv-help"><summary>Take your morning to the big screen</summary><p><a href="/tv">Connect a TV with QR code</a> · <a href="/auth/tv">Manage connected TVs</a></p><p>Save your morning, then open bartconsedine.com/tv in a compatible TV browser. Scan the QR code and approve it on your phone. You can also mirror this browser from a connected device. Support depends on your TV and streaming device.</p><p>TV mode rotates enabled cards and checks for saved changes every 30 seconds. Edit and save on another signed-in device to update the screen. Use arrow keys to change cards and Escape to exit. Full screen is optional.</p><p>Briefings and links are curated by you. TLDR headlines come from public archives; weather and calendar sync are not connected yet.</p>{dirty && <button onClick={() => { if (window.confirm('Discard unsaved edits and load the saved morning?')) load(); }}>Discard edits and reload</button>}</details>}
    <footer className="morning-footer"><span>LESS SCROLL. MORE SIGNAL.</span><span>{display ? 'Rotating cards · refreshes every 30 seconds' : 'MADE FOR YOUR MORNING, BUILT TO GROW.'}</span></footer>
  </section>;
}
