// A synchronous fixture for one component, not a React renderer. Tests explicitly
// render after events; effects commit after each render. Browser QA still covers
// DOM behavior, React scheduling, and nested component lifecycles.
export const tick = async () => {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
};

const sameDependencies = (previous, next) => previous !== undefined && next !== undefined &&
  previous.length === next.length && next.every((value, index) => Object.is(value, previous[index]));

export function createUiRuntime(initial = []) {
  const states = [...initial], setters = [], effects = [], memos = [];
  let slot = 0, pending = [], closed = false;
  const hooks = {
    useState(initialValue) {
      const key = slot++;
      if (!(key in states)) states[key] = typeof initialValue === 'function' ? initialValue() : initialValue;
      setters[key] ??= next => {
        if (!closed) states[key] = typeof next === 'function' ? next(states[key]) : next;
      };
      return [states[key], setters[key]];
    },
    useRef(initialValue) {
      const key = slot++;
      if (!(key in states)) states[key] = { current: initialValue };
      return states[key];
    },
    useMemo(compute, dependencies) {
      const key = slot++;
      if (!memos[key] || !sameDependencies(memos[key].dependencies, dependencies)) {
        memos[key] = { value: compute(), dependencies: dependencies?.slice() };
      }
      return memos[key].value;
    },
    useEffect(effect, dependencies) {
      const key = slot++;
      if (!effects[key] || !sameDependencies(effects[key].dependencies, dependencies)) {
        pending.push({ key, effect, dependencies: dependencies?.slice() });
      }
    },
  };
  const runtime = {
    states, hooks,
    render(component) {
      if (closed) throw Error('Cannot render an unmounted UI fixture.');
      slot = 0; pending = [];
      const tree = component();
      // Clean up every changed effect before installing the new effects.
      for (const { key } of pending) effects[key]?.cleanup?.();
      for (const { key, effect, dependencies } of pending) effects[key] = { dependencies, cleanup: effect() };
      return tree;
    },
    async mount(component) {
      runtime.render(component);
      await tick();
      return runtime.render(component);
    },
    unmount() {
      if (closed) return;
      closed = true;
      for (const effect of effects) effect?.cleanup?.();
    },
  };
  return runtime;
}

// Intervals run only when a test requests a tick; they never keep Node alive.
export function manualIntervals() {
  const timers = new Map(); let nextId = 0;
  return {
    setInterval(callback, delay) { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearInterval(id) { timers.delete(id); },
    async tick(delay) {
      for (const [id, timer] of [...timers]) if (timers.has(id) && timer.delay === delay) await timer.callback();
    },
    get size() { return timers.size; },
  };
}
