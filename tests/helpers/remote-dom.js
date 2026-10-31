// Small DOM fixture for the real event controller. Geometry is explicit;
// browser layout/painting is verified separately in the local browser.
export function remoteDom() {
  const queue = [], observers = new Set(), events = new Map();
  const doc = { activeElement: null, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  const win = { queueMicrotask: fn => queue.push(fn), addEventListener() {}, removeEventListener() {}, getComputedStyle: element => ({ visibility: element.hidden ? 'hidden' : 'visible', display: 'block', zIndex: element.zIndex || 'auto' }), MutationObserver: class { constructor(fn) { this.fn = fn; } observe() { observers.add(this.fn); } disconnect() { observers.delete(this.fn); } } };
  doc.defaultView = win;
  function matches(element, selector) {
    if (selector === ':disabled') return element.disabled;
    if (selector === '[role="dialog"][aria-modal="true"]') return element.getAttribute('role') === 'dialog' && element.getAttribute('aria-modal') === 'true';
    if (selector === '[data-tv-back]') return element.attrs.has('data-tv-back');
    if (selector === '[data-tv-cancel]') return element.attrs.has('data-tv-cancel');
    if (selector === 'details[open]') return element.tag === 'details' && element.open;
    if (selector === 'summary') return element.tag === 'summary';
    if (selector.includes('[hidden]')) return element.hidden || element.attrs.has('inert') || element.getAttribute('aria-hidden') === 'true';
    if (selector.includes('[contenteditable')) return ['input','textarea','select'].includes(element.tag) || element.getAttribute('contenteditable') === 'true';
    return ['button','a','summary','input','textarea','select'].includes(element.tag) || element.attrs.has('tabindex');
  }
  function element(tag, x, y, width = 100, height = 40) {
    return {
      tag, attrs: new Map(), ownerDocument: doc, children: [], parent: null, disabled: false, hidden: false, clicks: 0,
      get tabIndex() { return this.attrs.has('tabindex') ? Number(this.attrs.get('tabindex')) : ['button','a','summary','input','textarea','select'].includes(tag) ? 0 : -1; },
      setAttribute(name, value) { this.attrs.set(name, String(value)); }, getAttribute(name) { return this.attrs.get(name) ?? null; }, removeAttribute(name) { this.attrs.delete(name); },
      matches(selector) { return matches(this, selector); },
      closest(selector) { for (let node = this; node; node = node.parent) if (matches(node, selector)) return node; return null; },
      getClientRects() { return this.closest('[hidden]') ? [] : [this.getBoundingClientRect()]; },
      getBoundingClientRect() { return { left: x, top: y, right: x + width, bottom: y + height, width, height }; },
      querySelectorAll(selector) { return this.children.flatMap(child => [...(matches(child, selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      append(child) { child.parent = this; this.children.push(child); return child; },
      remove(child) { this.children = this.children.filter(item => item !== child); child.parent = null; if (doc.activeElement === child) doc.activeElement = null; },
      addEventListener(name, fn) { this[name] = fn; }, removeEventListener(name) { delete this[name]; },
      focus() { if (doc.activeElement !== this) { events.get('focusout')?.({ target: doc.activeElement }); doc.activeElement = this; events.get('focusin')?.({ target: this }); } },
      scrollIntoView() { this.scrolled = true; }, click() { this.clicks++; this.onClick?.(); },
    };
  }
  const root = element('main', 0, 0, 900, 900);
  const flush = () => { let count = 0; while (queue.length) { if (++count > 50) throw Error('Focus repair loop'); queue.shift()(); } };
  return { root, doc, element, flush, mutate() { for (const fn of observers) fn(); flush(); }, key(key, extra = {}) { const event = { key, target: doc.activeElement, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra }; root.keydown?.(event); flush(); return event; }, observers };
}
