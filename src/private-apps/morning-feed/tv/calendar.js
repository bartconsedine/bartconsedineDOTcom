'use client';
import { useEffect, useMemo, useState } from 'react';
import PagedText from './paged-text';
import { addDays, dayInZone, dayLabel, clockLabel, calendarEvents, eventsOnDay, eventTiming, eventStatus, currentEvent } from './calendar-model.js';
import './calendar.css';

export default function TvCalendar({ locked }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0), [retry, setRetry] = useState(0), [now, setNow] = useState(null);
  const [pageSize, setPageSize] = useState(3);
  useEffect(() => {
    const short = window.matchMedia('(max-height: 650px)'), medium = window.matchMedia('(max-height: 800px)');
    const resize = () => { setPageSize(short.matches ? 1 : medium.matches ? 2 : 3); setPage(0); };
    resize(); short.addEventListener('change', resize); medium.addEventListener('change', resize);
    return () => { short.removeEventListener('change', resize); medium.removeEventListener('change', resize); };
  }, []);
  const [week, setWeek] = useState(null), [selection, setSelection] = useState(null);
  useEffect(() => {
    setError('');
    if (locked) { setData(null); return; }
    let disposed = false, controller, inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true; setLoading(true);
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch('/api/admin/apps/calendar-companion', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw Error([401, 403].includes(response.status) ? 'Sign in to Calendar companion again to view your agenda.' : 'Calendar could not refresh. Try again.');
        const next = await response.json();
        if (next.connection !== 'connected') throw Error(next.error || 'Open Calendar companion to reconnect Google Calendar.');
        if (!Array.isArray(next.events) || !next.preferences?.settings?.timeZone) throw Error('Calendar returned an incomplete agenda. Try again.');
        // Validate before rendering; never silently use the device time zone.
        dayInZone(Date.now(), next.preferences.settings.timeZone);
        if (!disposed) { setData(next); setError(''); setNow(Date.now()); }
      } catch (failure) {
        if (!disposed) { setData(null); setError(failure.name === 'AbortError' ? 'Calendar took too long to respond. Try again.' : failure.message || 'Calendar unavailable. Try again.'); }
      } finally { clearTimeout(timeout); inFlight = false; if (!disposed) setLoading(false); }
    }
    setNow(Date.now()); refresh();
    const visibleRefresh = () => { if (document.visibilityState !== 'hidden') refresh(); };
    const poll = setInterval(visibleRefresh, 300000);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    window.addEventListener('focus', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => { disposed = true; controller?.abort(); clearInterval(poll); clearInterval(clock); window.removeEventListener('focus', visibleRefresh); document.removeEventListener('visibilitychange', visibleRefresh); };
  }, [locked, retry]);
  const zone = data?.preferences.settings.timeZone ?? 'UTC';
  const { entries, skipped } = useMemo(() => calendarEvents(data?.events ?? [], zone), [data, zone]);
  const today = dayInZone(now ?? Date.now(), zone);
  const through = /^\d{4}-\d{2}-\d{2}$/.test(data?.through ?? '') ? data.through : addDays(today, 7);
  const first = week && week >= today && week < through ? week : today;
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
  const selected = selection && selection >= first && selection <= days[6] && selection < through ? selection : first;
  useEffect(() => setPage(0), [today]);
  const agenda = eventsOnDay(entries, selected);
  const pages = Math.max(1, Math.ceil(agenda.length / pageSize)), safePage = Math.min(page, pages - 1);
  const spotlight = currentEvent(entries, now ?? Date.now());
  const names = new Map((data?.calendars ?? []).map(calendar => [calendar.id, calendar.name]));
  function choose(day, eventKey) { setSelection(day); const index = eventKey ? eventsOnDay(entries, day).findIndex(event => event.key === eventKey) : 0; setPage(Math.floor(Math.max(0, index) / pageSize)); }
  function moveWeek(amount) { const next = addDays(first, amount); setWeek(next < today ? today : next); setSelection(null); setPage(0); }
  function goToday() { setWeek(null); setSelection(null); setPage(0); }

  if (locked) return <section className="tv-panel tv-calendar tv-calendar-state" aria-label="Calendar"><p className="tv-calendar-eyebrow">CALENDAR · PRIVATE</p><h2>Your day, on your terms.</h2><p>This TV is connected to your feed. Your calendar needs its own permission before events can appear here.</p><p>For now, use TV mode in your signed-in owner browser. Calendar approval for paired TVs is not available yet.</p><div className="tv-calendar-actions"><a href="/admin/apps/morning-feed?view=calendar">Open owner Calendar view</a></div></section>;
  if (!data || !now) return <section className="tv-panel tv-calendar tv-calendar-state" aria-label="Calendar" aria-busy={loading}><p className="tv-calendar-eyebrow">YOUR CALENDAR</p><h2>{error ? 'Let’s get you reconnected.' : 'Making room for your day.'}</h2><p role={error ? 'alert' : 'status'}>{error || 'Loading your Google Calendar agenda…'}</p><div className="tv-calendar-actions"><button disabled={loading} onClick={() => setRetry(value => value + 1)}>{loading ? 'Loading…' : 'Retry calendar'}</button><a href="/admin/apps/calendar-companion">Open Calendar companion</a></div></section>;
  return <section className="tv-panel tv-calendar" aria-label="Calendar">
    <header className="tv-calendar-header"><div><p className="tv-calendar-eyebrow">YOUR CALENDAR</p><h2>{dayLabel(first, { month: 'long', year: 'numeric' })}</h2></div><div className="tv-calendar-clock"><time dateTime={new Date(now).toISOString()}>{clockLabel(now, zone)}</time><span>{zone.replaceAll('_', ' ')}</span></div></header>
    <nav className="tv-calendar-days" aria-label="Choose agenda day">{days.map(day => {
      const count = eventsOnDay(entries, day).length;
      return <button key={day} disabled={day >= through} aria-pressed={selected === day} aria-current={day === today ? 'date' : undefined} aria-label={`${dayLabel(day)}${day === today ? ', today' : ''}, ${count} ${count === 1 ? 'event' : 'events'}`} onClick={() => choose(day)}><span>{day === today ? 'Today' : dayLabel(day, { weekday: 'short' })}</span><strong>{Number(day.slice(-2))}</strong><small>{day >= through ? '—' : count ? `${count} ${count === 1 ? 'event' : 'events'}` : 'No events'}</small></button>;
    })}</nav>
    <div className="tv-calendar-body">
      <aside className="tv-calendar-spotlight" aria-label="Now and next"><p className="tv-calendar-eyebrow">{spotlight ? spotlight.startMillis <= now ? 'HAPPENING NOW' : 'UP NEXT' : 'LOOKING AHEAD'}</p>{spotlight ? <><div className="tv-calendar-feature-title"><PagedText key={spotlight.key} text={spotlight.title} label="Next event"/></div><p className="tv-calendar-feature-time">{dayLabel(spotlight.firstDay, { weekday: 'short', month: 'short', day: 'numeric' })}<br/>{clockLabel(spotlight.startMillis, zone)} – {clockLabel(spotlight.endMillis, zone)}{dayInZone(spotlight.endMillis, zone) > spotlight.firstDay && <><br/>Ends {dayLabel(dayInZone(spotlight.endMillis, zone), { month: 'short', day: 'numeric' })}</>}</p><button onClick={() => { const day = spotlight.firstDay < today ? today : spotlight.firstDay; setWeek(day); choose(day, spotlight.key); }}>View this day <span aria-hidden="true">↗</span></button></> : <><h3>No timed events ahead.</h3><p>Check the day cards for all-day plans.</p></>}<p className="tv-calendar-footnote">From your selected Google calendars</p></aside>
      <section className="tv-calendar-day" aria-label={`${dayLabel(selected)} agenda`}><header><h3>{selected === today ? 'Today' : dayLabel(selected, { weekday: 'long' })}<span>{dayLabel(selected, { month: 'short', day: 'numeric' })}</span></h3><p>{agenda.length} {agenda.length === 1 ? 'event' : 'events'}</p></header>
        {agenda.length ? <ol className="tv-calendar-agenda" style={{ gridTemplateRows: `repeat(${pageSize}, minmax(0, 1fr))` }} start={safePage * pageSize + 1}>{agenda.slice(safePage * pageSize, safePage * pageSize + pageSize).map(event => { const timing = eventTiming(event, selected, zone), status = eventStatus(event, now); return <li key={event.key} data-status={status === 'Now' ? 'now' : status === 'Ended' ? 'ended' : undefined}><div className="tv-calendar-event-time"><time dateTime={event.start.dateTime ?? event.start.date}>{timing.primary}</time><span>{timing.secondary}</span>{status && <small>{status}</small>}</div><div className="tv-calendar-event"><div className="tv-calendar-event-title"><PagedText text={event.title} label="Event title"/></div><span className="tv-calendar-source" title={names.get(event.calendarId) || 'Calendar'}>{names.get(event.calendarId) || 'Calendar'}</span></div></li>; })}</ol> : <div className="tv-calendar-empty"><span aria-hidden="true">○</span><h4>A little breathing room.</h4><p>No events on this day in your selected calendars.</p></div>}
        <div className="tv-calendar-pagination"><button disabled={!safePage} onClick={() => setPage(safePage - 1)} aria-label="Previous events">←</button><span role="status">{agenda.length ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, agenda.length)} of ${agenda.length}` : 'Day is clear'}</span><button disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)} aria-label="Next events">→</button></div>
      </section>
    </div>
    <footer className="tv-calendar-footer"><div className="tv-calendar-actions"><button disabled={first === today} onClick={() => moveWeek(-7)} aria-label="Previous seven days">← Week</button><button onClick={goToday}>Today</button><button disabled={addDays(first, 7) >= through} onClick={() => moveWeek(7)} aria-label="Next seven days">Week →</button></div><p role="status">{loading ? 'Refreshing…' : `Updated ${clockLabel(data.loadedAt || now, zone)}`}{skipped > 0 && ` · ${skipped} unreadable ${skipped === 1 ? 'event' : 'events'}`}</p><div className="tv-calendar-actions"><button disabled={loading} onClick={() => setRetry(value => value + 1)}>Refresh</button><a href="/admin/apps/calendar-companion">Manage calendar ↗</a></div></footer>
  </section>;
}
