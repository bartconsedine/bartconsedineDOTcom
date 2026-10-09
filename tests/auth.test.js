import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { googleIdentityDecision, verifyAdmin } from '../src/lib/auth-policy.js';

const emails = ['bartconsedine@gmail.com', 'mjshah8@gmail.com'];
const userFor = email => ({ id: email, email, email_confirmed_at: '2026-10-09T00:00:00Z', identities: [{ provider: 'google', identity_data: { email, email_verified: true } }] });
const user = userFor(emails[0]);
const clientFor = (user, allowed = true) => ({
  auth: { getUser: async () => ({ data: { user }, error: null }), getSession: () => assert.fail('Do not trust local sessions') },
  rpc: async name => { assert.equal(name, 'is_site_admin'); return { data: allowed, error: null }; },
});

test('both confirmed Google admins require live DB membership', async () => {
  for (const email of emails) {
    const client = clientFor(userFor(email));
    assert.equal((await verifyAdmin(client)).ok, true);
    client.rpc = async () => ({ data: false });
    assert.equal((await verifyAdmin(client)).status, 403, 'revocation applies without refreshing JWT');
  }
  assert.equal(googleIdentityDecision({ ...user, email: user.email.toUpperCase() }).ok, true);
});
test('OAuth config needs no enrolled UUID or owner environment variables', () => {
  const output = execFileSync(process.execPath, ['--conditions=react-server', '--input-type=module', '-e', `
    import { authConfig } from './src/lib/auth-config.js';
    delete process.env.OWNER_USER_ID; delete process.env.OWNER_EMAIL;
    console.log(JSON.stringify(authConfig()));
  `], { cwd: new URL('../', import.meta.url), env: { ...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key', SITE_URL: 'https://bartconsedine.com' } });
  assert.equal(JSON.parse(output).siteUrl, 'https://bartconsedine.com');
});
test('missing configuration and missing session fail closed', async () => {
  assert.equal((await verifyAdmin(null)).status, 503);
  const client = clientFor(null);
  client.rpc = () => assert.fail('No membership lookup without verified identity');
  assert.equal((await verifyAdmin(client)).status, 401);
});
test('expired or forged sessions never reach membership lookup', async () => {
  for (const message of ['JWT expired', 'Invalid JWT signature', 'Refresh token not found']) {
    const client = clientFor(user);
    client.auth.getUser = async () => ({ data: { user }, error: { status: 401, message } });
    client.rpc = () => assert.fail('Rejected session cannot authorize');
    assert.equal((await verifyAdmin(client)).status, 401);
  }
});
test('unapproved users and metadata spoofing never confer membership', async () => {
  for (const email of [...emails, 'other@example.com']) {
    assert.equal((await verifyAdmin(clientFor({ ...userFor(email), user_metadata: { role: 'admin', owner: true } }, false))).status, 403);
  }
});
test('unconfirmed, anonymous, missing or mismatched Google identity rejected before DB', async () => {
  for (const invalid of [
    { ...user, email_confirmed_at: null }, { ...user, is_anonymous: true }, { ...user, email: 'changed@example.com' },
    { ...user, identities: [] }, { ...user, identities: [{ provider: 'email' }] },
    ...[false, 'true', undefined].map(email_verified => ({ ...user, identities: [{ provider: 'google', identity_data: { email: user.email, email_verified } }] })),
  ]) {
    const client = clientFor(invalid);
    client.rpc = () => assert.fail('Invalid identity must fail first');
    assert.equal((await verifyAdmin(client)).status, 403);
  }
});
test('Auth or DB outages and malformed membership responses fail closed', async () => {
  for (const data of [null, undefined, 'true', 1, {}, []]) {
    const client = clientFor(user); client.rpc = async () => ({ data });
    assert.equal((await verifyAdmin(client)).status, 403);
  }
  for (const fail of [
    client => { client.auth.getUser = async () => { throw new Error('offline'); }; },
    client => { client.auth.getUser = async () => ({ error: { status: 503 } }); },
    client => { client.rpc = async () => ({ error: { message: 'missing migration' } }); },
    client => { client.rpc = async () => { throw new Error('offline'); }; },
  ]) {
    const client = clientFor(user); fail(client);
    assert.equal((await verifyAdmin(client)).status, 503);
  }
});
