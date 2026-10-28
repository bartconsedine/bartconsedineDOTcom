import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { archiveDates, issueArticles, mergeIssues, publicLink, historyPage } from '../src/private-apps/morning-feed/tldr/model.js';
import { publicAddress, publicHost, publicGet } from '../src/private-apps/morning-feed/tldr/network.js';
import { collectIssues, loadIssue } from '../src/private-apps/morning-feed/tldr/source.js';
import { createTvApi } from '../src/private-apps/morning-feed/tv/api.js';
const article = (title, url = 'https://example.com/story?v=7&amp;utm_source=tldrnewsletter', extra = '') => `<article ${extra}><a class="font-bold" href="${url}"><h3>${title}</h3></a><div>Public summary</div></article>`;
test('extracts every editorial headline including Quick Links; excludes sponsors in any section and never exports body/navigation', () => {
  const html = '<a href="https://example.com/unsubscribe">Unsubscribe</a><script>private</script>' + Array.from({length: 37}, (_,i) => article(`Story ${i} &amp; more (2 minute read)`, `https://example.com/${i}`)).join('') + article('Top ad (Sponsor)') + article('Sponsored placement') + article('Footer ad', undefined, 'data-sponsor="true"');
  const items = issueArticles(html); assert.equal(items.length,37); assert.equal(items[36].title,'Story 36 & more'); assert.deepEqual(Object.keys(items[0]),['title','url']);
  assert.equal(issueArticles(article('Watch', 'https://youtube.com/watch?v=abc&amp;utm_source=tldr'))[0].url, 'https://youtube.com/watch?v=abc');
});
test('public links preserve functional query parameters while rejecting credentials, private literals and subscriber destinations', () => {
  assert.equal(publicLink('https://wsj.com/a?st=abc&v=7&utm_source=tldr#frag'), 'https://wsj.com/a?st=abc&v=7');
  for (const link of ['javascript:alert(1)','https://user:pass@public.com','http://127.0.0.1/a','https://[::1]/','https://host.local/a','https://example.com/unsubscribe?email=x','https://advertise.tldr.tech/','https://example.com:8080/a']) assert.equal(publicLink(link),null,link);
});
test('archive history is sorted, deduplicated and edition-bound; duplicate articles retain all edition labels', () => {
  assert.deepEqual(archiveDates('<a href="/ai/2026-10-27"></a><a href="/tech/2026-10-28"></a><a href="/tech/2026-10-27"></a><a href="/tech/2026-10-28"></a>', 'tech'), ['2026-10-28','2026-10-27']);
  const result = mergeIssues(['tech','ai'].map(edition => ({edition,date:'2026-10-28',checkedAt:'2026-10-28T12:00:00Z',articles:[{title:'Shared',url:'https://example.com/'}]})),Date.parse('2026-10-28T12:01:00Z'));
  assert.equal(result.articles.length,1); assert.equal(result.articles[0].editions.length,2); assert.equal(result.sources[0].status,'current');
  assert.equal(mergeIssues([{edition:'tech',date:'2026-10-20',checkedAt:'2026-10-28T12:00:00Z'}],Date.parse('2026-10-28T12:01:00Z')).sources[0].status,'older');
  assert.equal(mergeIssues([{edition:'tech',date:'2026-10-28',checkedAt:'2026-10-28T08:00:00Z'}],Date.parse('2026-10-28T12:00:00Z')).sources[0].status,'cached');
  assert.throws(() => historyPage(new Request('https://site.test/?history=-1'))); assert.equal(historyPage(new Request('https://site.test/?history=30')),30);
});
test('SSRF defense denies private, reserved, IPv6 and mixed DNS; TLS uses the validated address and redirects are bounded', async () => {
  for (const ip of ['127.0.0.1','10.0.0.1','100.64.0.1','169.254.169.254','172.16.0.1','192.168.0.1','198.18.0.1','224.0.0.1','::1','::ffff:127.0.0.1']) assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);
  await assert.rejects(publicHost('evil.com',async () => [{address:'8.8.8.8'},{address:'127.0.0.1'}]));
  let calls = 0;
  const transport = (url,options,callback) => {
    calls++; options.lookup('example.com',{},(error,address) => { assert.equal(error,null); assert.equal(address,'8.8.8.8'); });
    const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = error => req.emit('error',error);
    req.end = () => { const res = new EventEmitter(); res.statusCode=302; res.headers={location:'/again'}; res.resume=()=>{}; callback(res); req.emit('close'); };
    return req;
  };
  await assert.rejects(publicGet('https://example.com/',{redirects:2,resolver:async()=>[{address:'8.8.8.8'}],transport}), /Too many redirects/); assert.equal(calls,3);
  await assert.rejects(publicGet('https://127.0.0.1/'),/Unsafe/);
});
test('latest and older issues include all stories and reject parser/link failure instead of overwriting a successful source cache', async () => {
  const get = async url => ({url,text:url.endsWith('archives') ? '<a href="/tech/2026-10-28"></a><a href="/tech/2026-10-27"></a>' : article('An editorial story')});
  const issue = await loadIssue('tech',1,{get,host:async()=> '8.8.8.8',now:()=> '2026-10-28T12:00:00Z'});
  assert.equal(issue.date,'2026-10-27'); assert.equal(issue.articles.length,1); assert.equal(issue.hasOlder,false);
  await assert.rejects(loadIssue('tech',0,{get:async()=>({text:'Broken HTML'}),host:async()=>{}}));
  await assert.rejects(loadIssue('tech',0,{get,host:async()=>{throw Error('DNS failure');}}));
  const partial=await collectIssues(0,async edition=>{if(edition==='ai')throw Error('offline');return {...issue,edition};});
  assert.equal(partial.sources.length,5); assert.equal(partial.sources[1].status,'unavailable'); assert.equal(partial.articles.length,1);
});
test('TLDR read remains behind existing TV connection; pending/revoked/other-owner selectors cannot confer access', async () => {
  let status='pending',calls=0;
  const api = createTvApi({rpc:async()=>({data:{status}}),cookie:()=> 'A'.repeat(43)+'.'+'B'.repeat(43),origin:()=> 'https://example.com',qr:()=>'',getTldr:async page=>{calls++;return {history:page,articles:[],sources:[]};}});
  const req=new Request('https://example.com/api/tv?feed=tldr&history=2&owner=victim');
  assert.equal((await api.GET(req)).status,401); assert.equal(calls,0);
  status='connected'; const response=await api.GET(req); assert.equal(response.status,200); assert.equal((await response.json()).history,2); assert.equal(calls,1); assert.match(response.headers.get('cache-control'),/private, no-store/);
  status='expired'; assert.equal((await api.GET(req)).status,401); assert.equal(calls,1);
});
