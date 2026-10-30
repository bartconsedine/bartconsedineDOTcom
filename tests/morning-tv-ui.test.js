import test from 'node:test';
import assert from 'node:assert/strict';
import { tvUi, nodes, text } from './helpers/tv-ui.js';
const button = (ui, name) => nodes(ui.render()).find(node => node.type === 'button' && text(node).includes(name));
test('phone never claims approval before server confirmation; failed approval retries and revocation removes only confirmed device', async () => {
  let fail = true;
  const ui = tvUi('consent', async (_, options) => {
    const value = JSON.parse(options.body);
    if (fail) return Response.json({ error: 'Database unavailable. Retry.' }, { status: 503 });
    return Response.json(value.action === 'approve' ? { approved: true } : { revoked: true });
  }, { code: 'A'.repeat(43), confirmation: '1234ABCD', devices: [{ id: 'f'.repeat(64), code: 'ABCDEF12', expiresAt: '2026-11-28T00:00:00Z' }] });
  await ui.settle(); assert.match(text(ui.render()), /1234ABCD/);
  await button(ui, 'Approve TV').props.onClick(); assert.doesNotMatch(text(ui.render()), /TV connected/); assert.match(text(ui.render()), /Database unavailable/);
  fail = false; await button(ui, 'Approve TV').props.onClick(); assert.match(text(ui.render()), /TV connected/);
  fail = true; await button(ui, 'Disconnect TV').props.onClick(); assert.ok(button(ui, 'Disconnect TV'));
  fail = false; await button(ui, 'Disconnect TV').props.onClick(); assert.equal(button(ui, 'Disconnect TV'), undefined); ui.close();
});
test('TV waits for explicit phone approval, keeps QR on transient errors, and opens feed automatically after approval', async () => {
  let status = 'unpaired', fail = false;
  const ui = tvUi('tv-screen', async (_, options) => {
    if (fail) throw Error('offline');
    if (options?.method === 'POST') { assert.equal(JSON.parse(options.body).action, 'start'); status = 'pending'; }
    return Response.json({ status, expiresAt: new Date(Date.now() + 600000).toISOString(), code: '1234ABCD', qr: 'data:image/png;base64,fixture', approvalUrl: 'https://example.com/auth/tv?code=fixture' });
  });
  await ui.settle(); await button(ui, 'Show QR code').props.onClick(); await ui.settle();
  assert.match(text(ui.render()), /Waiting for your approval/); assert.ok(nodes(ui.render()).find(n => n.type === 'img'));
  fail = true; await ui.tick(5000); assert.match(text(ui.render()), /Connection interrupted/); assert.match(text(ui.render()), /1234ABCD/);
  fail = false; status = 'connected'; await ui.tick(5000); assert.equal(nodes(ui.render()).find(n => n.type === 'img'), undefined);
  assert.ok(nodes(ui.render()).some(n => n.props?.tv === true && n.props?.permission === 'viewer')); ui.close();
});

test('disconnect uses a remote-selectable app dialog; cancel and failed requests keep the current pairing', async () => {
  let fail = true, writes = 0;
  const ui = tvUi('tv-screen', async (_, options) => {
    if (options?.method === 'POST') { writes++; return fail ? Response.json({ error: 'Disconnect failed. Retry.' }, { status: 503 }) : Response.json({ disconnected: true }); }
    return Response.json({ status: 'pending', expiresAt: new Date(Date.now() + 600000).toISOString(), code: '1234ABCD', qr: 'data:image/png;base64,fixture', approvalUrl: 'https://example.com/fixture' });
  });
  await ui.settle(); button(ui, 'Cancel pairing').props.onClick(); await ui.settle();
  assert.ok(nodes(ui.render()).find(node => node.props?.role === 'dialog' && node.props?.['aria-modal']));
  button(ui, 'Keep connected').props.onClick(); await ui.settle(); assert.equal(writes, 0);
  button(ui, 'Cancel pairing').props.onClick(); await ui.settle();
  await button(ui, 'Disconnect TV').props.onClick(); await ui.settle(); assert.match(text(ui.render()), /Disconnect failed/); assert.match(text(ui.render()), /1234ABCD/);
  fail = false; await button(ui, 'Disconnect TV').props.onClick(); await ui.settle(); assert.ok(button(ui, 'Show QR code')); assert.equal(nodes(ui.render()).find(node => node.props?.role === 'dialog'), undefined); ui.close();
});
