import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRemoteNavigation, nextRemoteTarget } from '../src/private-apps/morning-feed/tv/remote-navigation.js';
import { remoteDom } from './helpers/remote-dom.js';
const rect = (x,y,w=80,h=40) => ({ left:x,top:y,right:x+w,bottom:y+h });
test('spatial navigation follows all four directions and wraps each edge in the same row/column', () => {
  const items = [['a',0,0],['b',150,0],['c',0,150],['d',150,150]].map(([element,x,y]) => ({ element,rect:rect(x,y) }));
  assert.equal(nextRemoteTarget(items,'a','right'),'b'); assert.equal(nextRemoteTarget(items,'a','down'),'c');
  assert.equal(nextRemoteTarget(items,'d','up'),'b'); assert.equal(nextRemoteTarget(items,'d','left'),'c');
  assert.equal(nextRemoteTarget(items,'b','right'),'a'); assert.equal(nextRemoteTarget(items,'a','left'),'b');
  assert.equal(nextRemoteTarget(items,'c','down'),'a'); assert.equal(nextRemoteTarget(items,'a','up'),'c');
  assert.equal(nextRemoteTarget([items[0]],'a','right'),'a');
});
test('aligned controls beat unrelated nearby diagonals and remote arrows work in a single row', () => {
  const items = [{ element:'origin',rect:rect(0,0) },{ element:'diagonal',rect:rect(100,80) },{ element:'aligned',rect:rect(300,0) }];
  assert.equal(nextRemoteTarget(items,'origin','right'),'aligned');
  assert.equal(nextRemoteTarget(items.slice(0,2),'origin','down'),'diagonal');
  assert.equal(nextRemoteTarget([items[0],items[2]],'origin','down'),'aligned');
});
test('initial selection, four-way remote movement, OK/Select activation and wrapped Tab use actual focus', () => {
  const dom = remoteDom(), { root,element,doc } = dom;
  const a = root.append(element('button',0,0)), b = root.append(element('button',150,0)), c = root.append(element('a',0,150));
  const cleanup = attachRemoteNavigation(root); dom.flush();
  assert.equal(doc.activeElement,a); assert.ok(a.attrs.has('data-tv-selected'));
  assert.equal(dom.key('ArrowRight').defaultPrevented,true); assert.equal(doc.activeElement,b);
  dom.key('ArrowRight'); assert.equal(doc.activeElement,a);
  dom.key('ArrowDown'); assert.equal(doc.activeElement,c); assert.equal(c.scrolled,true);
  dom.key('Select'); assert.equal(c.clicks,1); dom.key('Enter',{repeat:true}); assert.equal(c.clicks,1);
  dom.key('Tab'); assert.equal(doc.activeElement,a); dom.key('Tab',{shiftKey:true}); assert.equal(doc.activeElement,c);
  assert.ok(!a.attrs.has('data-tv-selected')); assert.ok(c.attrs.has('data-tv-selected'));
  cleanup(); assert.equal(root.attrs.has('data-tv-remote'),false); assert.equal(c.attrs.has('data-tv-selected'),false); assert.equal(dom.observers.size,0);
});
test('disabled, hidden, inert and unavailable controls are skipped; lost selections recover without stealing valid focus', () => {
  const dom=remoteDom(), {root,element,doc}=dom;
  const a=root.append(element('button',0,0)), b=root.append(element('button',0,100)), hidden=root.append(element('button',0,50)), inert=root.append(element('button',0,70));
  hidden.hidden=true; inert.setAttribute('inert','');
  const cleanup=attachRemoteNavigation(root); dom.flush(); dom.key('ArrowDown'); assert.equal(doc.activeElement,b);
  b.disabled=true; dom.mutate(); assert.equal(doc.activeElement,a);
  root.remove(a); dom.mutate(); assert.equal(doc.activeElement,root); assert.ok(root.attrs.has('data-tv-selected'));
  b.disabled=false; dom.mutate(); assert.equal(doc.activeElement,b);
  const fresh=root.append(element('button',0,200)); dom.mutate(); assert.equal(doc.activeElement,b);
  fresh.focus(); dom.flush(); assert.equal(doc.activeElement,fresh); assert.ok(fresh.attrs.has('data-tv-selected'));
  cleanup();
});
test('modal navigation stays within the top dialog and Back cancels instead of leaving the TV page', () => {
  const dom=remoteDom(), {root,element,doc}=dom;
  const header=root.append(element('button',0,0));
  const feed=root.append(element('section',0,100)); feed.setAttribute('role','dialog'); feed.setAttribute('aria-modal','true'); feed.zIndex='900'; feed.append(element('button',0,100));
  const cleanup=attachRemoteNavigation(root); dom.flush();
  const dialog=root.append(element('div',0,200)); dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('tabindex','-1'); dialog.zIndex='6000';
  const cancel=dialog.append(element('button',0,200)), disconnect=dialog.append(element('button',160,200)); cancel.setAttribute('data-tv-cancel','');
  cancel.onClick=()=>root.remove(dialog); dom.mutate(); assert.equal(doc.activeElement,cancel);
  dom.key('ArrowRight'); assert.equal(doc.activeElement,disconnect); dom.key('Tab'); assert.equal(doc.activeElement,cancel);
  const back=dom.key('BrowserBack'); dom.mutate(); assert.equal(back.defaultPrevented,true); assert.equal(cancel.clicks,1); assert.notEqual(doc.activeElement,header);
  assert.ok(!disconnect.attrs.has('data-tv-selected')); cleanup();
});
test('source details can close with Back and text inputs/modifier keys retain native behavior', () => {
  const dom=remoteDom(), {root,element,doc}=dom;
  const details=root.append(element('details',0,0)); details.open=true;
  const summary=details.append(element('summary',0,0)), link=details.append(element('a',0,100));
  const input=root.append(element('input',0,200));
  const cleanup=attachRemoteNavigation(root); link.focus(); dom.flush(); dom.key('Escape'); assert.equal(details.open,false); assert.equal(doc.activeElement,summary);
  input.focus(); dom.flush(); assert.equal(dom.key('ArrowLeft').defaultPrevented,undefined);
  summary.focus(); dom.flush(); assert.equal(dom.key('ArrowDown',{ctrlKey:true}).defaultPrevented,undefined); cleanup();
});

test('Down from a wide headline reaches its nearby control row before a wider source summary', () => {
  const items=[{element:'headline',rect:rect(168,419,1023,75)},{element:'pause',rect:rect(155,542,159,44)},{element:'older',rect:rect(542,542,123,44)},{element:'summary',rect:rect(89,607,1102,21)}];
  assert.equal(nextRemoteTarget(items,'headline','down'),'older');
  assert.equal(nextRemoteTarget(items,'older','up'),'headline');
});

test('Back activates a previous-screen control, closes overlays first, and yields at Home without a trap',()=>{
 const dom=remoteDom(),{root,element}=dom;const home=root.append(element('button',0,0));const back=root.append(element('button',150,0));back.setAttribute('data-tv-back','');const cleanup=attachRemoteNavigation(root);dom.flush();
 assert.equal(dom.key('BrowserBack').defaultPrevented,true);assert.equal(back.clicks,1);dom.key('Backspace',{repeat:true});assert.equal(back.clicks,1);
 const modal=root.append(element('section',0,100));modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.zIndex='5500';const cancel=modal.append(element('button',0,100));cancel.setAttribute('data-tv-cancel','');cancel.onClick=()=>root.remove(modal);dom.mutate();dom.key('Backspace');dom.mutate();assert.equal(cancel.clicks,1);assert.equal(back.clicks,1);
 root.remove(back);dom.mutate();assert.equal(dom.key('BrowserBack').defaultPrevented,undefined);assert.equal(home.clicks,0);cleanup();
});

test('closing nested dialogs restores the exact usable control in the previous screen', () => {
  const dom = remoteDom(), { root, element, doc } = dom;
  root.append(element('button', 0, 0));
  const trigger = root.append(element('button', 200, 0));
  const cleanup = attachRemoteNavigation(root); trigger.focus(); dom.flush();
  const dialog = root.append(element('section', 0, 100)); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.zIndex = '5000';
  dialog.append(element('button', 0, 100));
  const nestedTrigger = dialog.append(element('button', 200, 100)); dom.mutate(); nestedTrigger.focus(); dom.flush();
  const nested = dialog.append(element('section', 0, 200)); nested.setAttribute('role', 'dialog'); nested.setAttribute('aria-modal', 'true'); nested.zIndex = '6000';
  nested.append(element('button', 0, 200)); dom.mutate();
  dialog.remove(nested); dom.mutate(); assert.equal(doc.activeElement, nestedTrigger);
  root.remove(dialog); dom.mutate(); assert.equal(doc.activeElement, trigger);
  cleanup();
});

test('remote arrows and Tab stay on article controls instead of entering a cross-origin iframe', () => {
  const dom = remoteDom(), { root, element, doc } = dom;
  const close = root.append(element('button', 0, 0)); close.setAttribute('data-tv-cancel', '');
  const details = root.append(element('button', 200, 0));
  const frame = root.append(element('iframe', 0, 100, 800, 500)); frame.setAttribute('tabindex', '0');
  const cleanup = attachRemoteNavigation(root); dom.flush();
  dom.key('ArrowDown'); assert.notEqual(doc.activeElement, frame);
  dom.key('Tab'); assert.notEqual(doc.activeElement, frame);
  frame.focus(); dom.flush(); assert.equal(doc.activeElement, frame, 'Explicit pointer/frame focus is not stolen');
  details.focus(); dom.flush(); dom.key('Escape'); assert.equal(close.clicks, 1);
  cleanup();
});

test('Back skips hidden cancel controls and cannot activate an aria-disabled modal action', () => {
  const dom = remoteDom(), { root, element } = dom;
  const hidden = root.append(element('button', 0, 0)); hidden.hidden = true; hidden.setAttribute('data-tv-cancel', '');
  const back = root.append(element('button', 0, 100)); back.setAttribute('data-tv-back', '');
  const cleanup = attachRemoteNavigation(root); dom.flush();
  dom.key('Escape'); assert.equal(hidden.clicks, 0); assert.equal(back.clicks, 1);
  const modal = root.append(element('section', 0, 200)); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.zIndex = '5000';
  const cancel = modal.append(element('button', 0, 200)); cancel.setAttribute('data-tv-cancel', ''); cancel.setAttribute('aria-disabled', 'true');
  dom.mutate(); assert.equal(dom.key('Escape').defaultPrevented, true); assert.equal(cancel.clicks, 0); assert.equal(back.clicks, 1);
  cleanup();
});

test('initial destination preference does not steal a valid selection on refresh', () => {
  const dom = remoteDom(), { root, element, doc } = dom;
  const utility = root.append(element('button', 0, 0));
  const content = root.append(element('button', 0, 100)); content.setAttribute('data-tv-initial', '');
  const cleanup = attachRemoteNavigation(root); dom.flush(); assert.equal(doc.activeElement, content);
  utility.focus(); dom.flush(); dom.mutate(); assert.equal(doc.activeElement, utility);
  const extra = root.append(element('button', 0, 200)); extra.setAttribute('data-tv-initial', ''); dom.mutate();
  assert.equal(doc.activeElement, utility); cleanup();
});

test('a loading TV surface receives focus when its fixed-position parent has no controls', () => {
  const dom = remoteDom(), { root, element, doc } = dom;
  const loading = root.append(element('section', 0, 0, 960, 540)); loading.setAttribute('data-tv-surface', 'true'); loading.setAttribute('tabindex', '-1');
  const cleanup = attachRemoteNavigation(root); dom.flush(); assert.equal(doc.activeElement, loading);
  assert.ok(loading.attrs.has('data-tv-selected'));
  loading.append(element('button', 450, 250));
  const retry = loading.append(element('button', 50, 300)); retry.setAttribute('data-tv-initial', '');
  dom.mutate(); assert.equal(doc.activeElement, retry, 'Initial action wins over geometric proximity to the loading region');
  cleanup();
});

test('a disabled or removed pager keeps focus nearby instead of jumping to the initial navigation', () => {
  const dom = remoteDom(), { root, element, doc } = dom;
  const nav = root.append(element('button', 0, 0)); nav.setAttribute('data-tv-initial', '');
  const previous = root.append(element('button', 400, 400));
  const next = root.append(element('button', 530, 400));
  const cleanup = attachRemoteNavigation(root); dom.flush(); assert.equal(doc.activeElement, nav);
  next.focus(); dom.flush(); next.disabled = true; dom.mutate();
  assert.equal(doc.activeElement, previous, 'Last page stays with the remaining pager control');
  next.disabled = false; dom.mutate(); next.focus(); dom.flush(); root.remove(next); dom.mutate();
  assert.equal(doc.activeElement, previous, 'A removed pager recovers to the nearby control');
  cleanup();
});
