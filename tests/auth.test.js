import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerDecision, verifyOwner } from '../src/lib/auth-policy.js';

const id = '11111111-1111-4111-8111-111111111111';
const email = 'bartconsedine@gmail.com';
const user = { id, email, email_confirmed_at: '2026-10-09T00:00:00Z', identities: [{ provider: 'google' }] };
const verified = user => ({ getUser: async () => ({ data: { user }, error: null }) });

test('allows only the verified Google owner', async () => {
  assert.equal((await verifyOwner(verified(user), id, email)).ok, true);
  assert.equal(ownerDecision({ ...user, email: 'BartConsedine@gmail.com' }, id, email).ok, true);
});
test('configuration must be complete and fails closed', async () => {
  assert.equal((await verifyOwner(null, id, email)).status, 503);
  assert.equal((await verifyOwner(verified(user), '', email)).status, 503);
  assert.equal((await verifyOwner(verified(user), id, '')).status, 503);
});
test('missing session is rejected', async () => {
  assert.equal((await verifyOwner(verified(null), id, email)).status, 401);
});
test('expired or forged session rejected by auth service cannot grant access', async () => {
  for (const message of ['JWT expired', 'Invalid JWT signature', 'Refresh token not found']) {
    const auth = { getUser: async () => ({ data: { user }, error: { status: 401, message } }) };
    assert.equal((await verifyOwner(auth, id, email)).status, 401);
  }
});
test('another Google user cannot become owner through metadata', async () => {
  const stranger = { ...user, id: '22222222-2222-4222-8222-222222222222', user_metadata: { role: 'admin', owner: true } };
  assert.equal((await verifyOwner(verified(stranger), id, email)).status, 403);
});
test('email alone is insufficient, and owner email changes revoke access', () => {
  assert.equal(ownerDecision({ ...user, id: 'other' }, id, email).status, 403);
  assert.equal(ownerDecision({ ...user, email: 'other@example.com' }, id, email).status, 403);
});
test('unverified, anonymous, and non-Google identities are rejected', () => {
  for (const invalid of [{ ...user, email_confirmed_at: null }, { ...user, is_anonymous: true }, { ...user, identities: [{ provider: 'email' }] }]) {
    assert.equal(ownerDecision(invalid, id, email).status, 403);
  }
});
test('provider outage does not fall back to trusting cookies', async () => {
  assert.equal((await verifyOwner({ getUser: async () => { throw new Error('offline'); } }, id, email)).status, 503);
  assert.equal((await verifyOwner({ getUser: async () => ({ error: { status: 503 } }) }, id, email)).status, 503);
});
