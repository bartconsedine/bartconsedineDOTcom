import { addDays, dayInZone } from '../../calendar-companion/model.js';

export { addDays, dayInZone };
export const dayLabel = (day, options = { weekday: 'long', month: 'long', day: 'numeric' }) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(`${day}T12:00:00Z`));
export const clockLabel = (instant, zone) => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(instant));
const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;

// Presentation only. Calendar companion remains the authorized source of events.
export function calendarEvents(events, zone) {
  const entries = []; let skipped = 0;
  for (const event of events) {
    if (event.status === 'cancelled' || event.extendedProperties?.shared?.ccResolved === 'true') continue;
    const allDay = Boolean(event.start?.date);
    const start = allDay ? Date.parse(`${event.start.date}T00:00:00Z`) : Date.parse(event.start?.dateTime);
    const end = allDay ? Date.parse(`${event.end?.date}T00:00:00Z`) : Date.parse(event.end?.dateTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || (allDay && (!validDay(event.start.date) || !validDay(event.end?.date)))) { skipped++; continue; }
    entries.push({ ...event, key: `${event.calendarId}:${event.id}`, title: event.summary?.trim() || 'Untitled event', allDay, startMillis: start, endMillis: end,
      firstDay: allDay ? event.start.date : dayInZone(start, zone), lastDay: allDay ? addDays(event.end.date, -1) : dayInZone(end - 1, zone) });
  }
  entries.sort((a, b) => a.startMillis - b.startMillis || a.key.localeCompare(b.key));
  return { entries, skipped };
}
export const eventsOnDay = (events, day) => events.filter(event => event.firstDay <= day && event.lastDay >= day).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMillis - b.startMillis || a.key.localeCompare(b.key));
export function eventTiming(event, day, zone) {
  if (event.allDay) return { primary: 'All day', secondary: event.firstDay === event.lastDay ? '' : `Through ${dayLabel(event.lastDay, { month: 'short', day: 'numeric' })}` };
  return { primary: event.firstDay < day ? 'Continues' : clockLabel(event.startMillis, zone), secondary: `Until ${dayInZone(event.endMillis, zone) > day ? `${dayLabel(dayInZone(event.endMillis, zone), { month: 'short', day: 'numeric' })}, ` : ''}${clockLabel(event.endMillis, zone)}` };
}
export function eventStatus(event, now) {
  if (event.allDay) return '';
  if (event.endMillis <= now) return 'Ended';
  if (event.startMillis <= now) return 'Now';
  const minutes = Math.ceil((event.startMillis - now) / 60000);
  return minutes < 60 ? `In ${minutes} min` : '';
}
export function currentEvent(events, now) {
  const timed = events.filter(event => !event.allDay && event.endMillis > now);
  return timed.find(event => event.startMillis <= now) ?? timed[0] ?? null;
}
