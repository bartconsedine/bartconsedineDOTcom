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
