import { validateRevision } from '../../lib/record-revision.js';
import { boundedText } from '../robot-party/oauth-api.js';
import { KEY, SLUG, validateInventory } from './model.js';

export function createLaptopSalesApi({ readAppData, compareAndWriteAppData, supportEmail }) {
  return {
    async GET(_request, { dataOwnerId }) {
      const record = await readAppData(SLUG, KEY, dataOwnerId);
      return Response.json({
        listings: record ? validateInventory(record.value) : [],
        updatedAt: record?.updated_at ?? null,
        supportEmail: supportEmail(),
      });
    },
    async POST(request, { dataOwnerId }) {
      if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
        return Response.json({ error: 'Send JSON.' }, { status: 415 });
      }
      let listings, expectedAt;
      try {
        const body = JSON.parse(await boundedText(request, 150000));
        if (!body || Object.keys(body).sort().join(',') !== 'expectedAt,listings') throw Error('Invalid inventory request.');
        listings = validateInventory(body.listings);
        expectedAt = validateRevision(body.expectedAt);
      } catch (error) {
        return Response.json({ error: error instanceof SyntaxError ? 'Invalid JSON.' : error.message }, { status: 400 });
      }
      const updatedAt = await compareAndWriteAppData(SLUG, KEY, listings, expectedAt, dataOwnerId);
      if (!updatedAt) return Response.json({ error: 'Inventory changed elsewhere. Copy your edits before reloading.' }, { status: 409 });
      return Response.json({ listings, updatedAt });
    },
  };
}
