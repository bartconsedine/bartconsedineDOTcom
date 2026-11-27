import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beginGoogle, readGoogleFlow, googleClaims } from '../src/lib/cognito-oauth.js';

const config = { domain: 'https://example.auth.us-east-1.amazoncognito.com', clientId: 'example', callback: 'https://example.org/auth/callback' };
const google = { providerName: 'Google', providerType: 'Google', userId: 'original-google-sub' };
const claims = { sub: 'cognito-user-id', origin_jti: 'cognito-session-id', iss: 'pool', aud: 'client', token_use: 'id',
  nonce: 'original', email: 'Member@example.org', email_verified: true, identities: [google] };
test('Google federation binds state, verifier and nonce to each sign-in', () => {
  const a = beginGoogle(config), b = beginGoogle(config);
  const url = new URL(a.url), state = url.searchParams.get('state');
  const { verifier, nonce } = readGoogleFlow(a.cookie, state);
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.get('identity_provider'), 'Google');
  assert.equal(url.searchParams.get('nonce'), nonce);
  assert.equal(url.searchParams.get('redirect_uri'), config.callback);
  assert.throws(() => readGoogleFlow(b.cookie, state));
  assert.throws(() => readGoogleFlow(null, null));
  assert.throws(() => googleClaims(claims, nonce));
  assert.equal(googleClaims(claims, 'original').subject, google.userId);
  for (const change of [{ email_verified: false }, { identities: [] }, { identities: [google, google] },
    { identities: [{ ...google, providerType: 'Other' }] }]) {
    assert.throws(() => googleClaims({ ...claims, ...change }, 'original'));
  }
});

test('Cognito Google subjects resolve to restored owner UUIDs, with existing RLS and cross-owner denial', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec('create role anon; create role authenticator; create role authenticated');
    await db.exec(await readFile(new URL('./fixtures/auth.sql', import.meta.url), 'utf8'));
    await db.exec(`alter table auth.users add deleted_at timestamptz, add banned_until timestamptz;
      alter table auth.identities add provider_id text;
      insert into auth.users(id,email,email_confirmed_at) values ('${owner}','member@example.org',now()), ('${other}','other@example.org',now());
      insert into auth.identities select id,'google',jsonb_build_object('sub','original-google-sub','email',email,'email_verified',true),'original-google-sub' from auth.users where id='${owner}';
      create table public.items(owner_id uuid, value text);
      insert into public.items values ('${owner}','mine'), ('${other}','private');
      alter table public.items enable row level security;
      create policy own on public.items to authenticated using (owner_id = auth.uid());
      grant select,update on public.items to authenticated;
      set bartsite.cognito_issuer='pool'; set bartsite.cognito_client='client';`);
    await db.exec(await readFile(new URL('../deploy/aws/cognito-owners.sql', import.meta.url), 'utf8'));
    const bind = (payload, query) => db.transaction(async tx => {
      await tx.exec('set local role id');
      await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(payload)]);
      await tx.exec('select cognito_bridge.bind_cognito_owner()');
      return tx.query(query);
    });
    assert.deepEqual((await bind(claims, 'select value,public.cognito_workspace_owner() as owner from items')).rows, [{ value: 'mine', owner }]);
    assert.equal((await bind(claims, `update items set value='other' where owner_id='${other}' returning *`)).rows.length, 0);
    for (const change of [{ iss:'different' }, {aud:'different'}, { email_verified:false }, { token_use:'access' },
      { identities: [{ ...google, userId: 'different-sub' }] }, { email: 'other@example.org' }]) {
      await assert.rejects(bind({ ...claims, ...change }, 'select * from items'), /Unverified identity|Workspace owner unavailable/);
    }
  } finally { await db.close(); }
});
