export const TV_VIEWS = ['home', 'news', 'briefing', 'calendar', 'commands'];
const overlays = ['article', 'sources', 'disconnect'];
const active = new WeakMap(), listeners = new WeakMap();
const valid = state => state?.version === 1 && TV_VIEWS.includes(state.view) && Number.isInteger(state.depth) && state.depth >= 0 && (!state.overlay || overlays.includes(state.overlay));
const current = win => valid(win.history?.state?.bartTv) ? win.history.state.bartTv : null;
function emit(win) { for (const listener of listeners.get(win) ?? []) listener(current(win)); }
export function subscribeTvHistory(win, listener) {
  if (!listeners.has(win)) listeners.set(win, new Set());
  listeners.get(win).add(listener);
  if (current(win)) listener(current(win));
  return () => listeners.get(win)?.delete(listener);
}
// Real same-document history is essential: OmarchyTV handles native BACK before JS,
// using WebView.canGoBack()/goBack(), then finishing its Activity at the first entry.
export function startTvHistory(win) {
  if (!win.history || !win.location) return () => {};
  let pending = false;
  const urlFor = state => { const url = new URL(win.location.href); url.searchParams.set('view', state.view); if (state.overlay) url.searchParams.set('panel', state.overlay); else url.searchParams.delete('panel'); return url.href; };
  const write = (method, state) => win.history[method]({ ...win.history.state, bartTv: state }, '', urlFor(state));
  if (!current(win)) {
    const requested = new URL(win.location.href).searchParams.get('view');
    const home = { version: 1, view: 'home', overlay: null, payload: null, depth: 0 };
    write('replaceState', home);
    // A direct child link still has a Home entry for the first Back press.
    if (TV_VIEWS.includes(requested) && requested !== 'home') write('pushState', { ...home, view: requested, depth: 1 });
  }
  const pop = () => { pending = false; emit(win); };
  const controller = {
    navigate(view) {
      const state = current(win); if (!state || pending || !TV_VIEWS.includes(view) || state.view === view && !state.overlay) return;
      if (view === 'home' && state.depth) { pending = true; win.history.go(-state.depth); return; }
      write('pushState', { version: 1, view, overlay: null, payload: null, depth: state.depth + 1 }); emit(win);
    },
    open(overlay, payload) {
      const state = current(win); if (!state || pending || !overlays.includes(overlay)) return false;
      if (state.overlay === overlay) { write('replaceState', { ...state, payload: payload ?? null }); emit(win); return true; }
      write('pushState', { ...state, overlay, payload: payload ?? null, depth: state.depth + 1 }); emit(win); return true;
    },
    back() { const state = current(win); if (!state || !state.depth || pending) return false; pending = true; win.history.back(); return true; },
    close(overlay) { if (current(win)?.overlay === overlay) return this.back(); return false; },
  };
  active.set(win, controller); win.addEventListener('popstate', pop); emit(win);
  return () => { if (active.get(win) === controller) active.delete(win); win.removeEventListener('popstate', pop); };
}
export const navigateTv = (win, view) => { const controller = active.get(win); if (!controller) return false; controller.navigate(view); return true; };
export const backTv = win => active.get(win)?.back() ?? false;
export const openTvOverlay = (win, kind, payload) => active.get(win)?.open(kind, payload) ?? false;
export const closeTvOverlay = (win, kind) => active.get(win)?.close(kind) ?? false;
export function exitTvHistory(win) {
  if (!win.history || !win.location) return;
  const url = new URL(win.location.href); url.searchParams.delete('view'); url.searchParams.delete('panel');
  const state = { ...win.history.state }; delete state.bartTv;
  win.history.replaceState(state, '', url.href);
}
