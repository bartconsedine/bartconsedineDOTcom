import test from 'node:test';
import assert from 'node:assert/strict';
import { tickerUi } from './helpers/ticker-ui.js';
import { nodes, button } from './helpers/trip-ui.js';
import { renderToStaticMarkup } from 'react-dom/server';
const item = (id,title=id) => ({ title, url:`https://example.com/${id}?v=7`, editions:[{edition:'tech',date:'2026-10-28'}] });
const feed = (articles=[item('one'),item('two')],history=0) => ({articles,history,hasOlder:true,sources:[{edition:'tech',date:'2026-10-28',status:'current',checkedAt:'2026-10-28T12:00:00Z'}]});
const view = ui => renderToStaticMarkup(ui.render());
test('ticker rotates all headlines; OK pins a QR snapshot across refresh, Back resumes and toggle is independent',async()=>{
 let data=feed(),fail=false;
 const ui=tickerUi(async()=>{if(fail) throw Error(); return Response.json(data);},{endpoint:'/api/tv',display:true});
 await ui.settle(); assert.match(view(ui),/one/); await ui.tick(16000); assert.match(view(ui),/two/);
 ui.key('Enter'); await ui.settle(); assert.match(view(ui),/Paused headline/); assert.ok(nodes(ui.render()).find(n=>n.type==='img'));
 const image=nodes(ui.render()).find(n=>n.type==='img').props.src;
 data=feed([item('new')]); await ui.tick(60000); assert.match(view(ui),/two/); assert.equal(nodes(ui.render()).find(n=>n.type==='img').props.src,image);
 fail=true; await ui.tick(60000); assert.match(view(ui),/Keeping the last loaded headlines/); assert.match(view(ui),/two/);
 ui.key('Backspace'); await ui.settle(); assert.doesNotMatch(view(ui),/Paused headline/); assert.match(view(ui),/new/);
 button(ui.render(),'Turn ticker off').props.onClick(); await ui.settle(); assert.doesNotMatch(view(ui),/ON AIR/); assert.ok(button(ui.render(),'Turn ticker on')); ui.close();
});
test('history is separate from routine cards, empty/errors are honest, and reduced motion disables automatic advance',async()=>{
 let history=0; const ui=tickerUi(async url=>{ history=Number(new URL(url,'https://example.com').searchParams.get('history')); return Response.json(feed([item('one'),item('two')],history));},{endpoint:'/api/admin/apps/morning-feed?owner=owner',display:true},true);
 await ui.settle(); await ui.tick(16000); assert.match(view(ui),/MANUAL/); assert.match(view(ui),/one/);
 ui.key('ArrowRight'); await ui.settle(); assert.match(view(ui),/two/);
 button(ui.render(),'Older issues').props.onClick(); await ui.settle(); assert.equal(history,1); assert.match(view(ui),/page 2/);
 button(ui.render(),'Latest').props.onClick(); await ui.settle(); assert.equal(history,0); ui.close();
 const empty=tickerUi(async()=>Response.json(feed([])),{endpoint:'/api/tv'}); await empty.settle(); assert.match(view(empty),/No headlines available/); assert.equal(button(empty.render(),'Pause / show QR').props.disabled,true); empty.close();
});
test('partial source failure retains that edition, revocation clears headlines and paused QR',async()=>{
 let data=feed(),revoked=false,expired=false;
 const ui=tickerUi(async()=>revoked?Response.json({}, {status:401}):Response.json(data),{endpoint:'/api/tv',display:true,onExpired:()=>{expired=true;}});
 await ui.settle(); ui.key('Enter'); await ui.settle();
 data={...feed([]),sources:[{edition:'tech',status:'unavailable',date:null}]}; await ui.tick(60000); assert.match(view(ui),/one/); assert.match(view(ui),/source unavailable/);
 revoked=true; await ui.tick(60000); assert.equal(expired,true); assert.doesNotMatch(view(ui),/Paused headline/); assert.doesNotMatch(view(ui),/example.com/); ui.close();
});
