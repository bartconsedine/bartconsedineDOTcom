import { validateRevision } from '../../lib/app-data-contracts.js';
import { KEY, MAX_BYTES, SLUG, validatePlan } from './model.js';

// The registry's shared dispatcher verifies admin access and exact-origin POST.
// Production dependencies also recheck auth, registry membership, and owner RLS.
export function createTripApi({ readAppData, compareAndWriteAppData, startingPlan = () => null }) {
  return {
    async GET(_request, { owner } = {}) {
      const record = await readAppData(SLUG, KEY);
      if (record) validatePlan(record.value);
      const plan = record?.value ?? startingPlan(owner);
      if (plan) validatePlan(plan);
      return Response.json({ plan, updatedAt: record?.updated_at ?? null });
    },
    async POST(request) {
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return Response.json({ error: 'Send a JSON plan.' }, { status: 415 });
      const reader = request.body?.getReader();
      if (!reader) return Response.json({ error: 'A plan is required.' }, { status: 400 });
      let size = 0;
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) { await reader.cancel(); return Response.json({ error: 'Plan is too large.' }, { status: 413 }); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let plan, expectedAt;
      try {
        const body = JSON.parse(new TextDecoder().decode(bytes));
        if (!body || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'plan') || !Object.hasOwn(body, 'expectedAt')) throw new Error('Send plan and expectedAt from the latest read.');
        plan = validatePlan(body.plan);
        expectedAt = validateRevision(body.expectedAt);
      }
      catch (error) { return Response.json({ error: error instanceof SyntaxError ? 'Invalid JSON.' : error.message }, { status: 400 }); }
      const updatedAt = await compareAndWriteAppData(SLUG, KEY, plan, expectedAt);
      if (!updatedAt) return Response.json({ error: 'Your plan changed in another tab or chat. Export your edits, then reload and reconcile before saving.' }, { status: 409 });
      return Response.json({ saved: true, updatedAt });
    },
  };
}
