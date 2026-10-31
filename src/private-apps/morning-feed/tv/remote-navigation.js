const controls = 'button,a[href],summary,input,select,textarea,[tabindex]';
const arrows = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Up: 'up', Down: 'down', Left: 'left', Right: 'right' };
const backKeys = ['Escape', 'Backspace', 'BrowserBack', 'GoBack'];

// Prefer controls aligned with the current row/column, then nearby diagonals.
// At an edge, wrap to the opposite edge in that row/column.
export function nextRemoteTarget(items, current, direction) {
  if (!items.length) return null;
  const origin = items.find(item => item.element === current) || items[0];
  const vertical = direction === 'up' || direction === 'down';
  const sign = direction === 'up' || direction === 'left' ? -1 : 1;
  const center = rect => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });
  const from = center(origin.rect);
  const options = items.filter(item => item !== origin).map(item => {
    const to = center(item.rect);
    const primary = sign * (vertical ? to.y - from.y : to.x - from.x);
    const cross = Math.abs(vertical ? to.x - from.x : to.y - from.y);
    const overlap = vertical ? Math.min(origin.rect.right, item.rect.right) > Math.max(origin.rect.left, item.rect.left) : Math.min(origin.rect.bottom, item.rect.bottom) > Math.max(origin.rect.top, item.rect.top);
    return { ...item, primary, cross, overlap };
  });
  const forward = options.filter(item => item.primary > 1);
  const candidates = forward.length ? forward : options;
  candidates.sort((a, b) => Number(b.overlap) - Number(a.overlap) || (forward.length ? (a.primary + a.cross * (a.overlap ? 0.01 : 2)) - (b.primary + b.cross * (b.overlap ? 0.01 : 2)) : a.primary - b.primary || a.cross - b.cross));
  return candidates[0]?.element || origin.element;
}

export function attachRemoteNavigation(root) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const originalTabIndex = root.getAttribute('tabindex');
  let selected = null, lastRect = null, previousScope = null, queued = false, disposed = false;
  root.setAttribute('data-tv-remote', '');
  root.setAttribute('tabindex', '-1');
  function visible(element) {
    if (element.closest('[hidden],[inert],[aria-hidden="true"]') || !element.getClientRects().length) return false;
    const style = win.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.display !== 'none';
  }
  function scope() {
    return [...root.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(visible).sort((a, b) => (Number.parseInt(win.getComputedStyle(a).zIndex, 10) || 0) - (Number.parseInt(win.getComputedStyle(b).zIndex, 10) || 0)).at(-1) || root;
  }
  function targets(area) {
    return [...area.querySelectorAll(controls)].filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true' && visible(element));
  }
  function select(element, scroll = false) {
    if (selected !== element) selected?.removeAttribute('data-tv-selected');
    selected = element;
    element.setAttribute('data-tv-selected', '');
    lastRect = element.getBoundingClientRect();
    if (doc.activeElement !== element) element.focus({ preventScroll: true });
    if (scroll) element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }
  function repair() {
    if (disposed) return;
    const area = scope(), list = targets(area), changed = previousScope !== area;
    previousScope = area;
    if (list.includes(doc.activeElement)) { select(doc.activeElement); return; }
    if (list.includes(selected)) { select(selected); return; }
    let next = list[0];
    if (!changed && lastRect && list.length) {
      const distance = element => { const r = element.getBoundingClientRect(); return ((r.left + r.right - lastRect.left - lastRect.right) / 2) ** 2 + ((r.top + r.bottom - lastRect.top - lastRect.bottom) / 2) ** 2; };
      next = list.reduce((best, element) => distance(element) < distance(best) ? element : best);
    }
    // Even loading/empty states retain a highlighted region until controls return.
    select(next || area, true);
  }
  function scheduleRepair() {
    if (queued || disposed) return;
    queued = true;
    win.queueMicrotask(() => { queued = false; repair(); });
  }
  function key(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const editable = event.target?.closest('input,textarea,select,[contenteditable="true"]');
    if (editable) return;
    const direction = arrows[event.key];
    const activate = ['Enter', 'NumpadEnter', ' ', 'Select', 'OK', 'Accept'].includes(event.key);
    if (!direction && !activate && event.key !== 'Tab' && !backKeys.includes(event.key)) return;
    repair();
    const area = scope(), list = targets(area);
    if (backKeys.includes(event.key)) {
      const cancel = area.querySelector('[data-tv-cancel]');
      const details = selected?.closest('details[open]');
      const previous = area.querySelector('[data-tv-back]');
      if (!cancel && !details && !previous) return; // Home yields to browser/host exit.
      event.preventDefault(); event.stopPropagation();
      if (event.repeat) return;
      if (cancel && !cancel.matches(':disabled')) cancel.click();
      else if (details) { details.open = false; select(details.querySelector('summary'), true); }
      else if (previous && !previous.matches(':disabled')) previous.click();
      return;
    }
    event.preventDefault(); event.stopPropagation();
    if (activate) {
      // Holding OK must not repeatedly open/close dialogs or disconnect a screen.
      if (!event.repeat && list.includes(selected)) selected.click();
      scheduleRepair(); return;
    }
    if (!list.length) return;
    const next = event.key === 'Tab' ? list[(Math.max(0, list.indexOf(selected)) + (event.shiftKey ? list.length - 1 : 1)) % list.length] : nextRemoteTarget(list.map(element => ({ element, rect: element.getBoundingClientRect() })), selected, direction);
    select(next, true);
  }
  function focus(event) {
    const area = scope();
    if (targets(area).includes(event.target)) select(event.target);
    else scheduleRepair();
  }
  root.addEventListener('keydown', key, true);
  doc.addEventListener('focusin', focus);
  doc.addEventListener('focusout', scheduleRepair);
  win.addEventListener('focus', scheduleRepair);
  win.addEventListener('resize', scheduleRepair);
  const observer = new win.MutationObserver(scheduleRepair);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'aria-hidden', 'aria-disabled', 'inert', 'open', 'class', 'style'] });
  repair();
  return () => {
    disposed = true; observer.disconnect();
    root.removeEventListener('keydown', key, true);
    doc.removeEventListener('focusin', focus); doc.removeEventListener('focusout', scheduleRepair);
    win.removeEventListener('focus', scheduleRepair); win.removeEventListener('resize', scheduleRepair);
    selected?.removeAttribute('data-tv-selected'); root.removeAttribute('data-tv-remote');
    if (originalTabIndex === null) root.removeAttribute('tabindex'); else root.setAttribute('tabindex', originalTabIndex);
  };
}
