'use client';

import { useEffect, useRef, useState } from 'react';
import { startTvHistory, subscribeTvHistory, navigateTv, backTv, exitTvHistory, openTvOverlay, TV_VIEWS } from './tv/history';
import { attachRemoteNavigation } from './tv/remote-navigation';
import './tv/remote-navigation.css';
import TvCalendar from './tv/calendar';
import TvCommandBox from './tv/command-box';
import PagedText from './tv/paged-text';
import TldrTicker from './tldr/ticker';
import { dayInZone, emptyScreen, KINDS, moveCard, validateScreen } from './model.js';
import './screen.css';
import './tv/viewport.css';
import './tv/news.css';

function safeLink(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export default function MorningFeed({ workspaceOwner, permission = 'owner', tv = false, ownerLoginEnabled = false, onDisconnect, onTvExpired }) {
  const [screen, setScreen] = useState(null);
  const [revision, setRevision] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tvView, setTvView] = useState('home');
  const [display, setDisplay] = useState(tv);
  const [now, setNow] = useState(null);
  const [active, setActive] = useState(null);
  const [notice, setNotice] = useState('');
  const [removed, setRemoved] = useState(null);
  const root = useRef(null);
  const busy = useRef(false);
  const launchButton = useRef(null), wasDisplay = useRef(false);
  const [feedPanel, setFeedPanel] = useState('morning');
  const endpoint = tv ? '/api/tv' : `/api/admin/apps/morning-feed${workspaceOwner ? `?owner=${encodeURIComponent(workspaceOwner)}` : ''}`;
  const canEdit = !tv && permission !== 'viewer';
  useEffect(() => {
    if (!tv && wasDisplay.current && !display) launchButton.current?.focus();
    wasDisplay.current = display;
  }, [display, tv]);
  useEffect(() => {
    if (tv || !window.location) return;
    const restore = () => { if (TV_VIEWS.includes(new URL(window.location.href).searchParams.get('view'))) setDisplay(true); };
    restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore);
  }, [tv]);
  useEffect(() => {
    if (!display) return;
    const stop = !tv ? startTvHistory(window) : () => {};
    const unsubscribe = subscribeTvHistory(window, location => { if (location) setTvView(location.view); });
    return () => { unsubscribe(); stop(); };
  }, [display, tv]);
  function navigate(value) { if (!navigateTv(window, value)) setTvView(value); }
  function goBack() { if (!backTv(window)) navigate('home'); }

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
      setScreen(value); setActive(value.cards.find(card => card.enabled)?.id ?? null); setRevision(data.updatedAt); setDirty(false); setPhase('ready'); setNotice(''); setRemoved(null);
    } catch { if (signal?.aborted) return; setPhase('error'); setError('Could not load your morning. Check your connection or sign in again, then retry.'); }
  }
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [endpoint]); // Each owner context loads independently.
  useEffect(() => {
    setNow(new Date());
    // The clock shows minutes; keep daily completions current without rerendering every second.
    const timer = setInterval(() => setNow(new Date()), 30000);
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
    if (!display || tv) return;
    function key(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      // Spatial navigation owns arrows and Tab. Only Home yields Escape to exit.
      if (event.key === 'Escape' && tvView === 'home') { event.preventDefault(); exitDisplay(); }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [display, tv, tvView]);

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
      const surface = tv ? root.current?.parentElement : root.current;
      // Paired dialogs are siblings of the feed, so keep the entire TV controller in fullscreen.
      if (!document.fullscreenElement && surface?.requestFullscreen) await surface.requestFullscreen();
      else setNotice('Use your browser’s full-screen control for an edge-to-edge view.');
    } catch { setNotice('Full screen is unavailable here. TV mode is still active.'); }
  }
  async function exitDisplay() {
    exitTvHistory(window); setDisplay(false);
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* The display still exits if the browser denies fullscreen changes. */ }
  }

  if (['loading', 'expired', 'error'].includes(phase)) return <section ref={root} className={`morning${display ? ' morning-display tv-state' : ''}`} data-tv-surface={display ? true : undefined} aria-label={display ? 'Bart TV' : 'Morning signal'} aria-busy={phase === 'loading'} tabIndex={display ? -1 : undefined}>
    {display && <div className="tv-state-brand"><img src="/tv/icon.svg" alt="" width="48" height="48"/> BART TV</div>}
    <div className="tv-state-copy"><p className="tv-panel-kicker">{phase === 'loading' ? 'YOUR SIGNAL IS ON ITS WAY' : phase === 'expired' ? 'CONNECTION ENDED' : 'LET’S RECONNECT'}</p>
      <h2>{phase === 'loading' ? 'Tuning in to your morning…' : phase === 'expired' ? 'This TV connection ended.' : 'Your morning will be here.'}</h2>
      {phase === 'loading' ? <p role="status">Loading your saved screen.</p> : phase === 'expired' ? <a href="/tv">Connect the TV again</a> : <><p role="alert">{error}</p><button onClick={() => load()}>Retry loading</button></>}
    </div>
  </section>;
  let timezone = screen.timezone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch { timezone = 'UTC'; }
  const today = now ? dayInZone(now, timezone) : '';
  const rituals = visible.filter(card => card.kind === 'ritual');
  const done = rituals.filter(card => card.completedOn === today).length;
  const featured = visible.find(card => card.id === active) || visible[0];
  const activeIndex = Math.max(0, visible.indexOf(featured));
  const clock = now ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(now) : '—';
  const date = now ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' }).format(now) : 'Your morning, on your time';

  const hour = now ? Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).format(now)) : 8;
  const greeting = hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.';
  const channels = [
    ['news', '01', 'News', 'A wider perspective.', 'TLDR · five editions'],
    ['briefing', '02', 'Briefing', 'A little intention.', `${visible.length} ${visible.length === 1 ? 'card' : 'cards'} ready · your pace`],
    ['calendar', '03', 'Calendar', 'Space for what’s next.', tv || permission !== 'owner' ? 'Owner sign-in required' : 'Your personal agenda'],
    ['commands', '04', 'Your dot', 'An idea into action.', tv ? 'Owner sign-in required' : 'Your private command queue'],
  ];

  return <section ref={root} className={`morning${display ? ' morning-display' : ''}${display && (!visible.length || tvView !== 'briefing') ? ' morning-ticker-only' : ''}`} data-tv-view={display ? tvView : undefined} data-tv-surface={display ? true : undefined} aria-label={display ? 'Bart TV' : 'Morning signal'} role={display ? 'dialog' : undefined} aria-modal={display ? true : undefined} tabIndex={display ? -1 : undefined}>
    <header className="morning-top"><span className="morning-brand">{display ? <img src="/tv/icon.svg" alt="" width="40" height="40"/> : <span aria-hidden="true">✳</span>} {display ? 'Bart TV' : screen.title}</span>
      {display ? <div className="tv-masthead-time"><span>{date}</span><time>{clock}</time></div> : <span className="morning-tag">YOUR OWN FREQUENCY</span>}
      <div className="morning-actions">{display ? <><button onClick={fullscreen}>Full screen</button><button onClick={tv ? onDisconnect : exitDisplay}>{tv ? 'Disconnect TV' : 'Exit TV mode'}</button></> : <><button ref={launchButton} disabled={saving || dirty} title={dirty ? 'Save your changes before opening TV mode.' : undefined} onClick={() => { setActive(visible[0]?.id ?? null); setDisplay(true); setEditing(false); setError(''); }}>TV mode ↗</button>{canEdit && <button disabled={saving} onClick={() => { setEditing(!editing); setFeedPanel('morning'); }}>{editing ? 'Preview feed' : 'Edit morning'}</button>}</>}</div>
    </header>
    {display && <nav className="morning-tv-nav" aria-label="TV sections"><div>{[['home','Home'],['news','News'],['briefing','Briefing'],['calendar','Calendar'],['commands','Commands']].map(([value,label]) => <button key={value} data-tv-initial={tvView !== 'home' && tvView === value ? true : undefined} aria-current={tvView === value ? 'page' : undefined} aria-pressed={tvView === value} onClick={() => navigate(value)}>{label}</button>)}</div>{tvView !== 'home' && <button data-tv-back onClick={goBack}>← Back</button>}</nav>}
    {display && tvView === 'home' && <section className="tv-home" aria-label="TV home">
      <div className="tv-home-intro"><p className="tv-panel-kicker">{greeting}</p><h2 className="tv-home-clock">{clock}</h2><p className="tv-home-zone">{timezone.replaceAll('_', ' ')}</p>
        <div className="tv-home-intention"><p className="tv-panel-kicker">TODAY’S INTENTION</p><div><PagedText text={screen.focus || 'Make room for a good day. Choose a screen to begin.'} label="Intention"/></div></div>
        <div className="tv-home-momentum"><span><strong>{done}<small> / {rituals.length}</small></strong> rituals complete</span><span><strong>{rituals.reduce((total, card) => total + card.minutes, 0)}<small> min</small></strong> planned today</span></div>
      </div>
      <div className="tv-home-grid">{channels.map(([value,number,title,copy,meta]) => <button key={value} className={`tv-channel tv-channel-${value}`} data-tv-initial={value === 'news' ? true : undefined} onClick={() => navigate(value)}><span className="tv-channel-top"><small>{number}</small><TvGlyph kind={value}/><span aria-hidden="true">↗</span></span><strong>{title}</strong><p>{copy}</p><span className="tv-channel-meta">{meta}</span></button>)}</div>
    </section>}
    {display && tvView === 'briefing' && !visible.length && <section className="tv-panel tv-briefing-empty"><TvGlyph kind="briefing"/><p className="tv-panel-kicker">YOUR MORNING BRIEFING</p><h2>A little room for intention.</h2><p>{screen.cards.length ? 'Your saved cards are switched off. Enable cards in Edit morning on your phone or computer.' : 'No briefing cards saved. Add cards in Edit morning on your phone or computer.'} They’ll appear here after the next refresh.</p><button onClick={() => navigate('news')}>Explore News →</button></section>}
    {display && tvView === 'calendar' && <TvCalendar locked={tv || permission !== 'owner'} ownerLoginEnabled={tv && ownerLoginEnabled}/>}
    {display && tvView === 'commands' && <TvCommandBox paired={tv} ownerLoginEnabled={ownerLoginEnabled}/>}
    <div className="morning-hero"><div><p className="morning-kicker">{date}</p><h2>{display ? <>Make room for<br/><em>a good morning.</em></> : <>A little intention.<br/><em>A lot of possibility.</em></>}</h2><p className="morning-subtitle">A little intention. A little momentum. All your morning in one place.</p></div><div className="morning-clock"><strong>{clock}</strong><span>{timezone.replaceAll('_', ' ')}</span></div></div>
    <div className="morning-status" hidden={display && !error && !notice} aria-live="polite">{error ? <p role="alert">{error}</p> : notice ? <p>{notice}</p> : <p>{dirty ? 'Unsaved changes · save before opening TV mode' : revision ? 'Saved morning' : 'Your screen is ready to build'}</p>}{!display && canEdit && <button className="morning-primary" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : error && dirty ? 'Retry save' : 'Save morning'}</button>}</div>
    {!display && <nav className="morning-workspace-nav" aria-label="Morning views"><button aria-pressed={feedPanel === 'morning'} onClick={() => setFeedPanel('morning')}>My morning</button><button aria-pressed={feedPanel === 'news'} onClick={() => setFeedPanel('news')}>News &amp; ideas</button><span>{visible.length} cards · {done}/{rituals.length} rituals complete</span></nav>}
    <div className="morning-news-panel" hidden={display ? tvView !== 'news' : feedPanel !== 'news'}><TldrTicker key={endpoint} cardStories={visible} endpoint={endpoint} progressEndpoint={tv ? '/api/tv/news-progress' : permission === 'owner' ? '/api/admin/news-progress' : null} display={display} visible={display ? tvView === 'news' : feedPanel === 'news'} onExpired={tv ? onTvExpired : undefined}/></div>
    {editing && !display && canEdit && feedPanel === 'morning' && <fieldset className="morning-editor" disabled={saving}>
      <legend>Your morning, your rules</legend><div className="morning-settings">
        <label>Screen name<input maxLength={80} value={screen.title} onChange={event => change({ ...screen, title: event.target.value })}/></label>
        <label>Time zone<input maxLength={80} value={screen.timezone} onChange={event => change({ ...screen, timezone: event.target.value })}/></label>
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
    {!display && <div className="morning-summary" hidden={feedPanel !== 'morning'}><article className="morning-focus"><p className="morning-kicker">THE INTENTION</p><h3>{screen.focus || 'Start with what matters.'}</h3>{!screen.focus && <p>Add a morning intention in Edit morning.</p>}</article><article className="morning-progress"><p className="morning-kicker">BUILD YOUR MOMENTUM</p><strong>{done}<span> / {rituals.length}</span></strong><p>rituals complete today · {rituals.reduce((total, card) => total + card.minutes, 0)} minutes planned</p><progress value={done} max={Math.max(1, rituals.length)} aria-label="Today's ritual progress"/></article></div>}
    {display && tvView === 'briefing' && featured && <section className="morning-feature" aria-label="Saved briefing">
      <div className="tv-briefing-meta"><p className="morning-kicker">ON AIR · {featured.kind}{featured.minutes > 0 && ` · ${featured.minutes} MIN`}</p><span>{String(activeIndex + 1).padStart(2, '0')} <small>/ {String(visible.length).padStart(2, '0')}</small></span></div>
      <h3>{featured.title}</h3><div className="morning-feature-body"><PagedText key={featured.id} text={featured.body || 'Take a breath. Give this moment your attention.'} label="Briefing"/></div>
      <div className="tv-briefing-bottom"><span>{featured.kind === 'ritual' && featured.completedOn === today ? '✓ Completed today' : 'Stay a while. This screen moves at your pace.'}</span><div className="morning-slide-controls">{safeLink(featured.url) && <button onClick={event => { event?.currentTarget?.focus({preventScroll:true}); openTvOverlay(window, 'article', { kind:'card', cardId:featured.id }); }}>Open link ↗</button>}<button disabled={visible.length < 2} aria-label="Previous card" onClick={() => setActive(visible[(activeIndex - 1 + visible.length) % visible.length].id)}>← Previous</button><button disabled={visible.length < 2} aria-label="Next card" onClick={() => setActive(visible[(activeIndex + 1) % visible.length].id)}>Next card →</button></div></div>
    </section>}
    {!display && <>
      <div className="morning-section-head" hidden={!display && feedPanel !== 'morning'}><h3>Your morning lineup</h3><span>{visible.length} cards · in your order</span></div>
      {!visible.length ? <div className="morning-empty" hidden={!display && feedPanel !== 'morning'}><span aria-hidden="true">↗</span><h3>{screen.cards.length ? 'Your lineup is taking a breather.' : 'Big plans start with a small ritual.'}</h3><p>{screen.cards.length ? 'Enable a card in the editor to bring it back on screen.' : 'Build a feed of routines, personal briefings and links. Make it as simple or as wonderfully elaborate as you like.'}</p>{canEdit && <button disabled={saving} onClick={() => { if (!screen.cards.length) addCard(); else setEditing(true); }}>{screen.cards.length ? 'Edit cards' : 'Build your morning'}</button>}</div> : <div className="morning-grid" hidden={!display && feedPanel !== 'morning'}>{visible.map((card, index) => <article className={`morning-card morning-kind-${card.kind}`} key={card.id}><div className="morning-card-meta"><span>{String(index + 1).padStart(2, '0')} / {card.kind.toUpperCase()}</span><span>{card.minutes ? `${card.minutes} MIN` : 'AT YOUR PACE'}</span></div><h3>{card.title}</h3><p>{card.body || 'Your next small step.'}</p><div className="morning-card-footer">{safeLink(card.url) && <a href={safeLink(card.url)} target="_blank" rel="noopener noreferrer">Open link ↗</a>}{card.kind === 'ritual' && <button disabled={saving || !canEdit || !today} aria-pressed={card.completedOn === today} onClick={() => updateCard(card.id, { completedOn: card.completedOn === today ? '' : today })}>{card.completedOn === today ? '✓ Done today' : 'Mark complete'}</button>}</div></article>)}</div>}
    </>}
    {!display && <details className="morning-tv-help"><summary>Take your morning to the big screen</summary><p><a href="/tv">Connect a TV with QR code</a> · <a href="/auth/tv">Manage connected TVs</a></p><p>Save your morning, then open bartconsedine.com/tv in a compatible TV browser. Scan the QR code and approve it on your phone. You can also mirror this browser from a connected device. Support depends on your TV and streaming device.</p><p>Briefing cards stay selected until you choose another card. TV mode checks for saved changes every 30 seconds. Edit and save on another signed-in device to update the screen. Use arrow keys and OK to navigate. Back returns through sections; Escape exits TV mode from Home. Full screen is optional.</p><p>Briefings and links are curated by you. TLDR stories come from public archives and advance when you choose. Calendar uses your existing Calendar companion connection in an owner browser session. Paired TVs need owner sign-in for Calendar and private commands.</p>{dirty && <button onClick={() => { if (window.confirm('Discard unsaved edits and load the saved morning?')) load(); }}>Discard edits and reload</button>}</details>}
    <footer className="morning-footer">{display ? <><span><kbd>↑ ↓ ← →</kbd> Move <kbd>OK</kbd> Select <kbd>Back</kbd> Return</span><span>{tv ? 'Paired display' : 'Private workspace'} · advances at your pace</span></> : <><span>LESS SCROLL. MORE SIGNAL.</span><span>MADE FOR YOUR MORNING, BUILT TO GROW.</span></>}</footer>
  </section>;
}

function TvGlyph({ kind }) {
  const paths = { news: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h4', briefing: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M5.6 5.6l2.8 2.8 M15.6 15.6l2.8 2.8 M5.6 18.4l2.8-2.8 M15.6 8.4l2.8-2.8', calendar: 'M5 6h14v14H5z M5 10h14 M8 3v5 M16 3v5 M8 14h2 M14 14h2', commands: 'M4 7l5 5-5 5 M12 17h8' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
