import { asPlan, busyWindow, eventStartMillis } from './view-model.js';
import { createHash } from 'node:crypto';
import { CalendarError } from './google-client.js';
import { COVERAGE, addDays, dayInZone, deadline, localInstant, validatePlanner, coverageWindow, emptyPlanner } from './model.js';

const encodeId = (owner, requestId) => 'cc' + createHash('sha256').update(`${owner}:${requestId}`).digest('hex').slice(0, 40);
const pathText = value => typeof value === 'string' && value.length > 0 && value.length <= 300 && !/[\u0000-\u001f]/.test(value);
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || !!value.trim()) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
export function validateEventChange(value) {
  if (!value || Object.keys(value).sort().join() !== 'calendarId,etag,event,eventId,requestId' || !pathText(value.calendarId) || !/^[a-f0-9-]{32,36}$/.test(value.requestId)) throw new CalendarError('Invalid calendar change.', 400);
  if (value.eventId !== null && !pathText(value.eventId)) throw new CalendarError('Invalid Google event.', 400);
  if ((value.eventId === null && value.etag !== null) || (value.eventId !== null && (typeof value.etag !== 'string' || !/^"[^"\r\n]{1,400}"$/.test(value.etag)))) throw new CalendarError('Refresh before editing this event.', 409);
  const e = value.event;
  if (!e || Object.keys(e).sort().join() !== 'coverage,end,kind,monthDay,name,notes,sitter,start,title' || !['plan', 'birthday'].includes(e.kind)) throw new CalendarError('Invalid event fields.', 400);
  for (const [key, max] of [['title', 160], ['name', 100], ['notes', 2000], ['sitter', 120], ['start', 40], ['end', 40], ['monthDay', 5]]) if (!text(e[key], max)) throw new CalendarError('Invalid event text.', 400);
  if (!COVERAGE.includes(e.coverage)) throw new CalendarError('Invalid sitter status.', 400);
  if (e.kind === 'birthday') {
    if (!e.name.trim() || !/^\d{2}-\d{2}$/.test(e.monthDay)) throw new CalendarError('Enter a name and birthday month/day.', 400);
    try { localInstant(`2000-${e.monthDay}`, '12:00', 'UTC'); } catch { throw new CalendarError('Invalid birthday.', 400); }
  } else {
    try { validatePlanner({ ...emptyPlanner(), plans: [{ id: 'validation', title: e.title, start: e.start, end: e.end, coverage: e.coverage, sitter: e.sitter, notes: e.notes, cancelled: false }] }); } catch (error) { throw new CalendarError(error.message, 400); }
  }
  return value;
}
export function eventPayload(input, settings, id) {
  if (input.kind === 'birthday') {
    const date = `2000-${input.monthDay}`;
    return { summary: `${input.name.trim()}'s birthday`, description: input.notes, start: { date }, end: { date: addDays(date, 1) }, transparency: 'transparent', recurrence: [input.monthDay === '02-29' ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'RRULE:FREQ=YEARLY'], reminders: { useDefault: false, overrides: [19620, 9540, 900].map(minutes => ({ method: 'popup', minutes })) }, extendedProperties: { shared: { ccKind: 'birthday', ccGroup: id, ccPerson: input.name.trim(), ccMonthDay: input.monthDay } } };
  }
  return { summary: input.title, description: input.notes, start: { dateTime: input.start, timeZone: settings.timeZone }, end: { dateTime: input.end, timeZone: settings.timeZone }, reminders: { useDefault: true }, extendedProperties: { shared: { ccKind: 'plan', ccGroup: id, ccCoverage: input.coverage, ccSitter: input.sitter, ccBuffer: String(settings.bufferMinutes), ccLead: String(settings.leadDays) } } };
}
function ownProperties(event) { return event.extendedProperties?.shared ?? {}; }
export async function availableCalendars(google) {
  return (await google.calendars()).filter(c => !c.deleted && ['reader', 'writer', 'owner'].includes(c.accessRole)).map(c => ({ id: c.id, name: c.summaryOverride ?? c.summary ?? c.id, role: c.accessRole, primary: c.primary === true, color: /^#[0-9a-f]{6}$/i.test(c.backgroundColor ?? '') ? c.backgroundColor : '#a9c6dc', timeZone: c.timeZone }));
}
export function selectedCalendars(calendars, prefs) {
  const personal = calendars.find(c => c.primary && ['owner', 'writer'].includes(c.role));
  if (!personal) throw new CalendarError('Reconnect with your personal Google account; its primary calendar must be available.', 403);
  const ids = [...new Set([personal.id, ...prefs.readCalendars])];
  if (ids.length > 5) throw new CalendarError('Keep your personal calendar and up to four additional availability calendars.', 400);
  if (ids.some(id => !calendars.some(c => c.id === id))) throw new CalendarError('A selected calendar is no longer accessible. Update calendar choices.', 409);
  return { ids, write: personal.id };
}
export async function snapshot(google, prefs, month, now = Date.now()) {
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(Date.parse(`${month}-01T00:00:00Z`)) || new Date(`${month}-01T00:00:00Z`).toISOString().slice(0, 7) !== month) throw new CalendarError('Invalid calendar month.', 400);
  const calendars = await availableCalendars(google), selected = selectedCalendars(calendars, prefs);
  const today = dayInZone(now, prefs.settings.timeZone);
  const visible = { from: addDays(`${month}-01`, -7), to: addDays(`${month}-01`, 43) };
  const planning = { from: today, to: addDays(today, 366) };
  const ranges = visible.from <= planning.to && planning.from <= visible.to
    ? [{ from: [visible.from, planning.from].sort()[0], to: [visible.to, planning.to].sort().at(-1) }]
    : [visible, planning];
  const lists = await Promise.all(selected.ids.map(async calendarId => {
    const periods = await Promise.all(ranges.map(async range => {
      const from = new Date(localInstant(range.from, '00:00', prefs.settings.timeZone)).toISOString();
      const to = new Date(localInstant(range.to, '00:00', prefs.settings.timeZone)).toISOString();
      return google.events(calendarId, from, to);
    }));
    return [...new Map(periods.flat().filter(e => e.status !== 'cancelled').map(e => [e.id, publicEvent(e, calendarId)])).values()];
  }));
  const events = lists.flat().sort((a, b) => eventStartMillis(a, prefs.settings.timeZone) - eventStartMillis(b, prefs.settings.timeZone));
  return { calendars, selected: selected.ids, writeCalendar: selected.write, events, loadedAt: new Date(now).toISOString(), through: planning.to };
}
export function publicEvent(event, calendarId) {
  const keys = ['id', 'etag', 'summary', 'description', 'start', 'end', 'recurrence', 'recurringEventId', 'originalStartTime', 'status', 'transparency', 'eventType'];
  const result = Object.fromEntries(keys.filter(k => event[k] !== undefined).map(k => [k, event[k]]));
  const properties = Object.fromEntries(Object.entries(event.extendedProperties?.shared ?? {}).filter(([key, value]) => /^cc(?:Kind|Group|Person|MonthDay|Coverage|Sitter|Buffer|Lead|Resolved)$/.test(key) && typeof value === 'string'));
  if (Object.keys(properties).length) result.extendedProperties = { shared: properties };
  const link = event.htmlLink;
  if (typeof link === 'string') { try { const url = new URL(link); if (url.protocol === 'https:' && ['calendar.google.com', 'www.google.com'].includes(url.hostname)) result.htmlLink = link; } catch {} }
  return { ...result, calendarId };
}
async function writable(google, id) {
  const list = await availableCalendars(google);
  if (!list.some(c => c.id === id && ['writer', 'owner'].includes(c.role))) throw new CalendarError('Choose a Google calendar you can edit.', 403);
  if (!list.some(c => c.id === id && c.primary)) throw new CalendarError('Plans, birthdays and sitter entries must use your personal Google calendar.', 403);
}
async function ensureChild(google, calendar, id, payload, group) {
  let current;
  try { current = await google.get(calendar, id); } catch (e) { if (e.status !== 404) throw e; }
  if (current?.status === 'cancelled') throw new CalendarError('A linked event was deleted in Google. Restore it from Google Calendar trash, then repair the sitter entries.', 409);
  if (current && ownProperties(current).ccGroup !== group) throw new CalendarError('A linked Google event changed identity. Refresh before repairing.', 409);
  if (current) return google.patch(calendar, id, { ...payload, extendedProperties: { shared: { ...ownProperties(current), ...payload.extendedProperties.shared, ccResolved: 'false' } } }, current.etag);
  try { return await google.insert(calendar, { id, ...payload }); } catch (e) { if (e.status !== 409) throw e; throw new CalendarError('A linked event was created concurrently. Refresh and repair its sitter entries.', 409); }
}
async function removeChild(google, calendar, id, group) {
  let current;
  try { current = await google.get(calendar, id); } catch (e) { if (e.status === 404) return; throw e; }
  if (current.status === 'cancelled') return;
  if (ownProperties(current).ccGroup !== group) throw new CalendarError('A linked Google event changed identity.', 409);
  // Retain a quiet, transparent resolution marker. Reopening coverage can
  // then update the same series without colliding with a deleted Google ID.
  await google.patch(calendar, id, { summary: `Resolved: ${current.summary ?? 'Sitter reminder'}`, recurrence: [], transparency: 'transparent', reminders: { useDefault: false, overrides: [] }, extendedProperties: { shared: { ...ownProperties(current), ccResolved: 'true' } } }, current.etag);
}
export async function syncSupport(google, calendar, parent, now = Date.now()) {
  const props = ownProperties(parent), group = parent.id;
  if (props.ccKind !== 'plan' || props.ccGroup !== group) throw new CalendarError('This event is not a companion plan.', 400);
  const coverageId = `${group}a`, reminderId = `${group}b`;
  if (parent.status === 'cancelled' || props.ccCoverage === 'Not needed') {
    await removeChild(google, calendar, coverageId, group); await removeChild(google, calendar, reminderId, group); return;
  }
  const p = asPlan(parent), settings = { ...emptyPlanner().settings, timeZone: parent.start.timeZone ?? 'UTC', bufferMinutes: Number(props.ccBuffer ?? 30), leadDays: Number(props.ccLead ?? 14) };
  try { validatePlanner({ ...emptyPlanner(), settings, plans: [p] }); } catch { throw new CalendarError('This Google plan has invalid companion settings. Edit the plan before repairing linked entries.', 400); }
  const window = coverageWindow(p, settings);
  await ensureChild(google, calendar, coverageId, { summary: `Sitter ${p.coverage.toLowerCase()}: ${p.title}${p.sitter ? ` (${p.sitter})` : ''}`, start: { dateTime: new Date(window.start).toISOString(), timeZone: settings.timeZone }, end: { dateTime: new Date(window.end).toISOString(), timeZone: settings.timeZone }, transparency: 'transparent', description: 'Linked sitter coverage. Update coverage on the companion plan, then repair linked entries if needed.', extendedProperties: { shared: { ccKind: 'sitter', ccGroup: group, ccCoverage: p.coverage } } }, group);
  if (p.coverage === 'Confirmed' || Date.parse(p.start) <= now) { await removeChild(google, calendar, reminderId, group); return; }
  const due = Math.max(deadline(p, settings), now + 60000);
  if (due >= Date.parse(p.start)) { await removeChild(google, calendar, reminderId, group); return; }
  const until = new Date(Date.parse(p.start) - 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  await ensureChild(google, calendar, reminderId, { summary: `${p.coverage === 'Asked' ? 'Follow up with sitter' : 'Book a sitter'}: ${p.title}`, start: { dateTime: new Date(due).toISOString(), timeZone: settings.timeZone }, end: { dateTime: new Date(due + 900000).toISOString(), timeZone: settings.timeZone }, recurrence: [`RRULE:FREQ=DAILY;UNTIL=${until}`], transparency: 'transparent', reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }, description: 'Daily booking nudge. Resolving sitter coverage in Calendar companion removes this series. Google Calendar controls notification delivery.', extendedProperties: { shared: { ccKind: 'reminder', ccGroup: group } } }, group);
}
function samePayload(current, payload) {
  const sameTime = (a, b) => a?.date ? a.date === b.date : Date.parse(a?.dateTime) === Date.parse(b?.dateTime);
  const props = ownProperties(current), expected = payload.extendedProperties.shared;
  return current.status !== 'cancelled' && current.summary === payload.summary && (current.description ?? '') === payload.description && sameTime(current.start, payload.start) && sameTime(current.end, payload.end) && (!payload.recurrence || JSON.stringify(current.recurrence) === JSON.stringify(payload.recurrence)) && Object.entries(expected).every(([k, v]) => props[k] === v);
}
export async function saveGoogleEvent(google, prefs, owner, change, now = Date.now()) {
  validateEventChange(change); await writable(google, change.calendarId);
  const id = change.eventId ?? encodeId(owner.id, change.requestId), payload = eventPayload(change.event, prefs.settings, id);
  const existing = change.eventId ? await google.get(change.calendarId, id) : null;
  if (existing && (ownProperties(existing).ccKind !== change.event.kind || ownProperties(existing).ccGroup !== id)) throw new CalendarError('Edit this external event in Google Calendar.', 400);
  if (existing && existing.etag !== change.etag) throw new CalendarError('This event changed in Google Calendar. Refresh and reconcile your edits.', 409);
  const moved = !existing || Date.parse(existing.start?.dateTime) !== Date.parse(change.event.start) || Date.parse(existing.end?.dateTime) !== Date.parse(change.event.end);
  if (change.event.kind === 'plan' && moved) {
    const calendars = await availableCalendars(google);
    const read = [...new Set([...selectedCalendars(calendars, prefs).ids, change.calendarId])];
    const window = coverageWindow(change.event, prefs.settings);
    const from = new Date(window.start).toISOString(), to = new Date(window.end).toISOString();
    for (const calendar of read) {
      const events = await google.events(calendar, from, to);
      if (events.some(e => { const busy = busyWindow(e, prefs.settings.timeZone); return !(calendar === change.calendarId && e.id === id) && busy && busy.start < window.end && busy.end > window.start; })) throw new CalendarError('This time conflicts with a selected Google calendar, including the sitter buffer. Refresh and choose another slot.', 409);
    }
  }
  let saved;
  if (change.eventId) {
    saved = await google.patch(change.calendarId, id, { ...payload, extendedProperties: { shared: { ...ownProperties(existing), ...payload.extendedProperties.shared } } }, change.etag);
  } else {
    try { saved = await google.insert(change.calendarId, { id, ...payload }); }
    catch (e) {
      if (e.status !== 409) throw e;
      saved = await google.get(change.calendarId, id);
      if (!samePayload(saved, payload)) throw new CalendarError('This request already created an event with different details. Refresh before editing it.', 409);
    }
  }
  if (change.event.kind === 'plan') {
    try { await syncSupport(google, change.calendarId, saved, now); if ((await google.get(change.calendarId, saved.id)).etag !== saved.etag) throw new CalendarError('The plan changed while linked entries were being updated. Refresh and repair again.', 409); }
    catch (error) { return { saved: true, supportSynced: false, event: publicEvent(saved, change.calendarId), warning: `Google saved the plan, but linked sitter entries need repair. ${error.message}` }; }
  }
  return { saved: true, supportSynced: true, event: publicEvent(saved, change.calendarId) };
}
export async function repairGoogleEvent(google, calendarId, eventId, etag, now) {
  if (!pathText(calendarId) || !pathText(eventId) || typeof etag !== 'string' || !/^"[^"\r\n]{1,400}"$/.test(etag)) throw new CalendarError('Refresh before repairing this plan.', 400);
  await writable(google, calendarId);
  const event = await google.get(calendarId, eventId);
  if (event.etag !== etag) throw new CalendarError('The Google plan changed. Refresh before repairing it.', 409);
  await syncSupport(google, calendarId, event, now);
  if ((await google.get(calendarId, eventId)).etag !== etag) throw new CalendarError('The plan changed during repair. Refresh and reconcile.', 409);
  return { repaired: true };
}
