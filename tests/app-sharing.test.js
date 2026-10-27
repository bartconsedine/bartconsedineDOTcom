import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyWorkspace, appAccess, visibleApps } from '../src/lib/workspace-policy.js';
import { createAccessApi, validateGrantChange } from '../src/lib/access-api.js';
import { createAppApi } from '../src/lib/app-api-policy.js';
const ownerId = '11111111-1111-4111-8111-111111111111', guestId = '33333333-3333-4333-8333-333333333333';
const user = { id: guestId, email: 'guest@example.com', email_confirmed_at: '2026-01-01', identities: [{ provider: 'google', identity_data: { email: 'guest@example.com', email_verified: true } }] };
const grant = { owner_id: ownerId, app_slug: 'japan-trip', role: 'viewer' };
const client = (admin, grants, override = {}) => ({ auth: { getUser: async () => ({ data: { user }, ...override }) }, rpc: async name => name === 'is_site_admin' ? { data: admin } : grants });

test('verified guests only see invited apps and resolve the granted owner, never their own records', async () => {
  const access = await verifyWorkspace(client(false, { data: [grant] }));
  assert.equal(access.ok, true); assert.equal(access.isAdmin, false);
  const entries = [{ slug: 'japan-trip', name: 'Japan', description: 'Trip', privateConfig: 'secret' }, { slug: 'hidden-app', name: 'Hidden', description: 'Private' }];
  const apps = visibleApps(entries, access);
  assert.equal(apps.length, 1); assert.equal(apps[0].ownerId, ownerId);
  assert.ok(!JSON.stringify(apps).includes('secret')); assert.ok(!JSON.stringify(apps).includes('Hidden'));
  assert.equal(appAccess(access, 'japan-trip').role, 'viewer');
  assert.equal(appAccess(access, 'japan-trip', guestId).ok, false);
  assert.equal(appAccess(access, 'hidden-app', ownerId).ok, false);
  assert.equal(appAccess(access, 'japan-trip', 'not-a-uuid').ok, false);
  const revoked = await verifyWorkspace(client(false, { data: [] })); assert.equal(revoked.ok, false);
});

test('identity errors, forged identity, grant outages and malformed grants fail closed', async () => {
  assert.equal((await verifyWorkspace(null)).status, 503);
  assert.equal((await verifyWorkspace(client(false, { data: [grant] }, { error: { status: 401 } }))).status, 401);
  const invalid = client(false, { data: [grant] }); invalid.auth.getUser = async () => ({ data: { user: { ...user, identities: [] } } });
  assert.equal((await verifyWorkspace(invalid)).ok, false);
  for (const data of [{ data: [{ ...grant, role: 'admin' }] }, { error: { code: 'unavailable' } }, { data: null }]) assert.equal((await verifyWorkspace(client(false, data))).ok, false);
  assert.equal((await verifyWorkspace(client(true, { error: { code: 'PGRST202' } }))).sharingReady, false);
  assert.equal((await verifyWorkspace(client(false, { error: { code: 'PGRST202' } }))).ok, false);
});

test('viewer POST and direct hidden-app URLs are denied before app handlers run; editors receive the authorized owner', async () => {
  let permission = 'viewer', calls = 0;
  const access = await verifyWorkspace(client(false, { data: [grant] }));
  const handle = createAppApi({ checkAdmin: async () => access, siteOrigin: () => 'https://site.example', getApp: async slug => slug === 'japan-trip' ? { slug, access: { ownerId, role: permission }, api: { POST: async (_r, ctx) => { calls++; assert.equal(ctx.dataOwnerId, ownerId); assert.equal(ctx.owner.id, guestId); return Response.json({saved:true}); } } } : null });
  const request = () => new Request('https://site.example/api/admin/apps/japan-trip', { method: 'POST', headers: { origin: 'https://site.example' } });
  assert.equal((await handle(request(), { params: Promise.resolve({slug:'japan-trip'}) })).status, 403); assert.equal(calls, 0);
  permission = 'editor'; assert.equal((await handle(request(), {params:Promise.resolve({slug:'japan-trip'})})).status, 200); assert.equal(calls, 1);
  assert.equal((await handle(request(), {params:Promise.resolve({slug:'hidden-app'})})).status, 404);
});

function apiHarness() {
  let admin = true, fail = false, record = null;
  const handle = createAccessApi({ checkAdmin: async () => admin ? {ok:true,user:{id:ownerId,email:'owner@example.com'}} : {ok:false,status:403,reason:'forbidden'}, listApps: async () => [{slug:'japan-trip',name:'Japan',role:'owner'}], siteOrigin: () => 'https://site.example', storage: {
    list: async id => { assert.equal(id,ownerId); if(fail) throw new Error('private error'); return record ? [record] : []; },
    change: async (id, body) => { assert.equal(id,ownerId); if(fail) throw new Error('private error'); if(body.action === 'invite' && record || body.action !== 'invite' && body.expectedAt !== record?.updated_at) return false; record = body.action === 'revoke' ? null : {app_slug:body.slug,invited_email:body.email,role:body.role,updated_at:'2026-10-26T23:00:00.123456Z'}; return true; },
  } });
  const post = (body, origin = 'https://site.example') => handle(new Request('https://site.example/api/admin/access', {method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
  return {post,handle,deny(){admin=false;},fail(){fail=true;},get record(){return record;}};
}

test('app invites persist confirmed changes, guard stale roles/revocations and reject owner/permission injection', async () => {
  const h=apiHarness(); const invite={action:'invite',slug:'japan-trip',email:' Guest@Example.com ',role:'viewer'};
  assert.equal((await h.post(invite)).status,200); assert.equal(h.record.invited_email,'guest@example.com');
  assert.equal((await h.post(invite)).status,409);
  assert.equal((await h.post({...invite,action:'change',expectedAt:'2026-01-01T00:00:00Z'})).status,409);
  assert.equal((await h.post({...invite,action:'change',role:'editor',expectedAt:h.record.updated_at})).status,200); assert.equal(h.record.role,'editor');
  for(const body of [{...invite,owner_id:guestId},{...invite,role:'admin'},{...invite,slug:'hidden-app'},{...invite,email:'bad'}]) assert.ok((await h.post(body)).status >=400);
  assert.equal((await h.post(invite,'https://evil.example')).status,403);
  const revision=h.record.updated_at; assert.equal((await h.post({action:'revoke',slug:'japan-trip',email:'guest@example.com',expectedAt:revision})).status,200); assert.equal(h.record,null);
  h.deny();assert.equal((await h.post(invite)).status,403);
});

test('failed access saves never claim success; missing/invalid revisions cannot revoke access', async () => {
  const h=apiHarness();h.fail();assert.equal((await h.post({action:'invite',slug:'japan-trip',email:'guest@example.com',role:'viewer'})).status,503);assert.equal(h.record,null);
  for(const expectedAt of [null,'yesterday',123]) assert.throws(()=>validateGrantChange({action:'revoke',slug:'japan-trip',email:'guest@example.com',expectedAt}));
});
