import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppApi } from '../src/lib/app-api-policy.js';
import { appAccess } from '../src/lib/workspace-policy.js';
import { createLaptopSalesApi } from '../src/private-apps/laptop-sales/api.js';
import { blankListing, checks, KEY, listingText, SLUG, validateInventory } from '../src/private-apps/laptop-sales/model.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const listing = {
  ...blankListing, id: other, model: ' ThinkPad T480 ', specs: '16 GB RAM',
  condition: 'Light wear', supportEmail: 'support@example.com', price: '249.00', checkout: 'https://buy.stripe.com/abcd01234', stage: 'ready',
  checks: Object.fromEntries(Object.keys(checks).map(key => [key, true])),
};

test('validates the sell-ready bundle and keeps owner and unknown fields outside the record', () => {
  const [unit] = validateInventory([listing]);
  assert.equal(unit.model, 'ThinkPad T480');
  const copy = listingText(unit);
  for (const value of ['$249.00', 'LibreOffice', 'GIMP', unit.checkout, 'support@example.com']) assert.ok(copy.includes(value));
  for (const change of [
    { supportEmail: 'bad\n@example.com' }, { model: '' }, { price: '0' }, { price: '2.999' }, { owner_id: other },
    { checkout: 'https://buy.stripe.com.evil.example/abcd01234' }, { checkout: 'https://buy.stripe.com/test_abcd01234' },
    { checks: { ...listing.checks, wiped: false } }, { stage: ['ready'] },
  ]) assert.throws(() => validateInventory([{ ...listing, ...change }]));
  assert.throws(() => validateInventory([listing, { ...listing, id: owner }]), /unique live/);
  assert.equal(validateInventory([{ ...blankListing, model: 'Used laptop', id: other }])[0].stage, 'draft');
});

test('guarded inventory persists per owner, rejects stale writes, and reports database failures', async () => {
  const records = new Map();
  const revision = '2026-11-10T10:00:00.000Z';
  let active = owner;
  let unavailable = false;
  const api = createLaptopSalesApi({
    readAppData: async (slug, key, id) => {
      assert.deepEqual([slug, key, id], [SLUG, KEY, active]);
      if (unavailable) throw Error('internal DB details');
      return records.get(id);
    },
    compareAndWriteAppData: async (slug, key, value, expectedAt, id) => {
      assert.deepEqual([slug, key, id], [SLUG, KEY, active]);
      if (unavailable) throw Error('internal DB details');
      if ((records.get(id)?.updated_at ?? null) !== expectedAt) return null;
      records.set(id, { value, updated_at: revision });
      return revision;
    },
  });
  const site = 'https://example.com';
  const workspace = () => active
    ? { ok: true, isAdmin: true, grants: [], user: { id: active } }
    : { ok: false, status: 401, reason: 'unauthenticated' };
  const handle = createAppApi({
    checkAdmin: async () => workspace(), siteOrigin: () => site,
    getApp: async (slug, ownerId) => {
      const access = appAccess(workspace(), slug, ownerId);
      return access.ok ? { slug, access, api } : null;
    },
  });
  const call = (body, { origin = site, target = active } = {}) => handle(
    new Request(`${site}/api/admin/apps/${SLUG}${target ? `?owner=${target}` : ''}`, body ? {
      method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body),
    } : undefined), { params: Promise.resolve({ slug: SLUG }) },
  );
  const submission = { listings: [listing], expectedAt: null };
  assert.deepEqual((await (await call()).json()).listings, []);
  assert.equal((await call(submission, { origin: 'https://foreign.example' })).status, 403);
  assert.equal((await call({ ...submission, listings: [{ ...listing, checkout: '' }] })).status, 400);
  assert.equal((await call({ ...submission, extra: true })).status, 400);
  assert.equal((await call(submission)).status, 200);
  const reload = await call();
  assert.match(reload.headers.get('cache-control'), /private, no-store/);
  assert.deepEqual((await reload.json()).listings, validateInventory([listing]));
  assert.equal((await call(submission)).status, 409);
  active = other;
  assert.equal((await call(null, { target: owner })).status, 404);
  assert.equal((await call(submission, { target: owner })).status, 404);
  assert.deepEqual((await (await call()).json()).listings, []);
  unavailable = true;
  assert.deepEqual(await (await call()).json(), { error: 'unavailable' });
  assert.equal((await call(submission)).status, 503);
  active = null;
  assert.equal((await call()).status, 401);
});


test('laptop editor preserves a conflict draft, confirms saved reload, and keeps viewers read-only', async () => {
  const { laptopUi, nodes, button } = await import('./helpers/trip-ui.js');
  let stored = [], status = 409;
  const fetcher = async (_url, options) => {
    if (options.method === 'POST') {
      if (status !== 200) return Response.json({ error: 'Inventory changed elsewhere.' }, { status });
      stored = JSON.parse(options.body).listings;
      return Response.json({ listings: stored, updatedAt: '2026-11-18T12:00:00Z' });
    }
    return Response.json({ listings: stored, updatedAt: stored.length ? '2026-11-18T12:00:00Z' : null });
  };
  const ui = laptopUi(fetcher, { workspaceOwner: owner });
  try {
    await ui.mount(); button(ui.render(), '+ Add laptop').props.onClick();
    const model = nodes(ui.render()).find(node => node.type === 'input' && node.props.placeholder.includes('ThinkPad'));
    model.props.onChange({ target: { value: 'Used ThinkPad' } });
    await nodes(ui.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(nodes(ui.render()).find(node => node.type === 'input' && node.props.placeholder.includes('ThinkPad')).props.value, 'Used ThinkPad');
    assert.ok(nodes(ui.render()).some(node => node.props.role === 'alert'));
    status = 503;
    await nodes(ui.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(nodes(ui.render()).find(node => node.type === 'input' && node.props.placeholder.includes('ThinkPad')).props.value, 'Used ThinkPad');
    status = 200;
    await nodes(ui.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(stored[0].model, 'Used ThinkPad');
    assert.equal(nodes(ui.render()).some(node => node.type === 'form'), false);
    const viewer = laptopUi(fetcher, { workspaceOwner: owner, permission: 'viewer' });
    try {
      await viewer.mount();
      assert.equal(button(viewer.render(), '+ Add laptop'), undefined);
      const row = nodes(viewer.render()).find(node => node.type === 'button' && node.props['aria-pressed'] === false);
      row.props.onClick(); assert.equal(button(viewer.render(), 'Edit laptop'), undefined);
      assert.ok(nodes(viewer.render()).some(node => node.type === 'h3' && node.props.children === 'Used ThinkPad'));
    } finally { viewer.close(); }
  } finally { ui.close(); }
});

test('shared laptop API denies viewer saves before invoking persistence', async () => {
  let writes = 0;
  const workspace = { ok: true, isAdmin: false, user: { id: other }, grants: [{ app_slug: SLUG, owner_id: owner, role: 'viewer' }] };
  const handle = createAppApi({
    checkAdmin: async () => workspace, siteOrigin: () => 'https://example.com',
    getApp: async (slug, requested) => {
      const access = appAccess(workspace, slug, requested);
      return access.ok ? { slug, access, api: createLaptopSalesApi({
        readAppData: async (_slug, _key, id) => { assert.equal(id, owner); return { value: [], updated_at: null }; },
        compareAndWriteAppData: async () => { writes++; throw Error('Viewer write reached persistence'); },
      }) } : null;
    },
  });
  const url = `https://example.com/api/admin/apps/${SLUG}?owner=${owner}`;
  const context = { params: Promise.resolve({ slug: SLUG }) };
  assert.equal((await handle(new Request(url), context)).status, 200);
  const denied = await handle(new Request(url, { method: 'POST', headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: JSON.stringify({ listings: [], expectedAt: null }) }), context);
  assert.equal(denied.status, 403); assert.equal(writes, 0);
});
