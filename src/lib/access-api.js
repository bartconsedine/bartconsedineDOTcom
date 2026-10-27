import { validateRevision } from './record-revision.js';
export function validateGrantChange(body) {
  const fields = body?.action === 'invite' ? ['action', 'slug', 'email', 'role'] : body?.action === 'change' ? ['action', 'slug', 'email', 'role', 'expectedAt'] : body?.action === 'revoke' ? ['action', 'slug', 'email', 'expectedAt'] : [];
  if (!body || !fields.length || Object.keys(body).length !== fields.length || Object.keys(body).some(k => !fields.includes(k))) throw new Error('Invalid access change.');
  if (typeof body.slug !== 'string' || body.slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) throw new Error('Choose an installed app.');
  if (typeof body.email !== 'string') throw new Error('Enter a valid email address.');
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (body.action !== 'revoke' && !['viewer', 'editor'].includes(body.role)) throw new Error('Choose view or edit access.');
  if (body.action !== 'invite' && validateRevision(body.expectedAt) === null) throw new Error('Reload access before changing it.');
  return { ...body, email };
}
export function createAccessApi({ checkAdmin, listApps, storage, siteOrigin }) {
  return async request => {
    const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
    try {
      const admin = await checkAdmin();
      if (!admin.ok) return reply({ error: admin.reason }, admin.status);
      if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'method_not_allowed' }, 405);
      if (request.method === 'POST' && (!siteOrigin() || request.headers.get('origin') !== siteOrigin() || request.headers.get('sec-fetch-site') === 'cross-site')) return reply({ error: 'invalid_origin' }, 403);
      const apps = (await listApps()).filter(app => !app.role || app.role === 'owner');
      if (request.method === 'GET') return reply({ apps: apps.map(({ slug, name }) => ({ slug, name })), grants: await storage.list(admin.user.id), ownerId: admin.user.id });
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply({ error: 'Send JSON.' }, 415);
      let body;
      try {
        const reader = request.body?.getReader();
        if (!reader) throw new Error('A change is required.');
        let size = 0; const chunks = [];
        try {
          while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 4096) { await reader.cancel(); return reply({ error: 'Request too large.' }, 413); } chunks.push(value); }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        body = validateGrantChange(JSON.parse(new TextDecoder().decode(bytes)));
      } catch (e) { return reply({ error: e instanceof SyntaxError ? 'Invalid JSON.' : e.message }, 400); }
      if (body.action !== 'revoke' && !apps.some(app => app.slug === body.slug)) return reply({ error: 'not_found' }, 404);
      if (body.email === admin.user.email?.toLowerCase()) return reply({ error: 'You already own this app.' }, 400);
      const saved = await storage.change(admin.user.id, body);
      if (!saved) return reply({ error: 'Access changed elsewhere or already exists. Reload the access list and try again.' }, 409);
      return reply({ saved: true });
    } catch (error) {
      return reply({ error: error.code === '42P01' || error.code === 'PGRST205' ? 'Sharing setup is pending. The reviewed database migration must be applied before inviting people.' : 'Could not update or load access. Your input is still available; retry after checking your connection.' }, 503);
    }
  };
}
