import { validateRevision } from '../../lib/app-data-contracts.js';
import { KEY, MAX_BYTES, SLUG, validatePreferences, emptyPreferences } from './preferences.js';
import { CalendarError } from './google-client.js';
import { snapshot, publicEvent, saveGoogleEvent, repairGoogleEvent, validateEventChange, availableCalendars } from './google-events.js';

async function bodyOf(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CalendarError('Send JSON.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new CalendarError('A request body is required.', 400);
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new CalendarError('Request is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new CalendarError('Invalid JSON.', 400); }
}
const exact = (body, keys) => { if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== [...keys].sort().join()) throw new CalendarError('Unexpected request fields.', 400); };
const result = error => { if (!(error instanceof CalendarError)) throw error; return Response.json({ error: error.message }, { status: error.status }); };

export function createCalendarApi({ readAppData, compareAndWriteAppData, googleSession, connectGoogle, now = () => Date.now() }) {
  async function preferences() {
    const row = await readAppData(SLUG, KEY);
    return { preferences: validatePreferences(row?.value ?? emptyPreferences()), updatedAt: row?.updated_at ?? null };
  }
  return {
    async GET(request, { owner }) {
      const saved = await preferences();
      let google;
      try {
        google = await googleSession(owner);
        const url = new URL(request.url);
        if (url.searchParams.get('detail')) {
          const calendarId = url.searchParams.get('calendarId'), id = url.searchParams.get('detail');
          if (!calendarId || !id || id.length > 300 || !((await availableCalendars(google)).some(c => c.id === calendarId))) throw new CalendarError('Calendar unavailable.', 403);
          return Response.json({ event: publicEvent(await google.get(calendarId, id), calendarId) });
        }
        const month = url.searchParams.get('month') ?? new Date(now()).toISOString().slice(0, 7);
        const data = await snapshot(google, saved.preferences, month, now());
        return Response.json({ ...saved, connection: 'connected', ...data });
      } catch (error) {
        if (!(error instanceof CalendarError)) throw error;
        let calendars = [];
        if (google) { try { calendars = await availableCalendars(google); } catch {} }
        return Response.json({ ...saved, connection: error.status === 428 ? 'required' : 'error', error: error.message, calendars, events: [], loadedAt: null });
      }
    },
    async POST(request, { owner }) {
      try {
        const body = await bodyOf(request);
        if (body?.op === 'connect') { exact(body, ['op']); return Response.json({ url: await connectGoogle(owner) }); }
        if (body?.op === 'preferences') {
          exact(body, ['op', 'value', 'expectedAt']);
          let value, expectedAt;
          try { value = validatePreferences(body.value); expectedAt = validateRevision(body.expectedAt); } catch (e) { throw new CalendarError(e.message, 400); }
          const updatedAt = await compareAndWriteAppData(SLUG, KEY, value, expectedAt);
          if (!updatedAt) throw new CalendarError('Preferences changed in another tab or chat. Download your draft, refresh, and reconcile.', 409);
          return Response.json({ saved: true, updatedAt });
        }
        if (body?.op === 'event') {
          exact(body, ['op', 'change']); validateEventChange(body.change);
          const saved = await preferences();
          const google = await googleSession(owner);
          return Response.json(await saveGoogleEvent(google, saved.preferences, owner, body.change, now()));
        }
        if (body?.op === 'repair') {
          exact(body, ['op', 'calendarId', 'eventId', 'etag']);
          const google = await googleSession(owner);
          return Response.json(await repairGoogleEvent(google, body.calendarId, body.eventId, body.etag, now()));
        }
        throw new CalendarError('Choose a supported calendar operation.', 400);
      } catch (error) { return result(error); }
    },
  };
}
