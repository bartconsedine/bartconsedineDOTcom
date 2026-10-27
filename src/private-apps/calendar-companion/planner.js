'use client';

import { useEffect, useRef, useState } from 'react';
import { COVERAGE, SLUG, emptyPlanner, validatePlanner, dayInZone, localInstant, addDays, reminders, suggestions, coverageWindow } from './model';
import { calendarFile } from './calendar';
import './planner.css';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shortDate = (value, zone, time = false) => new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(new Date(value));
function clock(value, zone) { return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)); }
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Field({ label, children }) { return <label className="cc-field"><span>{label}</span>{children}</label>; }

export default function CalendarCompanion() {
  const [plan, setPlan] = useState(null);
  const [revision, setRevision] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editor, setEditor] = useState(null);
  const [tab, setTab] = useState('calendar');
  const [month, setMonth] = useState('');
  const [now, setNow] = useState(null);
  const lock = useRef(false);
  async function load() {
    if (lock.current) return;
    setPhase('loading'); setError('');
    try {
      const response = await fetch(`/api/admin/apps/${SLUG}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load your calendar. Retry when your connection and sign-in are available.');
      const data = await response.json(); validatePlanner(data.plan);
      setPlan(data.plan); setRevision(data.updatedAt); setDirty(false); setEditor(null); setPhase('ready');
      setNow(Date.now()); setMonth(dayInZone(Date.now(), data.plan.settings.timeZone).slice(0, 7));
    } catch (e) { setError(e.message); setPhase('error'); }
  }
  useEffect(() => { load(); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const warn = e => { if (dirty || editor) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, editor]);
  function change(next) { if (lock.current) return; setPlan(next); setDirty(true); setError(''); }
  async function save(next = plan) {
    if (lock.current) return false;
    try { validatePlanner(next); } catch (e) { setError(e.message); return false; }
    lock.current = true; setPhase('saving'); setError(''); setPlan(next); setDirty(true);
    try {
      const response = await fetch(`/api/admin/apps/${SLUG}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: next, expectedAt: revision }) });
      const data = await response.json();
      if (!response.ok || !data.saved || !data.updatedAt) throw new Error(response.status === 409 ? 'Another tab or chat changed your calendar. Download your draft, then reload and reconcile. Your edits are still here.' : 'Save failed. Your edits are still here; retry after checking your connection and sign-in.');
      setRevision(data.updatedAt); setDirty(false); setPhase('ready'); return true;
    } catch (e) { setError(e.message); setPhase('ready'); return false; }
    finally { lock.current = false; }
  }
  if (!plan) return <section className="cc"><p role="status">{phase === 'loading' ? 'Loading your calendar…' : 'Calendar unavailable'}</p>{error && <p role="alert">{error}</p>}<button disabled={phase === 'loading'} onClick={load}>Retry load</button></section>;
  const s = plan.settings, pending = reminders(plan, now ?? Date.now()), proposals = suggestions(plan, now ?? Date.now());
  const active = plan.plans.filter(p => !p.cancelled && Date.parse(p.end) >= (now ?? 0));
  const due = pending.filter(r => r.overdue);
  function edit(p = null, suggestion = null) {
    if (editor && !window.confirm('Discard the open event form?')) return;
    const start = p?.start ?? suggestion?.start;
    setEditor({ id: p?.id ?? null, title: p?.title ?? suggestion?.title ?? '', day: start ? dayInZone(start, s.timeZone) : dayInZone(Date.now(), s.timeZone), time: start ? clock(start, s.timeZone) : s.preferredTime, endDay: p ? dayInZone(p.end, s.timeZone) : suggestion ? dayInZone(suggestion.end, s.timeZone) : '', endTime: p ? clock(p.end, s.timeZone) : suggestion ? clock(suggestion.end, s.timeZone) : '', coverage: p?.coverage ?? 'Needed', sitter: p?.sitter ?? '', notes: p?.notes ?? '', cancelled: p?.cancelled ?? false });
  }
  async function submitEvent(e) {
    e.preventDefault();
    try {
      const start = localInstant(editor.day, editor.time, s.timeZone);
      const end = editor.endTime ? localInstant(editor.endDay || editor.day, editor.endTime, s.timeZone) : start + s.durationHours * 3600000;
      const p = { id: editor.id ?? crypto.randomUUID(), title: editor.title, start: new Date(start).toISOString(), end: new Date(end).toISOString(), coverage: editor.coverage, sitter: editor.sitter, notes: editor.notes, cancelled: editor.cancelled };
      const next = { ...plan, plans: editor.id ? plan.plans.map(old => old.id === editor.id ? p : old) : [...plan.plans, p] };
      if (await save(next)) setEditor(null);
    } catch (e) { setError(e.message); }
  }
  function shiftMonth(by) {
    const d = new Date(`${month}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + by); setMonth(d.toISOString().slice(0, 7));
  }
  const first = `${month}-01`, gridStart = month ? addDays(first, -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7)) : '';
  const controlsDisabled = phase === 'saving' || phase === 'loading';
  return <section className="cc" aria-label="Calendar companion">
    <header className="cc-hero"><div><p className="cc-kicker">A LITTLE PLANNING. MORE LIVING.</p><h1>Make time together.</h1><p>Good plans need a date, a sitter, and a little follow-through.</p></div><button className="cc-primary" disabled={controlsDisabled} onClick={() => edit()}>+ Make a plan</button></header>
    <div className="cc-savebar"><p role="status">{phase === 'saving' ? 'Saving…' : dirty ? 'Unsaved changes' : revision ? `Saved ${shortDate(revision, s.timeZone, true)}` : 'Ready for your first plan'} · {s.timeZone}</p><div><button disabled={controlsDisabled || !dirty} onClick={() => save()}>Save changes</button><button disabled={controlsDisabled} onClick={() => download(JSON.stringify({ plan, eventForm: editor, expectedAt: revision }, null, 2), 'calendar-draft.json', 'application/json')}>Download draft</button></div></div>
    {error && <div className="cc-alert" role="alert"><p>{error}</p><button disabled={controlsDisabled} onClick={() => save()}>Retry save</button><button disabled={controlsDisabled} onClick={() => { if (window.confirm('Discard local edits and the open form, then reload saved data? Download your draft first if needed.')) load(); }}>Reload saved data</button></div>}
    <div className="cc-stats"><article><strong>{active.length}</strong><span>plans ahead</span></article><article><strong>{active.filter(p => p.coverage === 'Confirmed').length}</strong><span>sitters confirmed</span></article><article className={due.length ? 'cc-warm' : ''}><strong>{due.length}</strong><span>booking deadlines reached</span></article><article><strong>{proposals.length}</strong><span>open slots to fill</span></article></div>
    {editor && <form className="cc-editor" onSubmit={submitEvent}><h2>{editor.id ? 'Edit your plan' : 'Put something good on the calendar'}</h2><p>Times are in {s.timeZone}. Sitter coverage includes {s.bufferMinutes} minutes on each side.</p><fieldset disabled={controlsDisabled}><div className="cc-fields">
      <Field label="Plan"><input required maxLength={160} value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })} placeholder="Dinner, a show, an afternoon out…" /></Field>
      <Field label="Date"><input required type="date" value={editor.day} onChange={e => setEditor({ ...editor, day: e.target.value })} /></Field>
      <Field label="Start time"><input required type="time" value={editor.time} onChange={e => setEditor({ ...editor, time: e.target.value })} /></Field>
      <Field label="End date (optional)"><input type="date" value={editor.endDay} onChange={e => setEditor({ ...editor, endDay: e.target.value })} /></Field>
      <Field label={`End time (default ${s.durationHours} hours)`}><input required={!!editor.endDay} type="time" value={editor.endTime} onChange={e => setEditor({ ...editor, endTime: e.target.value })} /></Field>
      <Field label="Sitter coverage"><select value={editor.coverage} onChange={e => setEditor({ ...editor, coverage: e.target.value })}>{COVERAGE.map(v => <option key={v}>{v}</option>)}</select></Field>
      <Field label="Sitter name"><input required={editor.coverage === 'Confirmed'} maxLength={120} value={editor.sitter} onChange={e => setEditor({ ...editor, sitter: e.target.value })} /></Field>
      <Field label="Notes / booking details"><textarea maxLength={2000} value={editor.notes} onChange={e => setEditor({ ...editor, notes: e.target.value })} /></Field>
    </div><label className="cc-check"><input type="checkbox" checked={editor.cancelled} onChange={e => setEditor({ ...editor, cancelled: e.target.checked })} /> Cancelled plan</label><div className="cc-actions"><button className="cc-primary" type="submit">Save plan</button><button type="button" onClick={() => { if (window.confirm('Discard this event form?')) setEditor(null); }}>Close form</button></div></fieldset></form>}
    <nav className="cc-tabs" aria-label="Planner views">{[['calendar', 'Calendar'], ['queue', `Sitter queue (${pending.length})`], ['ideas', 'Fill our calendar'], ['settings', 'Planning rhythm']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'calendar' && <><div className="cc-sectionhead"><div><h2>{month && new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`))}</h2><p>Each plan has a separate sitter entry. Select either to edit.</p></div><div className="cc-actions"><button aria-label="Previous month" onClick={() => shiftMonth(-1)}>←</button><button onClick={() => setMonth(dayInZone(Date.now(), s.timeZone).slice(0, 7))}>Today</button><button aria-label="Next month" onClick={() => shiftMonth(1)}>→</button></div></div>
      <div className="cc-month">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span className="cc-weekday" key={d}>{d}</span>)}{gridStart && Array.from({ length: 42 }, (_, i) => {
        const day = addDays(gridStart, i), events = plan.plans.filter(p => dayInZone(p.start, s.timeZone) === day);
        return <div key={day} className={`cc-day ${day.slice(0, 7) !== month ? 'cc-other' : ''} ${day === dayInZone(now ?? Date.now(), s.timeZone) ? 'cc-today' : ''}`}><span className="cc-daynumber">{Number(day.slice(-2))}</span><span className="cc-mobiledate">{new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`))}</span>{events.map(p => <div className="cc-eventpair" key={p.id}><button disabled={controlsDisabled} className={`cc-event ${p.cancelled ? 'cc-cancelled' : ''}`} onClick={() => edit(p)}>{clock(p.start, s.timeZone)} · {p.title}{p.cancelled && ' (cancelled)'}</button><button disabled={controlsDisabled} className={`cc-coverage ${p.coverage === 'Confirmed' || p.coverage === 'Not needed' ? 'cc-covered' : ''}`} onClick={() => edit(p)}>Sitter: {p.coverage}{p.sitter ? ` · ${p.sitter}` : ''}</button></div>)}</div>;
      })}</div>{!plan.plans.length && <div className="cc-empty"><h3>Your next good night starts here.</h3><p>Add a plan, or visit “Fill our calendar” for dates with enough time to book a sitter.</p></div>}</>}
    {tab === 'queue' && <section><div className="cc-sectionhead"><div><h2>A little follow-through.</h2><p>Booking reminders stay here until coverage is confirmed or no longer needed.</p></div></div>{!pending.length && <div className="cc-empty">No sitter requests waiting. Add plans to start building your calendar.</div>}{pending.map(r => <article className={`cc-queue ${r.overdue ? 'cc-due' : ''}`} key={r.plan.id}><div><span className="cc-kicker">{r.urgent ? 'COMING UP SOON' : r.overdue ? 'BOOKING DEADLINE REACHED' : `BOOK BY ${shortDate(r.due, s.timeZone).toUpperCase()}`}</span><h3>{r.action}: {r.plan.title}</h3><p>{shortDate(r.plan.start, s.timeZone, true)} · {r.plan.coverage}{r.plan.sitter ? ` · ${r.plan.sitter}` : ''}</p><p>Coverage: {shortDate(coverageWindow(r.plan, s).start, s.timeZone, true)} – {shortDate(coverageWindow(r.plan, s).end, s.timeZone, true)}</p></div><button disabled={controlsDisabled} onClick={() => edit(r.plan)}>Update coverage</button></article>)}</section>}
    {tab === 'ideas' && <section><div className="cc-sectionhead"><div><h2>Leave room for good things.</h2><p>{s.weeklyGoal} plan{s.weeklyGoal > 1 ? 's' : ''} a week, looking {s.horizonWeeks} weeks ahead. Suggestions leave at least {s.leadDays} days to book a sitter.</p></div><button disabled={controlsDisabled || !proposals.length || !!editor} onClick={() => save({ ...plan, plans: [...plan.plans, ...proposals.map(p => ({ id: crypto.randomUUID(), title: p.title, start: p.start, end: p.end, coverage: 'Needed', sitter: '', notes: 'Planning hold. Check calendars and make reservations.', cancelled: false }))] })}>Fill open slots</button></div><p className="cc-note">Suggestions check plans saved here. Check your other calendars and venue availability before committing. “Fill open slots” saves planning holds and starts the sitter queue. These are ideas, not reservations.</p><div className="cc-proposals">{proposals.map((p, i) => <article key={p.start}><span className="cc-kicker">{shortDate(p.start, s.timeZone).toUpperCase()} · {clock(p.start, s.timeZone)}</span><h3>{p.title}</h3><p>{i === 0 ? 'A little time, just for you two.' : 'Keep the rhythm going.'}</p><button disabled={controlsDisabled} onClick={() => edit(null, p)}>Plan this evening →</button></article>)}</div>{!proposals.length && <div className="cc-empty">Your target is filled, or the booking lead time leaves no open slots in this horizon. Adjust your planning rhythm to look further ahead.</div>}<div className="cc-editor"><h3>Your idea bank</h3><p>One idea per line, up to 30. Suggestions rotate through these. Save changes when finished.</p><label className="cc-field"><span>Things we want to do</span><textarea disabled={controlsDisabled} rows={6} value={plan.ideas.join('\n')} onChange={e => change({ ...plan, ideas: e.target.value.split('\n') })} onBlur={() => change({ ...plan, ideas: plan.ideas.map(v => v.trim()).filter(Boolean) })} placeholder="A new restaurant\nA comedy show\nA long walk and dinner" /></label></div></section>}
    {tab === 'settings' && <section className="cc-editor"><h2>Find your rhythm.</h2><p>These preferences drive suggestions, booking deadlines, and the sitter coverage window. Save changes to keep them across devices.</p><fieldset disabled={controlsDisabled}><div className="cc-fields">
      <Field label="Time zone"><select value={s.timeZone} onChange={e => change({ ...plan, settings: { ...s, timeZone: e.target.value } })}>{[...new Set([s.timeZone, ...Intl.supportedValuesOf('timeZone')])].map(zone => <option key={zone}>{zone}</option>)}</select></Field>
      {[['leadDays', 'Book sitters this many days ahead', 1, 90], ['horizonWeeks', 'Weeks to plan ahead', 2, 12], ['weeklyGoal', 'Plans per week', 1, 3], ['durationHours', 'Default plan length (hours)', 1, 12], ['bufferMinutes', 'Sitter buffer before and after (minutes)', 0, 120]].map(([key, label, min, max]) => <Field key={key} label={label}><input type="number" min={min} max={max} value={s[key]} onChange={e => change({ ...plan, settings: { ...s, [key]: Number(e.target.value) } })} /></Field>)}
      <Field label="Preferred day"><select value={s.preferredDay} onChange={e => change({ ...plan, settings: { ...s, preferredDay: Number(e.target.value) } })}>{weekdays.map((d, i) => <option value={i} key={d}>{d}</option>)}</select></Field>
      <Field label="Preferred start time"><input type="time" value={s.preferredTime} onChange={e => change({ ...plan, settings: { ...s, preferredTime: e.target.value } })} /></Field>
    </div></fieldset></section>}
    <footer className="cc-export"><div><h3>Take your plans with you.</h3><p>Download separate plan and sitter events, plus daily booking reminders with display alarms for missing coverage. Import the file into a calendar that supports these features.</p><p>This is a snapshot, not live sync. Imports may ignore alarms or duplicate events. When coverage changes, remove old reminder entries and reconcile the new export. No background email or push notifications are connected.</p></div><button disabled={dirty || controlsDisabled || !!editor || !plan.plans.length} onClick={() => download(calendarFile(plan, revision), 'our-plans.ics', 'text/calendar;charset=utf-8')}>Download calendar (.ics)</button>{(dirty || editor) && <p>Save or close your edits before exporting calendar events.</p>}</footer>
    <p className="cc-note">Private to your account. Your partner’s account has its own records; household sharing is not connected.</p>
  </section>;
}
