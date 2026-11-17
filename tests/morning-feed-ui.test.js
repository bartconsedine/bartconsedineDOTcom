import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { morningUi } from './helpers/morning-ui.js';
import { nodes, button } from './helpers/trip-ui.js';
import { emptyScreen } from '../src/private-apps/morning-feed/model.js';
const card = id => ({ id, kind: 'ritual', title: `Ritual ${id}`, body: 'A small start', minutes: 5, url: '', enabled: true, completedOn: '' });
const view = ui => renderToStaticMarkup(ui.render());
const input = (ui, label) => nodes(ui.render()).find(n => n.type === 'input' && n.props['aria-label'] === label);

test('failed load cannot be edited; retry loads an honest empty state', async () => {
  let fail = true;
  const ui = morningUi(async () => fail ? Response.json({}, { status: 503 }) : Response.json({ screen: null, updatedAt: null }));
  await ui.settle(); assert.match(view(ui), /Could not load/); assert.equal(button(ui.render(), 'Save morning'), undefined);
  fail = false; await button(ui.render(), 'Retry loading').props.onClick(); await ui.settle(); assert.match(view(ui), /No morning cards yet/); ui.close();
});

test('edits survive failed save, retry confirms, and a new session recovers the same saved screen', async () => {
  let stored = null, fail = true;
  const fetcher = async (_, options = {}) => {
    if (options.method === 'POST') { if (fail) return Response.json({}, { status: 503 }); const body = JSON.parse(options.body); assert.equal(body.expectedAt, null); stored = body.screen; return Response.json({ saved: true, updatedAt: '2026-10-27T02:00:00Z' }); }
    return Response.json({ screen: stored, updatedAt: stored ? '2026-10-27T02:00:00Z' : null });
  };
  const ui = morningUi(fetcher); await ui.settle(); button(ui.render(), 'Build your morning').props.onClick(); await ui.settle();
  input(ui, 'Card 1 title').props.onChange({ target: { value: 'Morning stretch' } });
  await button(ui.render(), 'Save morning').props.onClick(); assert.match(view(ui), /Save failed.*edits are still here/); assert.equal(stored, null);
  fail = false; await button(ui.render(), 'Retry save').props.onClick(); assert.match(view(ui), /Saved to your private workspace/);
  const fresh = morningUi(fetcher); await fresh.settle(); assert.match(view(fresh), /Morning stretch/); ui.close(); fresh.close();
});

test('conflicts preserve local drafts; invalid timezone input does not crash preview', async () => {
  const revision = '2026-10-27T02:00:00.123456Z';
  const ui = morningUi(async (_, options = {}) => {
    if (options.method === 'POST') { assert.equal(JSON.parse(options.body).expectedAt, revision); return Response.json({ error: 'Your screen changed on another device or in chat.' }, { status: 409 }); }
    return Response.json({ screen: { ...emptyScreen(), cards: [card('one')] }, updatedAt: revision });
  }); await ui.settle(); button(ui.render(), 'Edit morning').props.onClick(); await ui.settle();
  const timezone = nodes(ui.render()).find(n => n.type === 'input' && n.props.value === 'America/New_York'); timezone.props.onChange({ target: { value: 'Amer' } });
  assert.doesNotThrow(() => view(ui)); await button(ui.render(), 'Save morning').props.onClick(); assert.match(view(ui), /valid time zone/);
  nodes(ui.render()).find(n => n.type === 'input' && n.props.value === 'Amer').props.onChange({ target: { value: 'America/New_York' } });
  input(ui, 'Card 1 title').props.onChange({ target: { value: 'My draft' } }); await button(ui.render(), 'Save morning').props.onClick(); assert.match(view(ui), /changed on another device/); assert.match(view(ui), /My draft/); ui.close();
});

test('TV changes cards only explicitly, preserves the selected card across reordered refreshes, and labels stale data', async () => {
  let screen = { ...emptyScreen(), cards: [card('one'), card('two')] }, fail = false;
  const ui = morningUi(async () => fail ? Response.json({}, { status: 503 }) : Response.json({ screen, updatedAt: '2026-10-27T02:00:00Z' }));
  await ui.settle(); button(ui.render(), 'TV mode').props.onClick(); await ui.settle();
  assert.equal(button(ui.render(), 'Next card →'), undefined);
  button(ui.render(), 'Briefing').props.onClick(); await ui.settle(); assert.match(view(ui), /Ritual one/);
  await ui.tick(20000); assert.match(view(ui), /Ritual one/);
  nodes(ui.render()).find(n => n.props?.['aria-label'] === 'Next card').props.onClick(); await ui.settle(); assert.match(view(ui), /Ritual two/);
  ui.key('ArrowLeft'); assert.match(view(ui), /Ritual two/); // Arrows move focus, never the card.
  screen = { ...screen, cards: [card('two'), card('one')], focus: 'A saved change from my phone' };
  await ui.tick(30000); assert.match(view(ui), /Ritual two/); assert.doesNotMatch(view(ui), /Ritual one/);
  button(ui.render(), 'News').props.onClick(); ui.key('ArrowRight'); await ui.settle();
  button(ui.render(), 'Briefing').props.onClick(); await ui.settle(); assert.match(view(ui), /Ritual two/);
  fail = true; await ui.tick(30000); assert.match(view(ui), /Display is offline/); assert.match(view(ui), /Ritual two/);
  button(ui.render(), 'Home').props.onClick(); await ui.settle(); assert.match(view(ui), /A saved change from my phone/);
  ui.key('Escape'); await ui.settle(); assert.doesNotMatch(ui.render().props.className, /morning-display/); ui.close();
});

test('completion, remove/undo and viewer controls respect editable state and explicit saves', async () => {
  const screen = { ...emptyScreen(), cards: [card('one'), card('two')] };
  const fetcher = async () => Response.json({ screen, updatedAt: null });
  const ui = morningUi(fetcher); await ui.settle(); button(ui.render(), 'Mark complete').props.onClick(); assert.match(view(ui), /Done today/); assert.equal(button(ui.render(), 'TV mode').props.disabled, true);
  button(ui.render(), 'Edit morning').props.onClick(); await ui.settle(); button(ui.render(), 'Remove').props.onClick(); input(ui, 'Card 1 title').props.onChange({ target: { value: 'Keep my other edit' } }); button(ui.render(), 'Undo removal').props.onClick(); assert.match(view(ui), /Keep my other edit/); assert.equal(ui.states[0].cards.length, 2);
  const viewer = morningUi(fetcher, { permission: 'viewer' }); await viewer.settle(); assert.equal(button(viewer.render(), 'Edit morning'), undefined); assert.equal(button(viewer.render(), 'Save morning'), undefined); assert.equal(button(viewer.render(), 'Mark complete').props.disabled, true); ui.close(); viewer.close();
});

test('paired TV starts read-only in display mode and clears the feed on revocation', async () => {
  let revoked = false, expired = false;
  const screen = { ...emptyScreen(), cards: [card('one')] };
  const ui = morningUi(async endpoint => {
    assert.equal(endpoint, '/api/tv');
    return Response.json(revoked ? { status: 'expired' } : { status: 'connected', screen, updatedAt: null });
  }, { tv: true, onTvExpired: () => { expired = true; }, onDisconnect: () => {} });
  await ui.settle(); button(ui.render(), 'Briefing').props.onClick(); await ui.settle(); assert.match(view(ui), /ON AIR/);
  assert.equal(button(ui.render(), 'Edit morning'), undefined);
  assert.equal(button(ui.render(), 'Save morning'), undefined);
  assert.ok(button(ui.render(), 'Disconnect TV'));
  ui.key('Escape'); await ui.settle(); assert.match(view(ui), /ON AIR/);
  revoked = true; await ui.tick(30000); assert.equal(expired, true);
  assert.doesNotMatch(view(ui), /Ritual one/); assert.match(view(ui), /connection ended/);
  ui.close();
});

test('ticker-only TV mode opens with no routine cards and the morning briefing remains independently optional', async () => {
  const ui = morningUi(async () => Response.json({ screen: emptyScreen(), updatedAt: null }));
  await ui.settle(); assert.equal(button(ui.render(), 'TV mode').props.disabled, false);
  button(ui.render(), 'TV mode').props.onClick(); await ui.settle(); assert.match(view(ui), /morning-ticker-only/);
  button(ui.render(), 'Briefing').props.onClick(); await ui.settle(); assert.match(view(ui), /No briefing cards saved/);
  button(ui.render(), 'Explore News').props.onClick(); await ui.settle(); assert.equal(ui.render().props['data-tv-view'], 'news'); ui.close();
});

test('TV sections preserve deliberate navigation across polls and a fresh paired session starts on Home', async () => {
  const screen = { ...emptyScreen(), cards: [card('one')] };
  const ui = morningUi(async () => Response.json({ screen, updatedAt: '2026-10-30T12:00:00Z' })); await ui.settle();
  button(ui.render(), 'TV mode').props.onClick(); await ui.settle(); assert.equal(ui.render().props['data-tv-view'], 'home');
  for (const [label, value] of [['Briefing', 'briefing'], ['Calendar', 'calendar'], ['Commands', 'commands'], ['News', 'news'], ['Home', 'home']]) {
    button(ui.render(), label).props.onClick(); await ui.settle(); assert.equal(ui.render().props['data-tv-view'], value);
    await ui.tick(30000); assert.equal(ui.render().props['data-tv-view'], value);
    assert.equal(Boolean(nodes(ui.render()).find(n => n.props.className === 'morning-feature')), value === 'briefing');
  }
  ui.close();
  const fresh = morningUi(async () => Response.json({ status: 'connected', screen, updatedAt: null }), { tv: true }); await fresh.settle();
  assert.equal(fresh.render().props['data-tv-view'], 'home'); assert.match(view(fresh), /Owner sign-in required/); fresh.close();
});

test('TV briefing link opens the in-app article overlay without an external anchor',async()=>{
 const story={...card('public'),kind:'link',title:'Saved article',body:'Saved original details',url:'https://example.com/article?v=7'};
 const ui=morningUi(async()=>Response.json({status:'connected',screen:{...emptyScreen(),cards:[story]},updatedAt:null}),{tv:true,permission:'viewer'});await ui.settle();button(ui.render(),'Briefing').props.onClick();await ui.settle();
 assert.equal(nodes(ui.render()).some(n=>n.type==='a'&&n.props.href===story.url),false);
 button(ui.render(),'Open link').props.onClick();assert.equal(ui.tvOpens.length,1);assert.equal(ui.tvOpens[0].kind,'article');assert.equal(ui.tvOpens[0].payload.cardId,story.id);assert.equal(JSON.stringify(ui.tvOpens[0]).includes(story.url),false);assert.equal(JSON.stringify(ui.tvOpens[0]).includes(story.body),false);assert.equal(ui.tvOpens[0].payload.kind,'card');ui.close();
});

test('morning and news views preserve unsaved cards and editing returns to the morning workspace', async () => {
  let posts = 0;
  const ui = morningUi(async (_, options = {}) => { if (options.method) posts++; return Response.json({ screen: { ...emptyScreen(), cards: [card('one')] }, updatedAt: null }); });
  await ui.settle(); button(ui.render(), 'Edit morning').props.onClick(); await ui.settle();
  input(ui, 'Card 1 title').props.onChange({ target: { value: 'Keep this draft' } });
  button(ui.render(), 'News & ideas').props.onClick(); await ui.settle();
  const panel = className => nodes(ui.render()).find(node => node.props.className === className);
  assert.equal(panel('morning-news-panel').props.hidden, false);
  assert.equal(panel('morning-summary').props.hidden, true);
  assert.equal(input(ui, 'Card 1 title'), undefined);
  button(ui.render(), 'My morning').props.onClick(); await ui.settle();
  assert.equal(input(ui, 'Card 1 title').props.value, 'Keep this draft');
  assert.equal(panel('morning-news-panel').props.hidden, true);
  button(ui.render(), 'Preview feed').props.onClick();
  button(ui.render(), 'News & ideas').props.onClick();
  button(ui.render(), 'Edit morning').props.onClick(); await ui.settle();
  assert.equal(button(ui.render(), 'My morning').props['aria-pressed'], true);
  assert.equal(input(ui, 'Card 1 title').props.value, 'Keep this draft'); assert.equal(posts, 0);
  ui.close();
});

test('the minute precision clock rolls daily completions over without altering saved cards', async () => {
  let now = Date.parse('2030-01-01T23:59:45Z'), reads = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const savedCard = { ...card('daily'), completedOn: '2030-01-01' };
  const screen = { ...emptyScreen(), timezone: 'UTC', cards: [savedCard] };
  const ui = morningUi(async () => { reads++; return Response.json({ screen, updatedAt: '2030-01-01T20:00:00Z' }); }, {}, { Clock });
  await ui.settle(); assert.ok(button(ui.render(), '✓ Done today'));
  now += 30000; await ui.tick(30000);
  assert.ok(button(ui.render(), 'Mark complete'));
  assert.equal(button(ui.render(), 'Save morning').props.disabled, true);
  assert.equal(ui.states[0].cards[0].completedOn, '2030-01-01');
  assert.equal(reads, 1); ui.close();
});


test('TV loading and failure keep the full-screen surface and retry recovers without writes', async () => {
  let fail = true, posts = 0;
  const ui = morningUi(async (_, options = {}) => { if (options.method) posts++; return fail ? Response.json({}, { status: 503 }) : Response.json({ status: 'connected', screen: emptyScreen(), updatedAt: null }); }, { tv: true });
  assert.match(ui.render().props.className, /morning-display tv-state/); assert.equal(ui.render().props['aria-busy'], true);
  await ui.settle(); assert.match(ui.render().props.className, /morning-display tv-state/); assert.match(view(ui), /Could not load/);
  fail = false; await button(ui.render(), 'Retry loading').props.onClick(); await ui.settle();
  assert.equal(ui.render().props['data-tv-view'], 'home'); assert.equal(posts, 0); ui.close();
});

test('removing a selected briefing card falls back safely and full-screen notices remain visible', async () => {
  let cards = [card('one'), card('two')];
  const ui = morningUi(async () => Response.json({ screen: { ...emptyScreen(), cards }, updatedAt: null }));
  await ui.settle(); button(ui.render(), 'TV mode').props.onClick(); await ui.settle(); button(ui.render(), 'Briefing').props.onClick();
  nodes(ui.render()).find(n => n.props?.['aria-label'] === 'Next card').props.onClick(); await ui.settle(); assert.match(view(ui), /Ritual two/);
  cards = [card('one')]; await ui.tick(30000); assert.match(view(ui), /Ritual one/); assert.doesNotMatch(view(ui), /Ritual two/);
  await button(ui.render(), 'Full screen').props.onClick(); await ui.settle();
  const status = nodes(ui.render()).find(n => n.props.className === 'morning-status'); assert.equal(status.props.hidden, false);
  assert.match(view(ui), /browser’s full-screen control/); ui.close();
});


test('paired fullscreen contains the disconnect dialog while owner fullscreen targets the display only', async () => {
  for (const tv of [true, false]) {
    const calls = [];
    const ui = morningUi(async () => Response.json({ status: 'connected', screen: emptyScreen(), updatedAt: null }), { tv });
    await ui.settle();
    if (!tv) { button(ui.render(), 'TV mode').props.onClick(); await ui.settle(); }
    ui.render().props.ref.current = { requestFullscreen: async () => calls.push('feed'), parentElement: { requestFullscreen: async () => calls.push('tv-controller') } };
    await button(ui.render(), 'Full screen').props.onClick();
    assert.deepEqual(calls, [tv ? 'tv-controller' : 'feed']); ui.close();
  }
});


test('initial briefing identity survives reordering and exiting returns focus to the launch control', async () => {
  let cards = [card('one'), card('two')], focused = false;
  const ui = morningUi(async () => Response.json({ screen: { ...emptyScreen(), cards }, updatedAt: null }));
  await ui.settle(); button(ui.render(), 'TV mode').props.onClick(); await ui.settle(); button(ui.render(), 'Briefing').props.onClick();
  cards = [card('two'), card('one')]; await ui.tick(30000);
  assert.match(view(ui), /Ritual one/); assert.doesNotMatch(view(ui), /Ritual two/);
  await button(ui.render(), 'Exit TV mode').props.onClick();
  button(ui.render(), 'TV mode').props.ref.current = { focus: () => { focused = true; } };
  await ui.settle(); assert.equal(focused, true); ui.close();
});

test('workspace empty morning omits empty summary panels while saved focus and rituals remain visible', async () => {
  const empty = morningUi(async () => Response.json({ screen: emptyScreen(), updatedAt: null }));
  await empty.settle();
  for (const name of ['morning-focus', 'morning-progress']) {
    assert.equal(nodes(empty.render()).find(node => node.props.className === name).props.hidden, true);
  }
  assert.ok(button(empty.render(), 'Build your morning'));
  assert.equal(nodes(empty.render()).find(node => node.props.className === 'morning-brand').props.hidden, true);
  empty.close();
  const saved = morningUi(async () => Response.json({ screen: { ...emptyScreen(), title: 'Daily check-in', focus: 'Finish one task', cards: [card('one')] }, updatedAt: '2026-11-17T00:00:00Z' }));
  await saved.settle();
  for (const name of ['morning-focus', 'morning-progress', 'morning-brand']) {
    assert.equal(nodes(saved.render()).find(node => node.props.className === name).props.hidden, false);
  }
  assert.ok(button(saved.render(), 'Mark complete'));
  saved.close();
});
