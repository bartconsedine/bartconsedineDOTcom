import test from 'node:test';
import assert from 'node:assert/strict';
import { articleId, createNewsProgress, newestFirst } from '../src/private-apps/morning-feed/tldr/progress-model.js';
import { mergeIssues } from '../src/private-apps/morning-feed/tldr/model.js';
import { createNewsProgressApi } from '../src/private-apps/morning-feed/tldr/progress-api.js';
const url = 'https://example.com/story?id=7';
const stamp = '2026-11-01T01:00:00Z';
test('canonical read identity ignores tracking and fragments but preserves functional article parameters', async () => {
  assert.equal(await articleId(url), await articleId(url + '&utm_source=tldr#comments'));
  assert.notEqual(await articleId(url), await articleId('https://example.com/story?id=8'));
  await assert.rejects(articleId('javascript:alert(1)'), /Invalid article/);
});
test('newest issue date wins across editions and duplicates, with stable order for ties and missing dates last', () => {
  const article = (id, date) => ({ url: `https://example.com/${id}`, editions: [{ date }] });
  const original = [article('old','2026-10-28'), article('b','2026-10-31'), article('a','2026-10-31'), article('undated',null)];
  assert.deepEqual(newestFirst(original).map(a => a.url.split('/').pop()), ['a','b','old','undated']);
  assert.equal(original[0].url, 'https://example.com/old');
  const merged = mergeIssues([{ edition:'tech',date:'2026-10-28',articles:[{url:'https://example.com/old'},{url:'https://example.com/repeated'}] }, { edition:'ai',date:'2026-10-31',articles:[{url:'https://example.com/repeated'}] }]);
  assert.equal(merged.articles[0].url, 'https://example.com/repeated');
});
test('confirmed append-only progress resumes in another session and survives a late stale list response', async () => {
  const stored = new Map(); let delayed = null;
  const fetcher = async (_, options) => {
    if (options.method === 'POST') { const id = await articleId(JSON.parse(options.body).url); stored.set(id, stamp); return Response.json({state:'saved',id,readAt:stamp}); }
    const result = Response.json({state:'ready',reads:[...stored].map(([id,readAt])=>({id,readAt}))});
    if (delayed) { const resolve = delayed; delayed = null; return new Promise(done => resolve(()=>done(result))); }
    return result;
  };
  const first = createNewsProgress({endpoint:'/progress',fetcher}); await first.load();
  let release; delayed = resolve => { release = resolve; };
  const stale = first.load();
  const saved = await first.mark(url); assert.ok(saved.has(await articleId(url)));
  release(); assert.ok((await stale).has(await articleId(url)));
  const second = createNewsProgress({endpoint:'/progress',fetcher}); assert.ok((await second.load()).has(await articleId(url)));
  await second.mark('https://example.com/another'); assert.equal((await first.load()).size,2);
});
test('disabled, failed, malformed and unconfirmed saves never pretend to persist', async () => {
  for (const result of [{state:'disabled',reads:[]},{state:'ready',reads:[{id:'bad'}]}]) {
    await assert.rejects(createNewsProgress({endpoint:'/progress',fetcher:async()=>Response.json(result)}).load());
  }
  let fail = true;
  const client = createNewsProgress({endpoint:'/progress',fetcher:async(_,options)=>options.method === 'POST' ? Response.json(fail ? {state:'unavailable'} : {state:'saved',id:'bad',readAt:stamp}) : Response.json({state:'ready',reads:[]})});
  await client.load(); await assert.rejects(client.mark(url),/not saved/); fail = false;
  await assert.rejects(client.mark(url),/not saved/); assert.equal((await client.load()).size,0);
});
const origin = 'https://bartconsedine.com';
const request = (body={action:'read',url},headers={}) => new Request(origin+'/api/tv/news-progress',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('API uses only the signed-in owner or paired cookie, hashes canonical URLs, and returns private responses', async () => {
  const calls=[]; const rpc=async(name,args)=>{calls.push([name,args]);return {data:args.p_action === 'list'?{state:'ready',reads:[]}:{state:'saved',id:args.p_article_id,readAt:stamp}};};
  const api=createNewsProgressApi({rpc,cookie:async()=>`${'D'.repeat(43)}.${'A'.repeat(43)}`,origin:()=>origin});
  const response=await api.POST(request({action:'read',url:url+'&utm_source=x'})); assert.equal(response.status,200); assert.match(response.headers.get('cache-control'),/private, no-store/);
  assert.equal(calls[0][1].p_secret,'D'.repeat(43)); assert.equal(calls[0][1].p_article_id,await articleId(url));
  const owner=createNewsProgressApi({rpc,authorize:async()=>({ok:true}),origin:()=>origin});
  assert.equal((await owner.GET(new Request(origin+'/api/admin/news-progress'))).status,200); assert.equal(calls[1][1].p_secret,null);
});
test('API rejects forged owner selectors, cross-origin writes, invalid bodies, missing cookies and RPC denial', async () => {
  let called=0; const rpc=async()=>{called++;return {error:{message:'news_progress_denied'}};};
  const api=createNewsProgressApi({rpc,cookie:async()=>`${'D'.repeat(43)}.${'A'.repeat(43)}`,origin:()=>origin});
  for (const bad of [{action:'read',url,owner:'other'},{action:'delete',url},{action:'read',url:'http://127.0.0.1/secret'},{action:'read',url:'https://example.com/'+ 'a'.repeat(5000)}]) assert.equal((await api.POST(request(bad))).status,400);
  assert.equal((await api.GET(new Request(origin+'/api/tv/news-progress?owner=other'))).status,400);
  assert.equal((await api.POST(request(undefined,{origin:'https://evil.example'}))).status,403);
  assert.equal((await api.POST(request(undefined,{'sec-fetch-site':'cross-site'}))).status,403);
  assert.equal(called,0);
  assert.equal((await api.POST(request())).status,403);
  const missing=createNewsProgressApi({rpc,cookie:async()=>null,origin:()=>origin});assert.equal((await missing.POST(request())).status,401);
  const expired=createNewsProgressApi({rpc,authorize:async()=>({ok:false,status:401}),origin:()=>origin});assert.equal((await expired.POST(request())).status,401);
  const unavailable=createNewsProgressApi({rpc:async()=>{throw Error('secret connection');},authorize:async()=>({ok:true}),origin:()=>origin});
  const response=await unavailable.POST(request());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret/);
});

test('overlapping lists cannot erase a read learned from another session', async () => {
  const id = await articleId(url); let release, calls = 0;
  const client = createNewsProgress({ endpoint:'/progress', fetcher:async () => {
    if (++calls === 1) return new Promise(resolve => { release = () => resolve(Response.json({state:'ready',reads:[]})); });
    return Response.json({state:'ready',reads:[{id,readAt:stamp}]});
  } });
  const stale = client.load();
  assert.ok((await client.load()).has(id)); release();
  assert.ok((await stale).has(id));
});
