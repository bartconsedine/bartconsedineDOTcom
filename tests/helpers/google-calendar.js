import { CalendarError } from '../../src/private-apps/calendar-companion/google-client.js';

export function fakeGoogle() {
  const rows = new Map(); let tick = 0, failKind = null;
  const log = [], primary = { id: 'family@example.com', summary: 'Personal', accessRole: 'owner', primary: true, timeZone: 'America/New_York', backgroundColor: '#c3dec0' };
  const rowKey = (calendar, id) => `${calendar}:${id}`;
  const getRow = (calendar, id) => {
    const row = rows.get(rowKey(calendar, id));
    if (!row) throw new CalendarError('missing', 404);
    return structuredClone(row);
  };
  const store = (calendar, body) => {
    const result = { ...structuredClone(body), etag: `"${++tick}"`, htmlLink: `https://calendar.google.com/calendar/event?eid=${body.id}` };
    rows.set(rowKey(calendar, body.id), result); return structuredClone(result);
  };
  return { rows, log, primary, fail(kind) { failKind = kind; },
    seed(calendar, body) { return store(calendar, body); },
    async calendars() { return [primary, { id: 'read-only', summary: 'Work', accessRole: 'reader' }]; },
    async events(calendar, from, to) {
      return [...rows].filter(([key]) => key.startsWith(calendar + ':')).map(([, row]) => structuredClone(row)).filter(e => {
        const start = Date.parse(e.start?.dateTime ?? `${e.start?.date}T00:00:00Z`), end = Date.parse(e.end?.dateTime ?? `${e.end?.date}T00:00:00Z`);
        return e.status !== 'cancelled' && (e.recurrence || start < Date.parse(to) && end > Date.parse(from));
      });
    },
    async get(calendar, id) { log.push(['get', calendar, id]); return getRow(calendar, id); },
    async insert(calendar, body) {
      log.push(['insert', calendar, body.id]);
      if (body.extendedProperties?.shared?.ccKind === failKind) throw new CalendarError('simulated Google failure');
      if (rows.has(rowKey(calendar, body.id))) throw new CalendarError('exists', 409);
      return store(calendar, body);
    },
    async patch(calendar, id, body, etag) {
      log.push(['patch', calendar, id, etag]);
      const old = getRow(calendar, id);
      if (old.etag !== etag) throw new CalendarError('stale Google event', 409);
      if ((body.extendedProperties?.shared?.ccKind ?? old.extendedProperties?.shared?.ccKind) === failKind) throw new CalendarError('simulated Google failure');
      return store(calendar, { ...old, ...structuredClone(body), id });
    },
    async remove(calendar, id, etag) {
      const old = getRow(calendar, id); if (old.etag !== etag) throw new CalendarError('stale', 409);
      rows.set(rowKey(calendar, id), { ...old, status: 'cancelled' });
    },
  };
}
