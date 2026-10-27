import { COVERAGE, localInstant, dayInZone, addDays } from './model.js';
const ownProperties = event => event.extendedProperties?.shared ?? {};
export function asPlan(event) {
  const props = ownProperties(event);
  return { id: event.id, title: event.summary ?? 'Untitled plan', start: new Date(event.start.dateTime).toISOString(), end: new Date(event.end.dateTime).toISOString(), coverage: COVERAGE.includes(props.ccCoverage) ? props.ccCoverage : 'Needed', sitter: props.ccSitter ?? '', notes: event.description ?? '', cancelled: event.status === 'cancelled' };
}
export function busyWindow(event, timeZone) {
  if (event.status === 'cancelled' || event.transparency === 'transparent' || ['sitter', 'reminder', 'birthday'].includes(ownProperties(event).ccKind) || event.eventType === 'birthday') return null;
  try {
    const start = event.start?.dateTime ? Date.parse(event.start.dateTime) : localInstant(event.start.date, '00:00', timeZone);
    const end = event.end?.dateTime ? Date.parse(event.end.dateTime) : localInstant(event.end.date, '00:00', timeZone);
    return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
  } catch { throw new Error('Google returned an unreadable event time. Refresh before planning.'); }
}

export const eventKind = event => ownProperties(event).ccKind ?? (event.eventType === 'birthday' ? 'birthday' : 'external');

export function eventStartMillis(event, timeZone) {
  return event.start?.date ? localInstant(event.start.date, '00:00', timeZone) : Date.parse(event.start?.dateTime);
}
function eventDays(event, timeZone) {
  const first = event.start?.date ?? dayInZone(event.start.dateTime, timeZone);
  if (event.end?.date) return { first, last: addDays(event.end.date, -1) };
  const lastInstant = Math.max(Date.parse(event.start.dateTime), Date.parse(event.end.dateTime) - 1);
  return { first, last: dayInZone(lastInstant, timeZone) };
}
export function eventOnDay(event, day, timeZone) {
  const { first, last } = eventDays(event, timeZone);
  return first <= day && last >= day;
}
export function eventsByDay(events, firstDay, timeZone, showNudges = false) {
  const result = {}, lastDay = addDays(firstDay, 41);
  for (const event of events) {
    if (!showNudges && eventKind(event) === 'reminder') continue;
    const range = eventDays(event, timeZone);
    const first = range.first > firstDay ? range.first : firstDay;
    const last = range.last < lastDay ? range.last : lastDay;
    for (let day = first; day <= last; day = addDays(day, 1)) (result[day] ??= []).push(event);
  }
  return result;
}
