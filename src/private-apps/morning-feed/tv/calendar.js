'use client';
import { useEffect, useState } from 'react';
import { checkedAgo } from '../tldr/layout.js';
import PagedText from './paged-text';
import { localInstant } from '../../calendar-companion/model.js';
import QrDevice from '../../../app/login/qr/qr-device';
import '../../../app/login/qr/qr.css';

// Read-only projection of the existing owner Calendar companion API.
export default function TvCalendar({ locked, ownerLoginEnabled = false }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [page, setPage] = useState(0), [retry, setRetry] = useState(0);
  const [needsConnection, setNeedsConnection] = useState(false), [connecting, setConnecting] = useState(false);
  useEffect(() => {
    if (locked) return;
    const controller = new AbortController(); let disposed = false;
    fetch('/api/admin/apps/calendar-companion', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) {
        if ([401,403].includes(response.status) && !disposed) setData(null);
        throw Error('Your existing owner sign-in cannot open Calendar here. Open Calendar companion on your phone or computer.');
      }
      const next = await response.json();
      if (disposed) return;
      if (next.connection !== 'connected') {
        setData(null); setNeedsConnection(next.connection === 'required');
        setError(next.error || 'Open Calendar companion on your phone to check its connection.'); return;
      }
      setData(next); setNeedsConnection(false); setError('');
    }).catch(failure => { if (!disposed) setError(failure.message || 'Calendar unavailable. Retry.'); });
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
  if (locked) return <section className="tv-panel tv-calendar-signin"><div><p className="tv-panel-kicker">CALENDAR / PHONE SIGN-IN</p><h2>Scan to connect Calendar.</h2><p>This paired TV is approved for Morning signal only. Approve full owner access on your phone to connect Calendar and your private apps for up to 30 days.</p><p>Anyone using this screen can act as you. Match the code, then continue with the same Google account.</p><a href="/admin/apps/morning-feed?view=calendar">Open existing owner Calendar view</a></div>{ownerLoginEnabled ? <QrDevice autoStart embedded/> : <p>Owner QR sign-in needs server setup.</p>}</section>;
  if (needsConnection) return <section className="tv-panel tv-calendar-reconnect"><p className="tv-panel-kicker">CALENDAR / RECONNECT</p><h2>Connect Calendar with your phone.</h2><p>Your website sign-in is active, but Google Calendar needs a fresh connection.</p><p>This signs out only this screen, then shows a QR code for a new full owner sign-in. Your phone stays signed in. Approve the same Google account and Calendar permissions on your phone.</p>{error && <p role="alert">{error}</p>}<div className="tv-panel-actions"><button disabled={connecting} onClick={reconnect}>{connecting ? 'Opening phone sign-in…' : 'Sign out this screen and show QR code'}</button><a href="/admin/apps/calendar-companion">Connect Google on this screen instead</a><button onClick={() => setRetry(retry + 1)}>Refresh calendar</button></div></section>;
  const zone = data?.preferences.settings.timeZone ?? 'UTC';
  const now = Date.now();
  const events = (data?.events ?? []).filter(event => (event.end?.dateTime ? Date.parse(event.end.dateTime) : localInstant(event.end?.date, '00:00', zone)) > now);
  const pages = Math.max(1, Math.ceil(events.length / 3));
  const safePage = Math.min(page, pages - 1);
  const when = event => event.start.date ? `${event.start.date} · All day` : new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(event.start.dateTime));
  return <section className="tv-panel"><p className="tv-panel-kicker">CALENDAR COMPANION / YOUR EXISTING GOOGLE CALENDARS</p><h2>Coming up.</h2><p>Read-only agenda · {zone} · {data?.loadedAt ? checkedAgo(data.loadedAt) : 'Loading…'}</p>{error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Loading your calendar…</p>}{data && !events.length && <p>No upcoming events in the loaded Calendar companion range.</p>}<ol className="tv-agenda">{events.slice(safePage * 3, safePage * 3 + 3).map(event => <li key={`${event.calendarId}-${event.id}`}><time>{when(event)}</time><div className="tv-event-title"><PagedText text={event.summary || 'Untitled event'} label="Event"/></div></li>)}</ol><div className="tv-panel-actions"><button disabled={!safePage} onClick={() => setPage(safePage - 1)}>Earlier events</button><span>{safePage + 1} / {pages}</span><button disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>Later events</button><button onClick={() => setRetry(retry + 1)}>Refresh calendar</button><a href="/admin/apps/calendar-companion">Open Calendar companion</a></div></section>;
}
