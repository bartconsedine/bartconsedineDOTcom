import test from 'node:test';
import assert from 'node:assert/strict';
import { tickerUi } from './helpers/ticker-ui.js';
import { nodes, button } from './helpers/trip-ui.js';
import { articleId } from '../src/private-apps/morning-feed/tldr/progress-model.js';
import { renderToStaticMarkup } from 'react-dom/server';
const item=(id,date)=>({title:id,url:`https://example.com/${id}`,summary:`Summary of ${id}.`,editions:[{edition:'tech',date}]});
const one=item('old','2026-10-28'),two=item('recent','2026-10-30'),three=item('newest','2026-10-31');
const title=ui=>nodes(ui.render()).find(n=>n.props?.className==='tldr-title')?.props.children;
const html=ui=>renderToStaticMarkup(ui.render());
async function settled(ui) {for(let i=0;i<4;i++)await ui.settle();}
function fixture() {
  const state={articles:[one,two,three],reads:new Map(),fail:false,posts:0};
  state.fetch=async(url,options={})=>{
    if(url==='/progress') {
      if(options.method==='POST') {state.posts++;if(state.fail)return Response.json({state:'unavailable'},{status:503});const id=await articleId(JSON.parse(options.body).url);state.reads.set(id,'2026-11-01T00:00:00Z');return Response.json({state:'saved',id,readAt:state.reads.get(id)});}
      return Response.json({state:'ready',reads:[...state.reads].map(([id,readAt])=>({id,readAt}))});
    }
    return Response.json({articles:state.articles,history:0,hasOlder:false,sources:[]});
  };
  state.ui=(reduced=true)=>tickerUi(state.fetch,{endpoint:'/feed',progressEndpoint:'/progress',display:true},reduced);
  return state;
}
test('opening marks read, Back shows next newest unread, reload resumes, all stories remains available',async()=>{
  const state=fixture();let ui=state.ui();await settled(ui);assert.equal(title(ui),'newest');
  button(ui.render(),'Open article').props.onClick();await settled(ui);assert.equal(state.posts,1);assert.match(html(ui),/Article reader/);
  assert.equal(nodes(ui.render()).find(n=>n.type==='iframe').props.src,three.url);
  ui.key('Backspace');await settled(ui);assert.equal(title(ui),'recent');ui.close();
  ui=state.ui();await settled(ui);assert.equal(title(ui),'recent');
  button(ui.render(),'All stories').props.onClick();await settled(ui);assert.equal(title(ui),'newest');assert.match(html(ui),/· Read/);
  button(ui.render(),'Unread stories').props.onClick();await settled(ui);assert.equal(title(ui),'recent');ui.close();
});
test('manual next and upcoming selections consume only the story left; passive rotation never saves',async()=>{
  const state=fixture();const ui=state.ui(false);await settled(ui);await ui.tick(24000);await settled(ui);assert.equal(title(ui),'recent');assert.equal(state.posts,0);
  await nodes(ui.render()).find(n=>n.props?.['aria-label']==='Next headline').props.onClick();await settled(ui);assert.equal(title(ui),'old');assert.ok(state.reads.has(await articleId(two.url)));assert.equal(state.reads.size,1);
  await nodes(ui.render()).find(n=>n.props?.className==='tldr-next-story').props.onClick();await settled(ui);assert.equal(title(ui),'newest');assert.ok(state.reads.has(await articleId(one.url)));ui.close();
});
test('failed save stays unread with retry in the reader; all-read queue welcomes new arrivals',async()=>{
  const state=fixture();state.articles=[three];state.fail=true;const ui=state.ui();await settled(ui);
  button(ui.render(),'Open article').props.onClick();await settled(ui);assert.equal(state.reads.size,0);assert.match(html(ui),/Read status was not saved/);
  state.fail=false;await button(ui.render(),'Retry saving progress').props.onClick();await settled(ui);assert.equal(state.reads.size,1);ui.key('Backspace');await settled(ui);assert.match(html(ui),/You’re caught up/);
  state.articles=[one,three,item('brand-new','2026-11-01')];await ui.tick(60000);await settled(ui);assert.equal(title(ui),'brand-new');assert.doesNotMatch(html(ui),/You’re caught up/);ui.close();
});
test('a second session learns confirmed reads on refresh without auto-marking anything',async()=>{
  const state=fixture();const a=state.ui(),b=state.ui();await settled(a);await settled(b);
  await nodes(a.render()).find(n=>n.props?.['aria-label']==='Next headline').props.onClick();await settled(a);assert.equal(title(a),'recent');
  await b.tick(60000);await settled(b);assert.equal(title(b),'recent');assert.equal(state.posts,1);a.close();b.close();
});

test('paused reader arrow navigation follows its own story and marks each newly opened article',async()=>{
  const state=fixture();const ui=state.ui();await settled(ui);
  button(ui.render(),'Open article').props.onClick();await settled(ui);
  ui.key('ArrowRight');await settled(ui);
  assert.equal(nodes(ui.render()).find(n=>n.type==='iframe').props.src,two.url);
  ui.key('ArrowRight');await settled(ui);
  assert.equal(nodes(ui.render()).find(n=>n.type==='iframe').props.src,one.url);
  assert.equal(state.reads.size,3);ui.key('Backspace');await settled(ui);
  assert.match(html(ui),/You’re caught up/);ui.close();
});
