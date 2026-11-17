'use client';
import { useEffect, useState } from 'react';
import { checkedAgo } from '../tldr/layout.js';
import PagedText from './paged-text';
import { addDays, dayInZone, localInstant } from '../../calendar-companion/model.js';
import QrDevice from '../../../app/login/qr/qr-device';
import '../../../app/login/qr/qr.css';
import './panels.css';

const dayLabel = (day, options) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(`${day}T12:00:00Z`));
const eventKey = event => `${event.calendarId}-${event.id}`;
function projectEvent(event, zone) {
  try {
    const start = event.start?.date ? localInstant(event.start.date, '00:00', zone) : Date.parse(event.start?.dateTime);
    const end = event.end?.date ? localInstant(event.end.date, '00:00', zone) : Date.parse(event.end?.dateTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || event.status === 'cancelled') return null;
    return { event, start, end, first: dayInZone(start, zone), last: dayInZone(end - 1, zone) };
  } catch { return null; }
}

// Read-only projection of the existing owner Calendar companion API.
export default function TvCalendar({ locked, ownerLoginEnabled = false }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [page, setPage] = useState(0), [retry, setRetry] = useState(0);
  const [needsConnection, setNeedsConnection] = useState(false), [connecting, setConnecting] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null), [week, setWeek] = useState(0), [refreshing, setRefreshing] = useState(true);
  useEffect(() => {
    if (locked) return;
    const controller = new AbortController(); let disposed = false;
    setRefreshing(true);
    fetch('/api/admin/apps/calendar-companion', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) {
        if ([401, 403].includes(response.status) && !disposed) setData(null);
        throw Error('Your existing owner sign-in cannot open Calendar here. Open Calendar companion on your phone or computer.');
      }
      const next = await response.json();
      if (disposed) return;
      if (next.connection !== 'connected') {
        setData(null); setNeedsConnection(next.connection === 'required');
        setError(next.error || 'Open Calendar companion on your phone to check its connection.'); return;
      }
      setData(next); setNeedsConnection(false); setError('');
    }).catch(failure => { if (!disposed) setError(failure.message || 'Calendar unavailable. Retry.'); })
      .finally(() => { if (!disposed) setRefreshing(false); });
    return () => { disposed = true; controller.abort(); };
  }, [locked, retry]);
  async function reconnect() {
    if (connecting) return;
    setConnecting(true);
    try {
      const response = await fetch('/auth/signout', { method: 'POST' });
      if (!response.ok) throw Error('Could not sign out this screen. Retry.');
      window.location.assign('/login/qr?calendar=1');
    } catch (failure) { setError(failure.message); setConnecting(false); }
  }
  if (locked) return <section className="tv-panel tv-calendar-signin tv-connect-panel"><div className="tv-connect-copy"><p className="tv-panel-kicker">CALENDAR / PHONE SIGN-IN</p><span className="tv-panel-symbol" aria-hidden="true">◷</span><h2>Your plans.<br/>On the big screen.</h2><p>Scan to connect Calendar. This paired TV has Morning signal access only.</p><p>Approve full owner access for up to 30 days, including private apps. Anyone using this screen can act as you. Match the code and use the same Google account.</p><a href="/admin/apps/morning-feed?view=calendar">Open existing owner Calendar view</a></div>{ownerLoginEnabled ? <QrDevice autoStart embedded/> : <div className="tv-connection-empty"><strong>Phone sign-in is not available yet.</strong><p>Owner QR sign-in needs server setup.</p></div>}</section>;
  if (needsConnection) return <section className="tv-panel tv-calendar-reconnect tv-connect-panel"><div className="tv-connect-copy"><p className="tv-panel-kicker">CALENDAR / RECONNECT</p><span className="tv-panel-symbol" aria-hidden="true">◷</span><h2>A fresh connection.</h2><p>Your website sign-in is active. Google Calendar needs to reconnect.</p><p>This signs out only this screen, then opens a QR code for full owner sign-in. Your phone stays signed in. Approve the same Google account and Calendar permissions.</p>{error && <p className="tv-panel-alert" role="alert">{error}</p>}</div><div className="tv-connect-steps"><p className="tv-panel-kicker">CONTINUE ON YOUR PHONE</p><div><span>01</span><p>Show the code on this screen.</p></div><div><span>02</span><p>Scan, compare, and approve.</p></div><div><span>03</span><p>Return to your calendar.</p></div><div className="tv-panel-actions"><button className="tv-panel-primary" disabled={connecting} onClick={reconnect}>{connecting ? 'Opening phone sign-in…' : 'Sign out this screen and show QR code'}</button><a href="/admin/apps/calendar-companion">Connect Google on this screen instead</a><button disabled={refreshing} onClick={() => setRetry(retry + 1)}>Refresh calendar</button></div></div></section>;
  const zone = data?.preferences?.settings?.timeZone ?? 'UTC';
  const now = Date.now(), today = dayInZone(now, zone);
  const projected = (data?.events ?? []).map(event => projectEvent(event, zone)).filter(Boolean).filter(row => row.end > now).sort((a, b) => a.start - b.start || eventKey(a.event).localeCompare(eventKey(b.event)));
  const lastDay = projected.reduce((last, row) => row.last > last ? row.last : last, today);
  const maxWeek = Math.max(0, Math.floor((Date.parse(`${lastDay}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 604800000));
  const safeWeek = Math.min(week, maxWeek), firstDay = addDays(today, safeWeek * 7);
  const days = Array.from({ length: 7 }, (_, index) => addDays(firstDay, index));
  const day = selectedDay && days.includes(selectedDay) ? selectedDay : firstDay;
  const onDay = value => projected.filter(row => row.first <= value && row.last >= value);
  const events = onDay(day), pages = Math.max(1, Math.ceil(events.length / 2)), safePage = Math.min(page, pages - 1);
  const choose = value => { setSelectedDay(value); setPage(0); };
  const moveWeek = value => { setWeek(value); setSelectedDay(null); setPage(0); };
  const clock = value => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  return <section className="tv-panel tv-calendar-view" aria-label="Your calendar agenda">
    <header className="tv-calendar-heading"><div><p className="tv-panel-kicker">YOUR CALENDAR / {dayLabel(day, { month: 'long', year: 'numeric' }).toUpperCase()}</p><h2>{day === today ? 'Today, at a glance.' : dayLabel(day, { weekday: 'long', month: 'short', day: 'numeric' })}</h2></div><div className="tv-calendar-freshness"><span>{zone.replaceAll('_', ' ')}</span><span role="status">{refreshing ? 'Reading Calendar…' : data?.loadedAt ? checkedAgo(data.loadedAt) : 'Calendar unavailable'}</span></div>{error && <p className="tv-panel-alert" role="alert">{data ? 'Showing your last loaded calendar. ' : ''}{error}</p>}</header>
    <nav className="tv-calendar-days" aria-label="Choose agenda day">{days.map(value => { const count = onDay(value).length; return <button key={value} aria-pressed={value === day} onClick={() => choose(value)}><span>{value === today ? 'Today' : dayLabel(value, { weekday: 'short' })}</span><strong>{value.slice(-2)}</strong><small>{data ? `${count} ${count === 1 ? 'event' : 'events'}` : '—'}</small></button>; })}</nav>
    {data && events.length ? <ol className="tv-agenda-cards" aria-label={`Events for ${day}`}>
      {events.slice(safePage * 2, safePage * 2 + 2).map(({ event, start, end }) => <li key={eventKey(event)} className="tv-agenda-card"><header><time dateTime={event.start.dateTime || event.start.date}>{event.start.date ? 'All day' : `${clock(start)} – ${clock(end)}`}</time><span>{start <= now && day === today ? 'Happening now' : 'Upcoming'}</span></header><div className="tv-agenda-title"><PagedText text={event.summary || 'Untitled event'} label="Event title"/></div><p className="tv-agenda-source">{event.start.date ? 'All-day event' : 'Local time'} · Google Calendar</p></li>)}
    </ol> : <div className="tv-agenda-empty"><span aria-hidden="true">{data ? '○' : '◷'}</span><h3>{data ? 'A little breathing room.' : error ? 'Calendar needs attention.' : 'Bringing your day into view.'}</h3><p role={!data && !error ? 'status' : undefined}>{data ? 'No upcoming events on this day in your loaded calendar. Choose another day to look ahead.' : error ? 'Refresh to try again, or open Calendar companion to check your connection.' : 'Reading your existing Google calendars.'}</p></div>}
    <footer className="tv-calendar-footer"><div className="tv-calendar-range"><button disabled={!safeWeek} onClick={() => moveWeek(safeWeek - 1)}>Earlier days</button><button disabled={safeWeek === 0 && day === today} onClick={() => { moveWeek(0); choose(today); }}>Today</button><button disabled={safeWeek >= maxWeek} onClick={() => moveWeek(safeWeek + 1)}>Later days</button></div><div className="tv-calendar-paging"><button aria-label="Earlier events" disabled={!safePage} onClick={() => setPage(safePage - 1)}>←</button><span role="status">{events.length ? `${safePage * 2 + 1}–${Math.min(events.length, safePage * 2 + 2)} of ${events.length}` : 'No events'}</span><button aria-label="Later events" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>→</button></div><button disabled={refreshing} onClick={() => setRetry(retry + 1)}>Refresh calendar</button><a href="/admin/apps/calendar-companion" aria-label="Open Calendar companion">Manage plans</a></footer>
  </section>;
}
