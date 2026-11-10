import { coverageWindow } from './model.js';
import { busyWindow, eventKind } from './view-model.js';

export const outingZone = 'America/New_York';
export const outingGuide = 'https://ra.co/events/us/newyorkcity';

// Public venue listings. Past picks fall away; household plans live in Google.
export const earlyDjPicks = [
  {
    title: 'BLISS NYC with Wil Milton',
    venue: '9 Bob Note · 270 Meserole Street, Brooklyn',
    style: 'Underground house · 13th anniversary',
    start: '2026-11-14T16:00:00-05:00',
    end: '2026-11-14T22:00:00-05:00',
    url: 'https://www.3dollarbillbk.com/rsvp/2026/11/14/bliss-nyc-with-wil-milton',
  },
  {
    title: 'Pantheon: A Classic Queer Dance Party',
    venue: '3 Dollar Bill · 260 Meserole Street, Brooklyn',
    style: '90s and 2000s house, club classics and pop remixes',
    start: '2026-11-14T16:00:00-05:00',
    end: '2026-11-14T22:00:00-05:00',
    url: 'https://www.3dollarbillbk.com/rsvp/2026/11/14/pantheon-a-classic-queer-dance-party',
  },
];

export function upcomingOutings(now) {
  return earlyDjPicks.filter(pick => Date.parse(pick.start) > now);
}

export function outingAvailability(pick, snapshot, settings) {
  const window = coverageWindow(pick, settings);
  if (snapshot?.connection !== 'connected') return { window, status: 'unchecked' };
  const planned = snapshot.events.find(event => event.calendarId === snapshot.writeCalendar &&
    event.status !== 'cancelled' && eventKind(event) === 'plan' &&
    Date.parse(event.start.dateTime) === Date.parse(pick.start) &&
    Date.parse(event.end.dateTime) === Date.parse(pick.end) &&
    event.description?.split('\n').includes(pick.url));
  if (planned) return { window, status: 'planned', planned };
  try {
    const busy = snapshot.events.some(event => {
      const span = busyWindow(event, settings.timeZone);
      return span && span.start < window.end && span.end > window.start;
    });
    return { window, status: busy ? 'busy' : 'open' };
  } catch {
    return { window, status: 'unchecked' };
  }
}
