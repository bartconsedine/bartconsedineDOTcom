const ROOT = 'https://www.googleapis.com/calendar/v3';
export class CalendarError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}
export function createGoogleClient(token, fetcher = fetch) {
  async function request(path, { method = 'GET', body, etag } = {}) {
    if (!path.startsWith('/') || path.includes('://')) throw new CalendarError('Invalid Google resource.', 400);
    let response;
    try {
      response = await fetcher(`${ROOT}${path}`, { method, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}), ...(etag ? { 'If-Match': etag } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new CalendarError('Google could not confirm this request. Refresh before retrying a write. Your form is preserved.'); }
    if (response.status === 401) throw new CalendarError('Google access expired. Reconnect Google Calendar.', 428);
    if (response.status === 403) throw new CalendarError('Google denied access. Check calendar permissions, consent scopes and Calendar API setup.', 403);
    if (response.status === 412) throw new CalendarError('This event changed in Google Calendar. Refresh and reconcile your edits.', 409);
    if (response.status === 404 || response.status === 410) throw new CalendarError('This Google event no longer exists. Refresh your calendar.', 404);
    if (!response.ok) throw new CalendarError(response.status === 409 ? 'This event already exists.' : 'Google Calendar is unavailable. Retry after refreshing.', response.status === 409 ? 409 : 503);
    return response.status === 204 ? null : response.json();
  }
  async function pages(path) {
    const items = []; let pageToken;
    for (let i = 0; i < 10; i++) {
      const url = `${path}${path.includes('?') ? '&' : '?'}maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const page = await request(url); items.push(...(page.items ?? [])); pageToken = page.nextPageToken;
      if (!pageToken) return items;
    }
    throw new CalendarError('This calendar has too many events to load completely. Choose a less busy calendar; planning is disabled until a full load succeeds.');
  }
  const eventPath = (calendar, id = '') => `/calendars/${encodeURIComponent(calendar)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;
  return {
    calendars: () => pages('/users/me/calendarList'),
    events: (calendar, from, to) => pages(`${eventPath(calendar)}?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}`),
    get: (calendar, id) => request(eventPath(calendar, id)),
    insert: (calendar, body) => request(`${eventPath(calendar)}?sendUpdates=none`, { method: 'POST', body }),
    patch: (calendar, id, body, etag) => { if (!etag) throw new CalendarError('Refresh before editing this event.', 409); return request(`${eventPath(calendar, id)}?sendUpdates=none`, { method: 'PATCH', body, etag }); },
    remove: (calendar, id, etag) => { if (!etag) throw new CalendarError('Refresh before changing this event.', 409); return request(eventPath(calendar, id), { method: 'DELETE', etag }); },
  };
}
