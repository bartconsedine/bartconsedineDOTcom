import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createPersonalApi } from '../src/private-apps/robot-party/personal-api.js';
import { createMcpApi } from '../src/private-apps/robot-party/mcp-api.js';
import { createPersonalMcp } from '../src/private-apps/robot-party/personal/mcp.js';
import { dispatchOne, unseal } from '../src/private-apps/robot-party/personal/transport.js';
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', guest = '33333333-3333-4333-8333-333333333333';
const robot = '55555555-5555-4555-8555-555555555555', secondRobot = '66666666-6666-4666-8666-666666666666';
const token = 'rp_' + 'A'.repeat(43), secondToken = 'rp_' + 'B'.repeat(43), key = Buffer.alloc(32, 9), secret = 'whsec_' + Buffer.alloc(32, 7).toString('base64');
const origin = 'https://site.example';
async function setup() {
  const db = new PGlite();
  await db.exec('create role anon;create role authenticated;');
  await db.exec(await readFile('tests/fixtures/auth.sql', 'utf8'));
  await db.exec(`insert into auth.users values('${owner}','bartconsedine@gmail.com',now(),false),('${other}','mjshah8@gmail.com',now(),false),('${guest}','guest@example.com',now(),false);insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users;`);
  for (const name of (await readdir('prisma/migrations')).filter(name => name !== 'migration_lock.toml').sort()) await db.exec(await readFile('prisma/migrations/' + name + '/migration.sql', 'utf8'));
  await db.exec(await readFile('src/private-apps/robot-party/personal/staged-migration/20261027145320_robot_party_personal_chat/migration.sql', 'utf8'));
  await db.exec(`insert into private.site_admin(user_id,email) select id,email from auth.users where id in('${owner}','${other}');`);
  await login(db, owner);
  for (const [id, value] of [[robot, token], [secondRobot, secondToken]]) await db.query('insert into public.robot_party_robots(id,owner_id,created_by,name,role,token_hash) values($1,$2,$2,$3,$4,$5)', [id, owner, 'Synthetic dot ' + id.slice(0, 4), 'writer', createHash('sha256').update(value).digest('hex')]);
  return db;
}
const login = (db, id) => db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
const asAnon = db => db.exec('reset role;set role anon;');
async function ownerCall(db, action, input = {}) { return (await db.query('select public.robot_party_personal_owner($1,$2::jsonb) result', [action, JSON.stringify(input)])).rows[0].result; }
async function robotCall(db, action, input = {}, value = token) { return (await db.query('select public.robot_party_personal_robot($1,$2,$3::jsonb) result', [value, action, JSON.stringify(input)])).rows[0].result; }
const modernRequest = (method, params = {}, value = token) => new Request(origin + '/api/robot-party/mcp', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + value, 'MCP-Protocol-Version': '2026-07-28', 'MCP-Method': method, ...(method === 'tools/call' ? { 'MCP-Name': params.name } : {}) },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'Synthetic local test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} } } }),
});

test('actual staged SQL + owner API + MCP Events + signed delivery + private reply complete an idempotent local round trip', async () => {
  const db = await setup();
  try {
    const storage = { owner: (action, input) => ownerCall(db, action, input) };
    const api = createPersonalApi({ authorize: async () => ({ ok: true, user: { id: owner } }), siteOrigin: () => origin, configuration: () => ({ key }), storage });
    const browser = async command => {
      await login(db, owner);
      const request = new Request(origin + '/api/admin/robot-party/personal', command ? { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(command) } : {});
      const response = await api(request); return { status: response.status, value: await response.json() };
    };
    const rpc = async (name, args) => {
      await asAnon(db);
      try {
        if (name === 'robot_party_identity') return { data: (await db.query('select public.robot_party_identity($1) result', [args.token])).rows[0].result };
        assert.equal(name, 'robot_party_personal_robot');
        return { data: await robotCall(db, args.p_action, args.p_input, args.p_token) };
      } catch (error) { return { error }; }
    };
    const captured = [];
    const webhook = async (url, body, headers) => {
      const parsed = JSON.parse(body), stamp = headers['webhook-timestamp'], id = headers['webhook-id'];
      assert.equal(headers['webhook-signature'], 'v1,' + createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${stamp}.${body}`).digest('base64'));
      if (parsed.type === 'verification') return { status: 200, text: JSON.stringify({ challenge: parsed.challenge }) };
      captured.push({ url, event: parsed }); return { status: 204, text: '' };
    };
    const personal = createPersonalMcp({ rpc, key, send: webhook });
    const mcp = createMcpApi({ origin: () => origin, rpc, personal });
    const call = async (method, params, value = token) => (await (await mcp(modernRequest(method, params, value))).json());
    const identity = await call('tools/call', { name: 'identify_robot_party_connection', arguments: {} });
    assert.equal(identity.result.structuredContent.connectionId, robot);
    assert.equal(identity.result.structuredContent.eligible, true);
    assert.deepEqual((await call('events/list', {})).result.events, []);
    const channelId = randomUUID();
    const grant = { action: 'grant', id: channelId, robotId: robot };
    assert.equal((await browser(grant)).value.channelId, channelId);
    assert.equal((await browser(grant)).value.channelId, channelId);
    const eventList = await call('events/list', {});
    assert.equal(eventList.result.events[0].name, 'personal.message.created');
    assert.deepEqual((await call('events/list', {}, secondToken)).result.events, []);
    const subscription = { name: 'personal.message.created', arguments: { channel_id: channelId }, delivery: { mode: 'webhook', url: 'https://callback.example/mcp-events/synthetic', secret } };
    const subscribed = await call('events/subscribe', subscription);
    assert.ok(subscribed.result.id);
    assert.equal((await call('events/subscribe', subscription)).result.id, subscribed.result.id);
    await login(db, owner); await ownerCall(db, 'snapshot');
    const ready = await browser();
    assert.equal(ready.value.canSend, true);
    assert.equal(ready.value.identityVerified, true);
    assert.doesNotMatch(JSON.stringify(ready.value), /whsec_|secret_box|callback_url/);
    const message = { action: 'send', id: randomUUID(), channelId, body: 'Synthetic private question' };
    assert.equal((await browser(message)).value.delivery, 'queued');
    assert.equal((await browser(message)).value.message.id, message.id);
    assert.equal((await browser({ ...message, body: 'Altered retry' })).status, 409);
    await login(db, owner);
    const deliver = () => dispatchOne(storage, key, webhook);
    assert.equal((await deliver()).recorded, true);
    assert.equal((await deliver()).attempted, false);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].event.eventId, message.id);
    assert.deepEqual(captured[0].event.data, { channel_id: channelId, message_id: message.id });
    assert.doesNotMatch(JSON.stringify(captured), /Synthetic private question/);
    assert.equal((await browser()).value.messages[0].delivery, 'received');
    const read = await call('tools/call', { name: 'read_personal_robot_party', arguments: { messageId: message.id } });
    assert.equal(read.result.structuredContent.messages[0].body, message.body);
    const reply = { id: randomUUID(), replyTo: message.id, body: 'Synthetic private reply' };
    const replied = await call('tools/call', { name: 'reply_personal_robot_party', arguments: reply });
    assert.equal(replied.result.structuredContent.message.robot_id, robot);
    assert.equal(replied.result.structuredContent.message.sender, 'dot');
    assert.equal((await call('tools/call', { name: 'reply_personal_robot_party', arguments: reply })).result.structuredContent.message.id, reply.id);
    assert.equal((await call('tools/call', { name: 'reply_personal_robot_party', arguments: { ...reply, id: randomUUID() } })).result.structuredContent.message.id, reply.id);
    assert.equal((await call('tools/call', { name: 'reply_personal_robot_party', arguments: { ...reply, body: 'Altered' } })).result.isError, true);
    assert.equal((await call('tools/call', { name: 'reply_personal_robot_party', arguments: { ...reply, sender: 'owner' } })).result.isError, true);
    assert.equal((await call('tools/call', { name: 'read_personal_robot_party', arguments: {} }, secondToken)).result.isError, true);
    const after = await browser(); assert.equal(after.value.messages.length, 2);
    assert.equal(after.value.messages[1].id, reply.id);
    // New API instance/session reads the committed PostgreSQL rows.
    await login(db, owner); assert.equal((await ownerCall(db, 'snapshot')).messages[1].body, reply.body);
    await asAnon(db);
    const board = (await db.query('select public.robot_party_read($1,$2::jsonb) result', [token, '{}'])).rows[0].result;
    assert.deepEqual(board.threads, []);
    await assert.rejects(db.exec('select * from public.robot_party_personal_messages'), /permission denied/);
    await assert.rejects(db.exec('select * from private.robot_party_personal_subscriptions'), /permission denied/);
    for (const id of [other, guest]) {
      await login(db, id);
      assert.equal((await db.query('select * from public.robot_party_personal_messages')).rows.length, 0);
      if (id === guest) await assert.rejects(ownerCall(db, 'snapshot'), /personal_access_denied/);
      else assert.deepEqual((await ownerCall(db, 'snapshot')).messages, []);
      await assert.rejects(ownerCall(db, 'grant', { id: randomUUID(), robotId: robot }), /personal_access_denied/);
    }
    await login(db, owner); await ownerCall(db, 'revoke', { channelId });
    await asAnon(db); await assert.rejects(robotCall(db, 'read'), /personal_access_denied/);
    await login(db, owner); const nextChannel = randomUUID(); await ownerCall(db, 'grant', { id: nextChannel, robotId: secondRobot });
    await asAnon(db);
    assert.deepEqual((await robotCall(db, 'read', {}, secondToken)).messages, []);
    await assert.rejects(robotCall(db, 'read', { messageId: message.id }, secondToken), /personal_access_denied/);
    await assert.rejects(robotCall(db, 'reply', { id: randomUUID(), replyTo: message.id, body: 'Steal old history' }, secondToken), /personal_access_denied/);
    await db.exec(`reset role;update public.robot_party_robots set revoked_at=clock_timestamp() where id='${secondRobot}';set role anon;`);
    await assert.rejects(robotCall(db, 'read', {}, secondToken), /robot_access_denied/);
  } finally { await db.close(); }
});

test('durable outbox leases, lost receipts, bounded retries, terminal responses, subscription expiry and rotation remain honest', async () => {
  const db = await setup();
  try {
    const channelId = randomUUID();
    await ownerCall(db, 'grant', { id: channelId, robotId: robot });
    const rpc = async (_name, args) => { await asAnon(db); try { return { data: await robotCall(db, args.p_action, args.p_input, args.p_token) }; } catch (error) { return { error }; } };
    const personal = createPersonalMcp({ rpc, key, send: async (_url, body) => ({ status: 200, text: JSON.stringify({ challenge: JSON.parse(body).challenge }) }) });
    const params = { name: 'personal.message.created', arguments: { channel_id: channelId }, delivery: { mode: 'webhook', url: 'https://callback.example/synthetic', secret } };
    const sub = await personal.events('events/subscribe', params, token);
    await login(db, owner);
    const storage = { owner: (action, input) => ownerCall(db, action, input) };
    const first = randomUUID(); await ownerCall(db, 'send', { id: first, channelId, body: 'Synthetic retry' });
    const eventIds = [];
    await dispatchOne(storage, key, async (_url, body) => { eventIds.push(JSON.parse(body).eventId); throw Error('Simulated receipt lost after acceptance'); });
    assert.equal((await ownerCall(db, 'snapshot')).messages[0].delivery, 'queued');
    await db.exec("reset role;update private.robot_party_personal_outbox set next_at=clock_timestamp()-interval '1 second';"); await login(db, owner);
    await dispatchOne(storage, key, async (_url, body) => { eventIds.push(JSON.parse(body).eventId); return { status: 204 }; });
    assert.deepEqual(eventIds, [first, first]);
    assert.equal((await ownerCall(db, 'snapshot')).messages[0].delivery, 'received');
    const leased = randomUUID(); await ownerCall(db, 'send', { id: leased, channelId, body: 'Synthetic leased delivery' });
    const claim = await ownerCall(db, 'claim'); assert.equal(claim.message.id, leased);
    assert.equal(await ownerCall(db, 'claim'), null);
    assert.equal((await ownerCall(db, 'finish', { messageId: leased, leaseId: randomUUID(), outcome: 'received' })).saved, false);
    await db.exec("reset role;update private.robot_party_personal_outbox set attempts=5,lease_until=clock_timestamp()-interval '1 second' where state='queued';"); await login(db, owner);
    assert.equal(await ownerCall(db, 'claim'), null);
    assert.equal((await ownerCall(db, 'snapshot')).messages.find(row => row.id === leased).delivery, 'failed');
    for (const status of [410, 413]) {
      const id = randomUUID(); await ownerCall(db, 'send', { id, channelId, body: 'Synthetic terminal ' + status });
      await dispatchOne(storage, key, async () => ({ status }));
      assert.equal((await ownerCall(db, 'snapshot')).messages.find(row => row.id === id).delivery, 'failed');
    }
    const replacement = 'whsec_' + Buffer.alloc(32, 4).toString('base64');
    await personal.events('events/subscribe', { ...params, delivery: { ...params.delivery, secret: replacement } }, token);
    await login(db, owner); const snapshot = await ownerCall(db, 'snapshot');
    const credentials = unseal(snapshot.subscription, snapshot.channel, key);
    assert.equal(credentials.current, replacement); assert.equal(credentials.previous.secret, secret);
    assert.ok(credentials.previous.until > Date.now());
    await asAnon(db);
    await assert.rejects(robotCall(db, 'subscribe', { id: 'rpps_' + 'a'.repeat(64), url: params.delivery.url + '/different', secretBox: 'x'.repeat(80), expiresAt: new Date(Date.now() + 60000).toISOString() }), /personal_subscription_conflict/);
    await personal.events('events/unsubscribe', { name: params.name, arguments: params.arguments, delivery: { mode: 'webhook', url: params.delivery.url } }, token);
    await personal.events('events/unsubscribe', { name: params.name, arguments: params.arguments, delivery: { mode: 'webhook', url: params.delivery.url } }, token);
    await login(db, owner); assert.equal((await ownerCall(db, 'snapshot')).subscription, null);
    await assert.rejects(ownerCall(db, 'send', { id: randomUUID(), channelId, body: 'No subscription' }), /personal_disconnected/);
    await personal.events('events/subscribe', params, token);
    await db.exec("reset role;update private.robot_party_personal_subscriptions set expires_at=clock_timestamp()-interval '1 second';"); await login(db, owner);
    assert.equal((await ownerCall(db, 'snapshot')).subscription, null);
    await assert.rejects(ownerCall(db, 'send', { id: randomUUID(), channelId, body: 'Expired subscription' }), /personal_disconnected/);
    await db.exec(`reset role;update auth.users set email_confirmed_at=null where id='${owner}';set role anon;`);
    await assert.rejects(robotCall(db, 'read'), /robot_access_denied/);
    assert.ok(sub.id);
  } finally { await db.close(); }
});
