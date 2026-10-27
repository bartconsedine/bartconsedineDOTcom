import { validateRevision } from '../../lib/record-revision.js';
import { KEY, MAX_BYTES, SLUG, validateScreen } from './model.js';

// The registry's shared dispatcher verifies admin access and exact-origin POST.
// Production dependencies also recheck auth, registry membership, and owner RLS.
export function createMorningApi({ readAppData, compareAndWriteAppData }) {
  return {
    async GET(_request, { dataOwnerId, permission } = {}) {
      const record = await readAppData(SLUG, KEY, dataOwnerId);
      if (record) validateScreen(record.value);
      const screen = record?.value ?? null;
      return Response.json({ screen, updatedAt: record?.updated_at ?? null, canEdit: permission !== 'viewer' });
    },
    async POST(request, { dataOwnerId } = {}) {
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return Response.json({ error: 'Send a JSON screen.' }, { status: 415 });
      const reader = request.body?.getReader();
      if (!reader) return Response.json({ error: 'A screen is required.' }, { status: 400 });
      let size = 0;
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) { await reader.cancel(); return Response.json({ error: 'Screen is too large.' }, { status: 413 }); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let screen, expectedAt;
      try {
        const body = JSON.parse(new TextDecoder().decode(bytes));
        if (!body || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'screen') || !Object.hasOwn(body, 'expectedAt')) throw new Error('Send screen and expectedAt from the latest read.');
        screen = validateScreen(body.screen);
        expectedAt = validateRevision(body.expectedAt);
      }
      catch (error) { return Response.json({ error: error instanceof SyntaxError ? 'Invalid JSON.' : error.message }, { status: 400 }); }
      const updatedAt = await compareAndWriteAppData(SLUG, KEY, screen, expectedAt, dataOwnerId);
      if (!updatedAt) return Response.json({ error: 'Your screen changed on another device or in chat. Copy your edits before reloading the saved screen.' }, { status: 409 });
      return Response.json({ saved: true, updatedAt });
    },
  };
}
