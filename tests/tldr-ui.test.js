import test from 'node:test';
import assert from 'node:assert/strict';
import { tickerUi } from './helpers/ticker-ui.js';
import { nodes, button } from './helpers/trip-ui.js';
import { renderToStaticMarkup } from 'react-dom/server';
const item = (id,title=id) => ({ title, summary:`Complete source summary for ${id}. This is the final sentence.`, url:`https://example.com/${id}?v=7`, editions:[{edition:'tech',date:'2026-10-28'}] });
const feed = (articles=[item('one'),item('two')],history=0) => ({articles,history,hasOlder:true,sources:[{edition:'tech',date:'2026-10-28',status:'current',checkedAt:'2026-10-28T12:00:00Z'}]});
const view = ui => renderToStaticMarkup(ui.render());
test('ticker rotates all headlines; OK pins a article snapshot across refresh, Back resumes and toggle is independent',async()=>{
 let data=feed(),fail=false;
 const ui=tickerUi(async()=>{if(fail) throw Error(); return Response.json(data);},{endpoint:'/api/tv',display:true});
 await ui.settle(); assert.match(view(ui),/one/); await ui.tick(24000); assert.match(view(ui),/two/);
 ui.key('Enter'); await ui.settle(); assert.match(view(ui),/Article reader/); assert.ok(nodes(ui.render()).find(n=>n.type==='iframe'));
 const image=nodes(ui.render()).find(n=>n.type==='iframe').props.src;
 data=feed([item('new')]); await ui.tick(60000); assert.match(view(ui),/two/); assert.equal(nodes(ui.render()).find(n=>n.type==='iframe').props.src,image);
 fail=true; await ui.tick(60000); assert.match(view(ui),/Keeping the last loaded headlines/); assert.match(view(ui),/two/);
 ui.key('Backspace'); await ui.settle(); assert.doesNotMatch(view(ui),/Article reader/); assert.match(view(ui),/new/);
 button(ui.render(),'Turn ticker off').props.onClick(); await ui.settle(); assert.doesNotMatch(view(ui),/ON AIR/); assert.ok(button(ui.render(),'Turn ticker on')); ui.close();
});
test('history is separate from routine cards, empty/errors are honest, and reduced motion disables automatic advance',async()=>{
 let history=0; const ui=tickerUi(async url=>{ history=Number(new URL(url,'https://example.com').searchParams.get('history')); return Response.json(feed([item('one'),item('two')],history));},{endpoint:'/api/admin/apps/morning-feed?owner=owner',display:true},true);
 await ui.settle(); await ui.tick(24000); assert.match(view(ui),/MANUAL/); assert.match(view(ui),/one/);
 ui.key('ArrowRight'); await ui.settle(); assert.match(view(ui),/two/);
 button(ui.render(),'Older issues').props.onClick(); await ui.settle(); assert.equal(history,1); assert.match(view(ui),/page 2/);
 button(ui.render(),'Latest').props.onClick(); await ui.settle(); assert.equal(history,0); ui.close();
 const empty=tickerUi(async()=>Response.json(feed([])),{endpoint:'/api/tv'}); await empty.settle(); assert.match(view(empty),/No headlines available/); assert.equal(button(empty.render(),'Open article').props.disabled,true); empty.close();
});
test('partial source failure retains that edition, revocation clears headlines and paused QR',async()=>{
 let data=feed(),revoked=false,expired=false;
 const ui=tickerUi(async()=>revoked?Response.json({}, {status:401}):Response.json(data),{endpoint:'/api/tv',display:true,onExpired:()=>{expired=true;}});
 await ui.settle(); ui.key('Enter'); await ui.settle();
 data={...feed([]),sources:[{edition:'tech',status:'unavailable',date:null}]}; await ui.tick(60000); assert.match(view(ui),/one/); button(ui.render(),'Latest public issues · Issue dates & sources').props.onClick(); await ui.settle(); assert.match(view(ui),/Source unavailable/); ui.key('Backspace'); await ui.settle();
 revoked=true; await ui.tick(60000); assert.equal(expired,true); assert.doesNotMatch(view(ui),/Article reader/); assert.doesNotMatch(view(ui),/example.com/); ui.close();
});

test('ticker yields arrows and OK to spatial navigation, while Back still resumes its QR reader', async () => {
  const ui = tickerUi(async () => Response.json(feed()), { endpoint: '/api/tv', display: true });
  await ui.settle();
  ui.render().props.ref.current = { closest: () => ({}), contains: () => true, querySelector: () => ({ focus() {} }) };
  ui.key('ArrowRight'); await ui.settle(); assert.match(view(ui), /tldr-title[^>]*>one/);
  ui.key('Enter'); await ui.settle(); assert.doesNotMatch(view(ui), /Article reader/);
  const headline = nodes(ui.render()).find(node => node.props?.className === 'tldr-headline');
  headline.props.onClick(); await ui.settle(); assert.match(view(ui), /Article reader/);
  ui.key('Backspace'); await ui.settle(); assert.doesNotMatch(view(ui), /Article reader/); ui.close();
});

test('stationary long titles and complete summaries remain readable; edition versions and repeated QR interactions preserve source copy', async()=>{
 const title='A very long editorial headline about the systems engineers build and how those systems change when artificial intelligence becomes part of everyday work';
 const summary=Array.from({length:90},(_,i)=>`Original source sentence ${i}.`).join(' ');
 const story={...item('long',title),summary,editions:[{edition:'tech',date:'2026-10-30',summary},{edition:'ai',date:'2026-10-30',summary:'The complete different AI summary.'}]};
 const ui=tickerUi(async()=>Response.json(feed([story])),{endpoint:'/api/tv',display:true}); await ui.settle();
 assert.match(view(ui),/tldr-title/); assert.doesNotMatch(view(ui),/tldr-scroll/); assert.ok(view(ui).includes(title)); assert.ok(view(ui).includes(summary));
 button(ui.render(),'AI summary').props.onClick(); await ui.settle(); assert.match(view(ui),/The complete different AI summary/);
 for(let i=0;i<4;i++){ui.key('Enter');await ui.settle();assert.match(view(ui),/Article reader/);await ui.tick(60000);ui.key('Backspace');await ui.settle();assert.doesNotMatch(view(ui),/Article reader/);}
 ui.close();
});

test('issue source details are a separate readable modal and Back returns without moving the story',async()=>{
 const ui=tickerUi(async()=>Response.json(feed()),{endpoint:'/api/tv',display:true});await ui.settle();
 assert.doesNotMatch(view(ui),/2026-10-28T12:00:00/);assert.doesNotMatch(view(ui),/<details/);
 button(ui.render(),'Latest public issues · Issue dates & sources').props.onClick();await ui.settle();assert.match(view(ui),/Issue dates and sources/);assert.match(view(ui),/Oct 28/);assert.match(view(ui),/tldr-source-card/);
 await ui.tick(24000);assert.match(view(ui),/tldr-title[^>]*>one/);ui.key('Backspace');await ui.settle();assert.doesNotMatch(view(ui),/aria-label="Issue dates and sources"/);assert.match(view(ui),/tldr-title[^>]*>one/);ui.close();
});

test('article opens in a sandboxed same-app frame with a truthful summary fallback and no QR or external navigation', async()=>{
 const ui=tickerUi(async()=>Response.json(feed()),{endpoint:'/api/tv',display:true}); await ui.settle();
 button(ui.render(),'Open article').props.onClick(); await ui.settle();
 const frame=nodes(ui.render()).find(n=>n.type==='iframe');assert.equal(frame.props.src,item('one').url);assert.equal(frame.props.sandbox,'allow-scripts allow-same-origin');assert.equal(frame.props.referrerPolicy,'no-referrer');
 assert.doesNotMatch(view(ui),/Scan to|data:image|target="_blank"/);assert.match(view(ui),/publisher blocks embedding/);
 button(ui.render(),'TLDR summary').props.onClick();await ui.settle();assert.doesNotMatch(view(ui),/<iframe/);assert.match(view(ui),/Complete source summary for one/);
 button(ui.render(),'Read site').props.onClick();await ui.settle();assert.match(view(ui),/<iframe/);ui.key('Backspace');await ui.settle();assert.doesNotMatch(view(ui),/Article reader/);ui.close();
});


test('saved-card reader resolves an ID while News/ticker is hidden, and a new open resets previous summary mode',async()=>{
 const card={id:'saved',enabled:true,title:'Saved card',body:'Private original card details',url:'https://example.com/card?v=7'};
 const ui=tickerUi(async()=>Response.json(feed()),{endpoint:'/api/tv',display:true,visible:false,cardStories:[card]});await ui.settle();button(ui.render(),'Turn ticker off').props.onClick();await ui.settle();
 const location={overlay:'article',payload:{kind:'card',cardId:'saved'}};ui.emitHistory(location);await ui.settle();assert.equal(nodes(ui.render()).find(n=>n.type==='iframe').props.src,card.url);assert.ok(button(ui.render(),'Card details'));
 button(ui.render(),'Card details').props.onClick();await ui.settle();assert.match(view(ui),/Private original card details/);ui.emitHistory({overlay:null});await ui.settle();ui.emitHistory(location);await ui.settle();assert.ok(nodes(ui.render()).find(n=>n.type==='iframe'));
 ui.emitHistory({overlay:'article',payload:{kind:'card',cardId:'missing'}});await ui.settle();assert.doesNotMatch(view(ui),/Private original card details|Article reader/);ui.close();
});
