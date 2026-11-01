import test from 'node:test';
import assert from 'node:assert/strict';
import { startTvHistory, subscribeTvHistory, navigateTv, backTv, openTvOverlay, closeTvOverlay, exitTvHistory } from '../src/private-apps/morning-feed/tv/history.js';
function browser(url='https://example.com/tv') {
 const events=new Map(),entries=[{state:{next:'preserved'},url}],win={location:{href:url},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};let index=0,beforePop=null;
 win.history={get state(){return entries[index].state;},get length(){return entries.length;},pushState(state,_,url){entries.splice(index+1);entries.push({state,url});index++;win.location.href=url;},replaceState(state,_,url){entries[index]={state,url};win.location.href=url;},go(n){const next=index+n;if(next<0||next>=entries.length)return;index=next;win.location.href=entries[index].url;const traversed=entries[index].state;beforePop?.();events.get('popstate')?.({state:traversed});},back(){this.go(-1);}};
 return {win,beforePop(fn){beforePop=fn;},emitPop(){events.get('popstate')?.({state:win.history.state});},get canGoBack(){return index>0;}};
}
test('real history closes QR/source overlays, returns through previous screens, and exits only at Home',()=>{
 const b=browser(),states=[];const stop=startTvHistory(b.win),off=subscribeTvHistory(b.win,s=>states.push(s));
 assert.equal(states.at(-1).view,'home');assert.equal(backTv(b.win),false);assert.equal(b.canGoBack,false);
 navigateTv(b.win,'news');navigateTv(b.win,'calendar');navigateTv(b.win,'commands');assert.equal(states.at(-1).view,'commands');
 b.win.history.back();assert.equal(states.at(-1).view,'calendar');b.win.history.back();assert.equal(states.at(-1).view,'news');
 openTvOverlay(b.win,'article',{title:'Public',url:'https://example.com/article'});assert.equal(states.at(-1).overlay,'article');
 b.win.history.back();assert.equal(states.at(-1).overlay,null);assert.equal(states.at(-1).view,'news');
 for(let i=0;i<4;i++){openTvOverlay(b.win,'sources');closeTvOverlay(b.win,'sources');assert.equal(states.at(-1).overlay,null);assert.equal(states.at(-1).view,'news');}
 b.win.history.back();assert.equal(states.at(-1).view,'home');assert.equal(b.canGoBack,false);assert.equal(backTv(b.win),false);
 off();stop();
});
test('direct child links seed Home; Home navigation collapses to root and reload preserves an existing stack',()=>{
 const b=browser('https://example.com/tv?view=calendar');let latest;let stop=startTvHistory(b.win);const off=subscribeTvHistory(b.win,s=>latest=s);
 assert.equal(latest.view,'calendar');assert.equal(latest.depth,1);assert.equal(b.win.history.state.next,'preserved');
 navigateTv(b.win,'news');navigateTv(b.win,'briefing');stop();stop=startTvHistory(b.win);assert.equal(latest.view,'briefing');
 navigateTv(b.win,'home');assert.equal(latest.view,'home');assert.equal(latest.depth,0);assert.equal(b.canGoBack,false);
 off();stop();
 const invalid=browser('https://example.com/tv?view=evil&panel=qr');const dispose=startTvHistory(invalid.win);assert.equal(invalid.win.history.state.bartTv.view,'home');assert.equal(new URL(invalid.win.location.href).searchParams.has('panel'),false);dispose();
});
test('owner display exit removes TV presentation state without changing unrelated history state or owner selector',()=>{
 const b=browser('https://example.com/admin/apps/morning-feed?owner=owner');const stop=startTvHistory(b.win);navigateTv(b.win,'news');exitTvHistory(b.win);
 assert.equal(b.win.history.state.bartTv,undefined);assert.equal(b.win.history.state.next,'preserved');assert.equal(new URL(b.win.location.href).searchParams.get('owner'),'owner');assert.equal(new URL(b.win.location.href).searchParams.has('view'),false);stop();
});


test('article close traverses child-only history and consumes repeats until the parent popstate',()=>{
 const b=browser(),timers=new Map();let id=0;
 b.win.setTimeout=fn=>{timers.set(++id,fn);return id;};b.win.clearTimeout=key=>timers.delete(key);
 const stop=startTvHistory(b.win);navigateTv(b.win,'news');openTvOverlay(b.win,'article',{url:'https://example.com/one'});
 const back=b.win.history.back.bind(b.win.history);let childEntries=2,calls=0;
 b.win.history.back=()=>{calls++;if(childEntries){childEntries--;b.emitPop();return;}back();};
 assert.equal(closeTvOverlay(b.win,'article'),true);assert.equal(calls,1);assert.equal(b.win.history.state.bartTv.overlay,'article');
 assert.equal(closeTvOverlay(b.win,'article'),true);assert.equal(calls,1);
 const tick=()=>{const [key,fn]=timers.entries().next().value;timers.delete(key);fn();};
 tick();assert.equal(b.win.history.state.bartTv.overlay,'article');tick();assert.equal(b.win.history.state.bartTv.overlay,null);assert.equal(b.win.history.state.bartTv.view,'news');assert.equal(timers.size,0);
 navigateTv(b.win,'home');assert.equal(b.win.history.state.bartTv.view,'home');stop();
});
test('article close retry exhaustion and disposal never leave the controller pending',()=>{
 const b=browser(),timers=new Map();let id=0;
 b.win.setTimeout=fn=>{timers.set(++id,fn);return id;};b.win.clearTimeout=key=>timers.delete(key);
 const stop=startTvHistory(b.win);navigateTv(b.win,'news');openTvOverlay(b.win,'article',{url:'https://example.com/one'});
 const back=b.win.history.back.bind(b.win.history);b.win.history.back=()=>{};
 closeTvOverlay(b.win,'article');for(let i=0;i<40&&timers.size;i++){const [key,fn]=timers.entries().next().value;timers.delete(key);fn();}
 assert.equal(timers.size,0);b.win.history.back=back;assert.equal(closeTvOverlay(b.win,'article'),true);assert.equal(b.win.history.state.bartTv.overlay,null);
 openTvOverlay(b.win,'article',{url:'https://example.com/one'});b.win.history.back=()=>{};closeTvOverlay(b.win,'article');assert.equal(timers.size,1);stop();assert.equal(timers.size,0);
});


test('popstate restores the traversed TV entry when Next has replaced current state with an older snapshot',()=>{
 const b=browser();const stop=startTvHistory(b.win);navigateTv(b.win,'news');openTvOverlay(b.win,'article',{url:'https://example.com/one'});
 const stale=b.win.history.state;b.beforePop(()=>b.win.history.replaceState({...stale,next:'current Next metadata'},'',b.win.location.href));
 closeTvOverlay(b.win,'article');assert.equal(b.win.history.state.bartTv.view,'news');assert.equal(b.win.history.state.bartTv.overlay,null);assert.equal(b.win.history.state.next,'current Next metadata');
 b.beforePop(null);navigateTv(b.win,'home');assert.equal(b.win.history.state.bartTv.view,'home');stop();
});
