import { KEY, MAX_BYTES, SLUG, validatePlan } from './model.js';

// The registry's shared dispatcher verifies admin access and exact-origin POST.
// Production dependencies also recheck auth, registry membership, and owner RLS.
export function createTripApi({ readAppData, writeAppData, startingPlan = () => null }) {
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
      let plan;
      try { plan = validatePlan(JSON.parse(new TextDecoder().decode(bytes))); }
      catch (error) { return Response.json({ error: error instanceof SyntaxError ? 'Invalid JSON.' : error.message }, { status: 400 }); }
      await writeAppData(SLUG, KEY, plan);
      return Response.json({ saved: true });
    },
  };
}
