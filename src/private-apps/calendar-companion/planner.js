'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { COVERAGE, dayInZone, localInstant, addDays, reminders, suggestions, emptyPlanner } from './model';
import { SLUG, validatePreferences } from './preferences';
import { eventKind, asPlan, busyWindow, eventsByDay } from './view-model';
import './planner.css';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dateLabel = (value, zone, time = false) => new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', ...(time ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(new Date(value));
const timeLabel = (value, zone) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
const shared = e => e.extendedProperties?.shared ?? {};
const dayOf = (e, zone) => e.start?.date ?? dayInZone(e.start.dateTime, zone);
const keyOf = e => `${e.calendarId}:${e.id}`;
function Field({ label, children }) { return <label className="cc-field"><span>{label}</span>{children}</label>; }
function download(value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'calendar-recovery-draft.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const newForm = (kind, prefs, writeCalendar) => ({ kind, calendarId: writeCalendar, eventId: null, etag: null, requestId: crypto.randomUUID(), title: '', name: '', monthDay: '01-01', day: dayInZone(Date.now(), prefs.settings.timeZone), time: prefs.settings.preferredTime, endDay: '', endTime: '', coverage: 'Needed', sitter: '', notes: '' });

export default function CalendarCompanion() {
  const [prefs, setPrefs] = useState(null);
  const [revision, setRevision] = useState(null);
  const [data, setData] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editor, setEditor] = useState(null);
  const [tab, setTab] = useState('calendar');
  const [month, setMonth] = useState('');
  const [showNudges, setShowNudges] = useState(false);
  const [now, setNow] = useState(null);
  const lock = useRef(false);
  const batchRequests = useRef({});
  async function load(nextMonth = month, keepPreferences = false) {
    setPhase('loading'); setError('');
    try {
      const response = await fetch(`/api/admin/apps/${SLUG}${nextMonth ? `?month=${encodeURIComponent(nextMonth)}` : ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load your calendar. Check your connection and workspace sign-in, then retry.');
      const result = await response.json(); validatePreferences(result.preferences);
      setData(result); setNow(Date.now());
      if (!keepPreferences) {
        setPrefs({ ...result.preferences, readCalendars: result.selected ?? result.preferences.readCalendars, writeCalendar: result.writeCalendar || '' });
        setRevision(result.updatedAt); setDirty(false);
      }
      if (!nextMonth) setMonth(dayInZone(Date.now(), result.preferences.settings.timeZone).slice(0, 7));
      if (result.error) setError(result.error);
      return result.connection === 'connected';
    } catch (e) { setError(e.message); setData(previous => previous ? { ...previous, connection: 'error' } : null); return false; }
    finally { setPhase('ready'); }
  }
  useEffect(() => { load(); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const warn = e => { if (dirty || editor) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, editor]);
  const calendarRows = useMemo(() => {
    if (!month || !prefs) return {};
    const first = `${month}-01`;
    const start = addDays(first, -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7));
    return eventsByDay(data?.events ?? [], start, prefs.settings.timeZone, showNudges);
  }, [data?.events, month, prefs?.settings.timeZone, showNudges]);
  async function post(body) {
    const response = await fetch(`/api/admin/apps/${SLUG}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let result;
    try { result = await response.json(); } catch { throw new Error('The server could not confirm this operation. Refresh before retrying; your form is preserved.'); }
    if (!response.ok) throw new Error(result.error ?? 'Operation failed. Refresh before retrying; your form is preserved.');
    return result;
  }
  async function perform(action) {
    if (lock.current) return;
    lock.current = true; setPhase('busy'); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e.message); } finally { lock.current = false; setPhase('ready'); }
  }
  const connect = () => perform(async () => {
    if ((dirty || editor) && !window.confirm('Connecting leaves this page. Download your draft first if you want to keep unsaved edits. Continue?')) return;
    const result = await post({ op: 'connect' }); window.location.assign(result.url);
  });
  if (!prefs) return <section className="cc"><h1>Calendar companion</h1><p role="status">{phase === 'loading' ? 'Loading your planning preferences…' : 'Calendar unavailable'}</p>{error && <p role="alert">{error}</p>}<button disabled={phase !== 'ready'} onClick={() => load()}>Retry load</button></section>;
  const settings = prefs.settings, zone = settings.timeZone;
  const connected = data?.connection === 'connected';
  const controlsDisabled = phase !== 'ready';
  const writeDisabled = controlsDisabled || !connected || dirty || !data?.calendars?.some(c => ['writer', 'owner'].includes(c.role));
  const events = data?.events ?? [];
  const managed = events.filter(e => e.calendarId === data?.writeCalendar && eventKind(e) === 'plan' && e.start?.dateTime && e.end?.dateTime);
  const projected = { ...emptyPlanner(), settings, ideas: prefs.ideas.filter(v => v.trim()), plans: managed.map(asPlan) };
  const queue = managed.flatMap(event => {
    const lead = Number(shared(event).ccLead);
    const eventSettings = { ...settings, leadDays: Number.isInteger(lead) && lead >= 1 && lead <= 90 ? lead : settings.leadDays };
    return reminders({ ...projected, settings: eventSettings, plans: [asPlan(event)] }, now ?? Date.now()).map(reminder => ({ ...reminder, event }));
  }).sort((a, b) => a.due - b.due);
  let proposals = [], projectionError = '';
  if (connected && !dirty) { try { proposals = suggestions(projected, now ?? Date.now(), events.map(e => busyWindow(e, zone)).filter(Boolean)); } catch (e) { projectionError = e.message; } }
  const birthdayMap = new Map();
  for (const e of events.filter(e => eventKind(e) === 'birthday' && dayOf(e, zone) >= dayInZone(now ?? Date.now(), zone))) {
    const key = `${e.calendarId}:${e.recurringEventId ?? e.id}`;
    if (!birthdayMap.has(key)) birthdayMap.set(key, e);
  }
  const birthdays = [...birthdayMap.values()];
  function change(next) { if (lock.current) return; setPrefs(next); setDirty(true); setError(''); }
  function updateForm(key, value) { setEditor(previous => ({ ...previous, [key]: value })); }
  function begin(kind, proposal) {
    if (editor && !window.confirm('Discard the open event form?')) return;
    const form = newForm(kind, prefs, prefs.writeCalendar || data?.writeCalendar || '');
    if (proposal) Object.assign(form, { title: proposal.title, day: dayInZone(proposal.start, zone), time: timeLabel(proposal.start, zone), endDay: dayInZone(proposal.end, zone), endTime: timeLabel(proposal.end, zone) });
    setEditor(form);
  }
  async function openEvent(event) {
    if (editor && !window.confirm('Discard the open event form?')) return;
    await perform(async () => {
      const props = shared(event), kind = eventKind(event);
      const id = ['sitter', 'reminder'].includes(kind) ? props.ccGroup : event.recurringEventId ?? event.id;
      const response = await fetch(`/api/admin/apps/${SLUG}?calendarId=${encodeURIComponent(event.calendarId)}&detail=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.event) throw new Error(result.error ?? 'Could not read the current Google event.');
      const current = result.event, type = eventKind(current), meta = shared(current);
      if (!['plan', 'birthday'].includes(type) || !data.calendars.some(c => c.id === event.calendarId && c.primary)) { setEditor({ external: true, event: current }); return; }
      const form = newForm(type, prefs, current.calendarId);
      Object.assign(form, { eventId: current.id, etag: current.etag, title: current.summary ?? '', notes: current.description ?? '', name: meta.ccPerson ?? '', monthDay: meta.ccMonthDay ?? current.start.date?.slice(5) ?? '01-01', series: !!current.recurrence });
      if (type === 'plan') Object.assign(form, { day: dayInZone(current.start.dateTime, zone), time: timeLabel(current.start.dateTime, zone), endDay: dayInZone(current.end.dateTime, zone), endTime: timeLabel(current.end.dateTime, zone), coverage: meta.ccCoverage ?? 'Needed', sitter: meta.ccSitter ?? '' });
      setEditor(form);
    });
  }
  function changeFor(form) {
    const start = form.kind === 'plan' ? localInstant(form.day, form.time, zone) : null;
    const end = start === null ? null : form.endTime ? localInstant(form.endDay || form.day, form.endTime, zone) : start + settings.durationHours * 3600000;
    return { calendarId: form.calendarId, eventId: form.eventId, etag: form.etag, requestId: form.requestId, event: { kind: form.kind, title: form.title, name: form.name, monthDay: form.monthDay, start: start === null ? '' : new Date(start).toISOString(), end: end === null ? '' : new Date(end).toISOString(), coverage: form.coverage, sitter: form.sitter, notes: form.notes } };
  }
  async function submit(e) {
    e.preventDefault();
    await perform(async () => {
      const result = await post({ op: 'event', change: changeFor(editor) });
      if (!result.saved) throw new Error('Google did not confirm a save. Your form is preserved.');
      setEditor(null);
      await load(month, true);
      if (!result.supportSynced) setError(result.warning);
      else setNotice('Saved in Google Calendar.');
    });
  }
  const savePreferences = () => perform(async () => {
    validatePreferences(prefs);
    const result = await post({ op: 'preferences', value: prefs, expectedAt: revision });
    if (!result.saved) throw new Error('Preferences were not saved.');
    setRevision(result.updatedAt); setDirty(false); await load(month); setNotice('Planning preferences saved.');
  });
  const fill = () => perform(async () => {
    if (editor || !connected || dirty) return;
    let count = 0, warning = '';
    try {
      for (const p of proposals) {
        const form = newForm('plan', prefs, prefs.writeCalendar || data.writeCalendar);
        const requestKey = `${form.calendarId}:${p.start}`;
        form.requestId = batchRequests.current[requestKey] ?? (batchRequests.current[requestKey] = crypto.randomUUID());
        const change = changeFor({ ...form, title: p.title, day: dayInZone(p.start, zone), time: timeLabel(p.start, zone), endDay: dayInZone(p.end, zone), endTime: timeLabel(p.end, zone), notes: 'Planning hold. Make reservations and confirm childcare.' });
        const result = await post({ op: 'event', change });
        if (!result.saved) throw new Error('Google did not confirm a planning hold.');
        count++; setNotice(`Saved ${count} planning hold${count > 1 ? 's' : ''} in Google…`);
        if (!result.supportSynced) { warning = result.warning; break; }
      }
    } catch (e) { warning = `Stopped after ${count} confirmed holds. ${e.message}`; }
    await load(month, true);
    setNotice(`${count} planning hold${count !== 1 ? 's' : ''} confirmed in Google Calendar.`);
    if (warning) setError(warning);
  });
  const refresh = async nextMonth => {
    if (dirty && !window.confirm('Discard unsaved planning preferences? Download your draft first if needed.')) return;
    if (nextMonth) setMonth(nextMonth);
    await load(nextMonth || month);
  };
  const shiftMonth = by => { const date = new Date(`${month}-15T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + by); refresh(date.toISOString().slice(0, 7)); };
  const first = `${month}-01`, gridStart = month ? addDays(first, -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7)) : '';
  return <section className="cc" aria-label="Calendar companion">
    <header className="cc-hero"><div><p className="cc-kicker">YOUR PEOPLE. YOUR PLANS. YOUR GOOGLE CALENDARS.</p><h1>A full calendar.<br />A good kind of busy.</h1><p>Birthdays remembered. Sitters sorted. Time together protected.</p></div><div className="cc-actions"><button className="cc-primary" disabled={writeDisabled} onClick={() => begin('plan')}>+ Make a plan</button><button disabled={writeDisabled} onClick={() => begin('birthday')}>+ Family birthday</button></div></header>
    <div className="cc-savebar"><p role="status">{phase === 'loading' ? 'Reading Google Calendar…' : phase === 'busy' ? 'Working…' : connected ? `Google Calendar · read ${dateLabel(data.loadedAt, zone, true)}` : 'Google Calendar needs attention'}{dirty ? ' · Unsaved preferences' : ''}</p><div><button disabled={controlsDisabled} onClick={() => refresh()}>Refresh Google</button><button disabled={controlsDisabled} onClick={connect}>{connected ? 'Reconnect Google' : 'Connect Google Calendar'}</button></div></div>
    {!connected && <div className="cc-connect"><h2>Your Google calendars belong here.</h2><p>Connect the Google account you use for this workspace. Your personal calendar is always included. Every new plan, birthday, sitter entry and booking reminder is saved there. Add other calendars for availability checks in “Planning rhythm”.</p><p>Google controls calendar sharing and notifications. You may be asked to reconnect when access expires.</p></div>}
    {error && <div className="cc-alert" role="alert"><p>{error}</p><button disabled={controlsDisabled} onClick={() => download({ preferences: prefs, eventForm: editor, expectedAt: revision })}>Download recovery draft</button><button disabled={controlsDisabled} onClick={() => refresh()}>Refresh and reconcile</button></div>}
    {notice && <p className="cc-notice" role="status">{notice}</p>}
    {projectionError && <p role="alert">{projectionError}</p>}
    {dirty && <div className="cc-alert"><p>Save planning preferences before creating Google events. Event creation uses the settings confirmed by the server.</p><button disabled={controlsDisabled} onClick={savePreferences}>Save preferences</button></div>}
    <div className="cc-stats"><article><strong>{managed.filter(e => Date.parse(e.end.dateTime) >= (now ?? 0)).length}</strong><span>plans ahead</span></article><article><strong>{birthdays.length}</strong><span>upcoming birthdays</span></article><article className={queue.some(r => r.overdue) ? 'cc-warm' : ''}><strong>{queue.filter(r => r.overdue).length}</strong><span>sitter deadlines reached</span></article><article><strong>{proposals.length}</strong><span>open slots to fill</span></article></div>
    {editor?.external && <section className="cc-editor"><h2>{editor.event.summary ?? 'Google event'}</h2><p>{editor.event.start.date ?? dateLabel(editor.event.start.dateTime, zone, true)}</p><p className="cc-eventnotes">{editor.event.description}</p><p>This event is managed in Google Calendar.</p>{editor.event.htmlLink && <a className="cc-googlelink" href={editor.event.htmlLink} target="_blank" rel="noreferrer">Open in Google Calendar ↗</a>}<button onClick={() => setEditor(null)}>Close details</button></section>}
    {editor && !editor.external && <form className="cc-editor" onSubmit={submit}><h2>{editor.kind === 'birthday' ? 'Someone worth remembering.' : editor.eventId ? 'Make this plan happen.' : 'Put something good on the calendar.'}</h2><p>{editor.kind === 'birthday' ? 'An all-day birthday, repeated every year in Google, with reminders 14 days, 7 days, and 1 day ahead.' : `Times in ${zone}. Sitter coverage includes ${settings.bufferMinutes} minutes on each side.`}</p>{editor.series && <p className="cc-note">This edits the entire recurring series.</p>}<fieldset disabled={writeDisabled}><div className="cc-fields">
      <Field label="Your personal Google calendar"><input readOnly value={data?.calendars?.find(c => c.primary)?.name ?? editor.calendarId} /></Field>
      {editor.kind === 'birthday' ? <><Field label="Family member’s name"><input required maxLength={100} value={editor.name} onChange={e => updateForm('name', e.target.value)} placeholder="Who are we celebrating?" /></Field><Field label="Birthday month"><select value={editor.monthDay.slice(0, 2)} onChange={e => updateForm('monthDay', `${e.target.value}-${editor.monthDay.slice(3)}`)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1)))}</option>)}</select></Field><Field label="Birthday day"><input required type="number" min="1" max="31" value={Number(editor.monthDay.slice(3))} onChange={e => updateForm('monthDay', `${editor.monthDay.slice(0, 2)}-${String(Number(e.target.value)).padStart(2, '0')}`)} /></Field></> : <><Field label="Plan"><input required maxLength={160} value={editor.title} onChange={e => updateForm('title', e.target.value)} placeholder="Dinner, a show, an afternoon out…" /></Field><Field label="Date"><input required type="date" value={editor.day} onChange={e => updateForm('day', e.target.value)} /></Field><Field label="Start time"><input required type="time" value={editor.time} onChange={e => updateForm('time', e.target.value)} /></Field><Field label="End date (optional)"><input type="date" value={editor.endDay} onChange={e => updateForm('endDay', e.target.value)} /></Field><Field label={`End time (default ${settings.durationHours} hours)`}><input required={!!editor.endDay} type="time" value={editor.endTime} onChange={e => updateForm('endTime', e.target.value)} /></Field><Field label="Sitter coverage"><select value={editor.coverage} onChange={e => updateForm('coverage', e.target.value)}>{COVERAGE.map(v => <option key={v}>{v}</option>)}</select></Field><Field label="Sitter name"><input required={editor.coverage === 'Confirmed'} maxLength={120} value={editor.sitter} onChange={e => updateForm('sitter', e.target.value)} /></Field></>}
      <Field label="Notes / things to remember"><textarea maxLength={2000} value={editor.notes} onChange={e => updateForm('notes', e.target.value)} placeholder={editor.kind === 'birthday' ? 'Gift ideas, favorite cake, plans for celebrating…' : ''} /></Field>
    </div>{editor.kind === 'birthday' && <p className="cc-note">No birth year required. February 29 birthdays fall on the last day of February each year. Reminder delivery follows Google Calendar’s notification settings.</p>}<div className="cc-actions"><button className="cc-primary" type="submit">Save in Google Calendar</button><button type="button" onClick={() => { if (window.confirm('Discard this event form?')) setEditor(null); }}>Close form</button><button type="button" onClick={() => download({ preferences: prefs, eventForm: editor, expectedAt: revision })}>Download recovery draft</button>{editor.kind === 'plan' && editor.eventId && <button type="button" onClick={() => perform(async () => { await post({ op: 'repair', calendarId: editor.calendarId, eventId: editor.eventId, etag: editor.etag }); setNotice('Linked entries repaired from the saved Google plan. Unsaved form edits were not applied.'); })}>Repair linked entries</button>}</div></fieldset></form>}
    <nav className="cc-tabs" aria-label="Planner views">{[['calendar', 'Calendar'], ['birthdays', 'Family birthdays'], ['queue', `Sitter queue (${queue.length})`], ['ideas', 'Fill our calendar'], ['settings', 'Planning rhythm']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'calendar' && <><div className="cc-sectionhead"><div><h2>{month && new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`))}</h2><p>Your personal Google calendar, with optional availability calendars. Changes appear after refresh.</p></div><div className="cc-actions"><button disabled={controlsDisabled} aria-label="Previous month" onClick={() => shiftMonth(-1)}>←</button><button disabled={controlsDisabled} onClick={() => refresh(dayInZone(Date.now(), zone).slice(0, 7))}>Today</button><button disabled={controlsDisabled} aria-label="Next month" onClick={() => shiftMonth(1)}>→</button></div></div><label className="cc-check"><input type="checkbox" checked={showNudges} onChange={e => setShowNudges(e.target.checked)} /> Show daily booking nudges</label>
      <div className="cc-month">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <span className="cc-weekday" key={d}>{d}</span>)}{gridStart && Array.from({ length: 42 }, (_, i) => {
        const day = addDays(gridStart, i), onDay = calendarRows[day] ?? [];
        return <div key={day} className={`cc-day ${day.slice(0, 7) !== month ? 'cc-other' : ''} ${day === dayInZone(now ?? Date.now(), zone) ? 'cc-today' : ''}`}><span className="cc-daynumber">{Number(day.slice(-2))}</span><span className="cc-mobiledate">{new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00Z`))}</span>{onDay.map(e => <button disabled={controlsDisabled || !connected} key={keyOf(e)} className={`cc-event cc-kind-${eventKind(e)} ${eventKind(e) === 'sitter' && shared(e).ccCoverage === 'Confirmed' ? 'cc-covered' : ''}`} style={{ borderLeftColor: data?.calendars.find(c => c.id === e.calendarId)?.color, borderLeftWidth: '3px' }} onClick={() => openEvent(e)}>{e.start.date ? 'All day' : timeLabel(e.start.dateTime, zone)} · {e.summary ?? 'Busy'}<small>{data?.calendars.find(c => c.id === e.calendarId)?.name}</small></button>)}</div>;
      })}</div>{connected && !events.some(e => dayOf(e, zone).slice(0, 7) === month) && <div className="cc-empty">No events start this month in your selected Google calendars. Make a plan or add a family birthday.</div>}</>}
    {tab === 'birthdays' && <section><div className="cc-sectionhead"><div><p className="cc-kicker">THE PEOPLE WHO MAKE LIFE GOOD</p><h2>A year of people to celebrate.</h2><p>Upcoming birthdays from your selected Google calendars, including birthdays you add here.</p></div><button className="cc-primary" disabled={writeDisabled} onClick={() => begin('birthday')}>+ Add a birthday</button></div><div className="cc-proposals cc-birthdays">{birthdays.map(e => <article key={keyOf(e)}><span className="cc-kicker">{dateLabel(`${dayOf(e, zone)}T12:00:00Z`, 'UTC').toUpperCase()}</span><h3>{shared(e).ccPerson ?? e.summary}</h3><p>{data.calendars.find(c => c.id === e.calendarId)?.name}</p><button disabled={controlsDisabled || !connected} onClick={() => openEvent(e)}>Birthday details →</button></article>)}</div>{!birthdays.length && <div className="cc-empty">{connected ? 'No birthdays found in the next year. Add your family’s dates or select the Google calendar that contains them.' : 'Connect Google Calendar to see family birthdays.'}</div>}</section>}
    {tab === 'queue' && <section><div className="cc-sectionhead"><div><h2>A little follow-through.</h2><p>Daily booking nudges live in Google Calendar. Confirm coverage here to resolve the reminder series.</p></div></div>{queue.map(r => { const event = r.event; return <article className={`cc-queue ${r.overdue ? 'cc-due' : ''}`} key={keyOf(event)}><div><span className="cc-kicker">{r.urgent ? 'COMING UP SOON' : r.overdue ? 'BOOKING DEADLINE REACHED' : `BOOK BY ${dateLabel(r.due, zone).toUpperCase()}`}</span><h3>{r.action}: {r.plan.title}</h3><p>{dateLabel(r.plan.start, zone, true)} · {r.plan.coverage}{r.plan.sitter ? ` · ${r.plan.sitter}` : ''}</p></div><div className="cc-actions"><button disabled={writeDisabled} onClick={() => openEvent(event)}>Update coverage</button><button disabled={writeDisabled} onClick={() => perform(async () => { await post({ op: 'repair', calendarId: event.calendarId, eventId: event.recurringEventId ?? event.id, etag: event.etag }); await load(month, true); setNotice('Linked sitter entries repaired in Google.'); })}>Repair linked entries</button></div></article>; })}{!queue.length && <div className="cc-empty">{connected ? 'No unresolved sitter requests in your loaded Google plans.' : 'Connect Google Calendar to see sitter requests.'}</div>}</section>}
    {tab === 'ideas' && <section><div className="cc-sectionhead"><div><h2>Leave room for good things.</h2><p>{settings.weeklyGoal} plan{settings.weeklyGoal > 1 ? 's' : ''} a week, looking {settings.horizonWeeks} weeks ahead, with {settings.leadDays} days to book a sitter.</p></div><button disabled={writeDisabled || !!editor || !proposals.length || !!projectionError} onClick={fill}>Fill open slots in Google</button></div><p className="cc-note">Suggestions avoid busy events in your selected Google calendars. Availability is checked again before each hold is saved. Holds do not book venues or contact sitters.</p><div className="cc-proposals">{proposals.map(p => <article key={p.start}><span className="cc-kicker">{dateLabel(p.start, zone).toUpperCase()} · {timeLabel(p.start, zone)}</span><h3>{p.title}</h3><p>A little time, just for you two.</p><button disabled={writeDisabled} onClick={() => begin('plan', p)}>Plan this evening →</button></article>)}</div>{!proposals.length && <div className="cc-empty">{!connected ? 'Connect Google Calendar to find genuinely open evenings.' : dirty ? 'Save your preferences to generate dates.' : 'No open slots within this rhythm. Try a longer horizon or another preferred evening.'}</div>}<div className="cc-editor"><h3>Your idea bank</h3><p>One idea per line, up to 30. Save preferences when finished.</p><Field label="Things we want to do"><textarea disabled={controlsDisabled} rows={5} value={prefs.ideas.join('\n')} onChange={e => change({ ...prefs, ideas: e.target.value.split('\n') })} onBlur={() => { if (prefs.ideas.some(v => !v.trim() || v !== v.trim())) change({ ...prefs, ideas: prefs.ideas.map(v => v.trim()).filter(Boolean) }); }} placeholder="A new restaurant\nA comedy show\nA long walk and dinner" /></Field><button disabled={controlsDisabled} onClick={savePreferences}>Save preferences</button></div></section>}
    {tab === 'settings' && <section className="cc-editor"><h2>Find your rhythm.</h2><p>Your personal Google calendar owns all plans, birthdays and sitter entries. These preferences and ideas are saved privately in your workspace.</p><fieldset disabled={controlsDisabled}><h3>Calendars to include</h3>{!connected && prefs.readCalendars.length > 0 && <button onClick={() => change({ ...prefs, readCalendars: [], writeCalendar: '' })}>Reset calendar choices</button>}<p>Your personal calendar is always included and receives all new entries. Other calendars help check availability; this app does not write to them.</p>{data?.calendars?.map(c => <label className="cc-check" key={c.id}><input type="checkbox" disabled={c.primary} checked={c.primary || prefs.readCalendars.includes(c.id)} onChange={e => change({ ...prefs, readCalendars: e.target.checked ? [...prefs.readCalendars, c.id] : prefs.readCalendars.filter(id => id !== c.id) })} /> <span className="cc-dot" style={{ background: c.color }} />{c.name} · {c.role}</label>)}<div className="cc-fields"><Field label="All new entries go to your personal calendar"><input readOnly value={data?.calendars?.find(c => c.primary)?.name ?? 'Connect your personal Google account'} /></Field><Field label="Time zone"><select value={zone} onChange={e => change({ ...prefs, settings: { ...settings, timeZone: e.target.value } })}>{[...new Set([zone, ...Intl.supportedValuesOf('timeZone')])].map(z => <option key={z}>{z}</option>)}</select></Field>{[['leadDays', 'Book sitters this many days ahead', 1, 90], ['horizonWeeks', 'Weeks to plan ahead', 2, 12], ['weeklyGoal', 'Plans per week', 1, 3], ['durationHours', 'Default plan length (hours)', 1, 12], ['bufferMinutes', 'Sitter buffer before and after (minutes)', 0, 120]].map(([key, label, min, max]) => <Field key={key} label={label}><input type="number" min={min} max={max} value={settings[key]} onChange={e => change({ ...prefs, settings: { ...settings, [key]: Number(e.target.value) } })} /></Field>)}<Field label="Preferred day"><select value={settings.preferredDay} onChange={e => change({ ...prefs, settings: { ...settings, preferredDay: Number(e.target.value) } })}>{weekdays.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field><Field label="Preferred start time"><input type="time" value={settings.preferredTime} onChange={e => change({ ...prefs, settings: { ...settings, preferredTime: e.target.value } })} /></Field></div><button className="cc-primary" onClick={savePreferences}>Save preferences</button></fieldset></section>}
    <footer className="cc-export"><div><h3>Google at the heart of it.</h3><p>Events, birthdays, sitter coverage, and booking nudges are saved together in your personal Google calendar. They stay available in Google when this app is closed. Google controls reminder delivery; enable notifications in your calendar app.</p><p>Use Refresh after changes made elsewhere. If a plan moves in Google, repair linked entries to recalculate sitter times. No unattended reservations or sitter messages are sent.</p></div><a className="cc-googlelink" href="https://calendar.google.com/" target="_blank" rel="noreferrer">Open Google Calendar ↗</a></footer>
  </section>;
}
