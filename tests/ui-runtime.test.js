import test from 'node:test';
import assert from 'node:assert/strict';
import { createUiRuntime, manualIntervals, tick } from './helpers/ui-runtime.js';
import { boardUi } from './helpers/project-board-ui.js';

test('dependency changes replace subscriptions; unmount clears timers and ignores late state updates', async () => {
  const ui = createUiRuntime(), timers = manualIntervals(), history = [];
  let channel = 'first', setCount;
  const component = () => {
    const [count, set] = ui.hooks.useState(() => 0); setCount = set;
    ui.hooks.useEffect(() => {
      const current = channel;
      history.push(`subscribe ${current}`);
      const timer = timers.setInterval(() => set(value => value + 1), 15000);
      return () => { history.push(`unsubscribe ${current}`); timers.clearInterval(timer); };
    }, [channel]);
    return count;
  };
  assert.equal(await ui.mount(component), 0);
  assert.equal(timers.size, 1);
  await timers.tick(15000); assert.equal(ui.render(component), 1);
  assert.deepEqual(history, ['subscribe first']);
  channel = 'second'; ui.render(component);
  assert.deepEqual(history, ['subscribe first', 'unsubscribe first', 'subscribe second']);
  assert.equal(timers.size, 1);
  await timers.tick(15000); assert.equal(ui.render(component), 2);
  ui.unmount(); ui.unmount();
  assert.equal(timers.size, 0);
  assert.equal(history.at(-1), 'unsubscribe second');
  setCount(100); await timers.tick(15000); assert.equal(ui.states[0], 2);
  assert.throws(() => ui.render(component), /unmounted/);
});

test('effects distinguish omitted and empty dependencies; memo, state and refs retain hook identity', () => {
  const ui = createUiRuntime(); let initializations = 0, computations = 0, every = 0, once = 0, value = NaN;
  const component = () => {
    const [state, setState] = ui.hooks.useState(() => ++initializations);
    const ref = ui.hooks.useRef({});
    const memo = ui.hooks.useMemo(() => ({ value, number: ++computations }), [value]);
    ui.hooks.useEffect(() => { every++; });
    ui.hooks.useEffect(() => { once++; }, []);
    return { state, setState, ref, memo };
  };
  const first = ui.render(component), second = ui.render(component);
  assert.equal(initializations, 1); assert.equal(every, 2); assert.equal(once, 1);
  assert.equal(first.setState, second.setState); assert.equal(first.ref, second.ref); assert.equal(first.memo, second.memo);
  value = -0; const third = ui.render(component);
  value = 0; const fourth = ui.render(component);
  assert.notEqual(third.memo, fourth.memo); assert.equal(computations, 3);
  first.setState(previous => previous + 2); assert.equal(ui.render(component).state, 3);
  ui.unmount();
});

test('Project board refreshes linked event on editor changes and cancels stale detail responses', async () => {
  const pending = new Map(), calls = [];
  const ui = boardUi(async url => {
    if (url === '/api/admin/apps/project-board') return Response.json({ projects: [], tasks: [] });
    calls.push(url);
    return new Promise(resolve => pending.set(new URL(url, 'https://site.example').searchParams.get('detail'), resolve));
  });
  await ui.mount();
  const edit = eventId => { ui.states[6] = { kind: 'tasks', value: { calendar_id: 'calendar', event_id: eventId } }; ui.render(); };
  edit('old'); edit('new');
  assert.equal(calls.length, 2);
  pending.get('new')(Response.json({ event: { id: 'new' } })); await tick();
  assert.equal(ui.states[11].id, 'new');
  pending.get('old')(Response.json({ event: { id: 'old' } })); await tick();
  assert.equal(ui.states[11].id, 'new');
  edit('after-close'); ui.unmount();
  pending.get('after-close')(Response.json({ event: { id: 'late' } })); await tick();
  assert.equal(ui.states[11], null);
});
