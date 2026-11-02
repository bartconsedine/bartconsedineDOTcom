import { timingSafeEqual } from 'node:crypto';

// Only warms the shared PUBLIC source cache. No owner, device or progress data.
export function createTldrRefreshApi({ getTldr, secret }) {
  return async request => {
    const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
    const configured = secret();
    if (!configured) return reply({ error: 'Scheduled news refresh is not configured.' }, 503);
    const expected = Buffer.from(`Bearer ${configured}`);
    const actual = Buffer.from(request.headers.get('authorization') || '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply({ error: 'Unauthorized.' }, 401);
    if (new URL(request.url).search) return reply({ error: 'This job checks latest issues only.' }, 400);
    try {
      // A stale cache hit starts Next's background revalidation; a cold miss waits.
      // Failed source refreshes keep the last successful entry for that edition.
      const { sources } = await getTldr(0);
      return reply({ state: 'checked', sources }, sources.some(source => source.status === 'unavailable') ? 503 : 200);
    } catch {
      return reply({ error: 'News source check failed.' }, 503);
    }
  };
}
