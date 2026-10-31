'use client';
import { useEffect, useState } from 'react';
import { checkedAgo } from '../tldr/layout.js';
import { localInstant } from '../../calendar-companion/model.js';
// Read-only projection of the EXISTING Calendar companion API, never a new data source.
export default function TvCalendar({ locked }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [page, setPage] = useState(0), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (locked) return;
    const controller = new AbortController(); let disposed = false;
    fetch('/api/admin/apps/calendar-companion', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) { if ([401,403].includes(response.status) && !disposed) setData(null); throw Error('Your existing owner sign-in cannot open Calendar here. Open Calendar companion on your phone or computer.'); }
      const next = await response.json();
      if (!disposed) { if (next.connection !== 'connected') { setError(next.error || 'Open Calendar companion on your phone to check its connection.'); return; } setData(next); setError(''); }
    }).catch(failure => { if (!disposed) setError(failure.message || 'Calendar unavailable. Retry.'); });
    return () => { disposed = true; controller.abort(); };
  }, [locked, retry]);
  if (locked) return <section className="tv-panel"><p className="tv-panel-kicker">CALENDAR / PRIVATE</p><h2>Your calendar stays private.</h2><p>This paired TV is approved for Morning signal only. Calendar needs separate owner authorization; this release does not grant it.</p><p>Open your existing Calendar companion on your phone or computer. No calendar events or permissions have changed.</p></section>;
  const zone = data?.preferences.settings.timeZone ?? 'UTC';
  const now = Date.now();
  const events = (data?.events ?? []).filter(event => (event.end?.dateTime ? Date.parse(event.end.dateTime) : localInstant(event.end?.date, '00:00', zone)) > now);
  const pages = Math.max(1, Math.ceil(events.length / 5));
  const safePage = Math.min(page, pages - 1);
  const when = event => event.start.date ? `${event.start.date} · All day` : new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(event.start.dateTime));
  return <section className="tv-panel"><p className="tv-panel-kicker">CALENDAR COMPANION / YOUR EXISTING GOOGLE CALENDARS</p><h2>Coming up.</h2><p>Read-only agenda · {zone} · {data?.loadedAt ? checkedAgo(data.loadedAt) : 'Loading…'}</p>{error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Loading your calendar…</p>}{data && !events.length && <p>No upcoming events in the loaded Calendar companion range.</p>}<ol className="tv-agenda">{events.slice(safePage * 5, safePage * 5 + 5).map(event => <li key={`${event.calendarId}-${event.id}`}><time>{when(event)}</time><strong>{event.summary || 'Untitled event'}</strong></li>)}</ol><div className="tv-panel-actions"><button disabled={!safePage} onClick={() => setPage(safePage - 1)}>Earlier events</button><span>{safePage + 1} / {pages}</span><button disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>Later events</button><button onClick={() => setRetry(retry + 1)}>Refresh calendar</button><a href="/admin/apps/calendar-companion">Open Calendar companion</a></div></section>;
}
