import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createAppApi } from '../src/lib/app-api-policy.js';
import { appAccess } from '../src/lib/workspace-policy.js';
import { createLaptopSalesApi } from '../src/private-apps/laptop-sales/api.js';
import { blankListing, checks, KEY, listingText, SLUG, validateInventory } from '../src/private-apps/laptop-sales/model.js';
import { createSupportWebhook, supportConfig } from '../src/private-apps/laptop-sales/support.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const listing = {
  ...blankListing, id: other, model: ' ThinkPad T480 ', specs: '16 GB RAM',
  condition: 'Light wear', price: '249.00', checkout: 'https://buy.stripe.com/abcd01234', stage: 'ready',
  checks: Object.fromEntries(Object.keys(checks).map(key => [key, true])),
};

test('validates the sell-ready bundle and keeps owner and unknown fields outside the record', () => {
  const [unit] = validateInventory([listing]);
  assert.equal(unit.model, 'ThinkPad T480');
  const copy = listingText(unit, 'support@example.com');
  for (const value of ['$249.00', 'LibreOffice', 'GIMP', unit.checkout, 'support@example.com']) assert.ok(copy.includes(value));
  for (const change of [
    { model: '' }, { price: '0' }, { price: '2.999' }, { owner_id: other },
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
    supportEmail: () => 'support@example.com',
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

const now = Date.parse('2026-11-10T10:00:00Z');
const secret = Buffer.from('laptop-sales-test-only-webhook-key');
const config = supportConfig({
  LAPTOP_SUPPORT_EMAIL: 'support@example.com', LAPTOP_SUPPORT_FROM: 'laptops@example.com',
  LAPTOP_SUPPORT_FORWARD: 'staff@example.com', LAPTOP_RESEND_API_KEY: 'test-key',
  LAPTOP_RESEND_WEBHOOK_SECRET: `whsec_${secret.toString('base64')}`,
});
const payload = {
  type: 'email.received',
  data: { email_id: owner, to: [config.inbox], message_id: '<message@example.org>', attachments: [] },
};
function signedRequest(event = payload, { tampered = false, at = now } = {}) {
  const body = JSON.stringify(event);
  const timestamp = String(at / 1000);
  const signature = createHmac('sha256', secret).update(`msg_test.${timestamp}.${body}`).digest('base64');
  return new Request('https://example.com/api/laptop-support', {
    method: 'POST', body: tampered ? body + ' ' : body,
    headers: { 'svix-id': 'msg_test', 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
  });
}
const email = {
  id: owner, created_at: new Date(now).toISOString(), to: [config.inbox], from: 'Buyer <buyer@example.org>',
  subject: 'Setup', text: 'Can you help me get started?', authentication: { dmarc: 'pass' }, headers: {},
};

test('signed webhook relays email and sends a threaded guide with stable retry keys', async () => {
  const attempts = [];
  let failGuide = true;
  const handle = createSupportWebhook({ config, clock: () => now, fetcher: async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    if (!options.method) {
      assert.equal(url, `https://api.resend.com/emails/receiving/${owner}?html_format=cid`);
      return Response.json(email);
    }
    const key = options.headers['Idempotency-Key'];
    attempts.push([key, JSON.parse(options.body)]);
    if (key.includes('/reply/') && failGuide) return Response.json({}, { status: 503 });
    return Response.json({ id: other });
  } });
  assert.equal((await handle(signedRequest())).status, 503);
  failGuide = false;
  assert.deepEqual(await (await handle(signedRequest())).json(), { result: 'relayed_and_replied' });
  assert.deepEqual(attempts.slice(0, 2), attempts.slice(2));
  assert.deepEqual(attempts[0][1].to, [config.forward]);
  assert.equal(attempts[0][1].reply_to, 'buyer@example.org');
  assert.deepEqual(attempts[1][1].to, ['buyer@example.org']);
  assert.equal(attempts[1][1].reply_to, config.inbox);
  assert.equal(attempts[1][1].headers['In-Reply-To'], '<message@example.org>');
  assert.match(attempts[1][1].text, /first-boot/);
});

test('webhook rejects forged and stale signatures and avoids automatic replies to risky messages', async () => {
  let received = email;
  const sent = [];
  const handle = createSupportWebhook({ config, clock: () => now, fetcher: async (_, options) => {
    if (!options.method) return Response.json(received);
    sent.push(JSON.parse(options.body));
    return Response.json({});
  } });
  assert.equal((await createSupportWebhook({ config: null })(signedRequest())).status, 503);
  assert.equal((await handle(signedRequest(payload, { tampered: true }))).status, 401);
  assert.equal((await handle(signedRequest(payload, { at: now - 301000 }))).status, 401);
  for (const change of [
    { to: ['other@example.com'] }, { headers: { 'auto-submitted': 'auto-replied' } },
    { created_at: new Date(now - 24 * 3600000).toISOString() },
  ]) {
    received = { ...email, ...change };
    assert.equal((await handle(signedRequest())).status, 200);
  }
  assert.equal(sent.length, 0);
  received = { ...email, authentication: { dmarc: 'fail' } };
  assert.deepEqual(await (await handle(signedRequest())).json(), { result: 'relayed' });
  assert.deepEqual(sent[0].to, [config.forward]);
  assert.equal(sent[0].reply_to, undefined);
  received = { ...email, subject: 'Refund my order' };
  assert.deepEqual(await (await handle(signedRequest())).json(), { result: 'relayed_and_replied' });
  assert.match(sent[2].text, /order reference/);
  received = { ...email, subject: 'Re: Refund my order', headers: { 'in-reply-to': '<older@example.org>' } };
  assert.deepEqual(await (await handle(signedRequest())).json(), { result: 'relayed' });
  assert.equal(sent.length, 4);
});
