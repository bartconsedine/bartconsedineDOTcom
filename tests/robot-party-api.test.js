import test from 'node:test';import assert from 'node:assert/strict';
import {validateCommand,validateQuery,emptyContent} from '../src/private-apps/robot-party/model.js';import {createBoardApi} from '../src/private-apps/robot-party/api.js';import {createRobotApi} from '../src/private-apps/robot-party/robot-api.js';import {createRobotsApi} from '../src/private-apps/robot-party/robots-api.js';
const id='11111111-1111-4111-8111-111111111111',content={...emptyContent(),title:'Progress',body:'A useful update'},command={action:'create',id,parentId:null,content};
const req=(body,headers={})=>new Request('https://example.com/api/robot-party',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('messages reject unknown fields, unsafe links, empty content, excess tags, malformed cursor and stale revision input',()=>{
 assert.deepEqual(validateCommand(command),command);
 for(const value of [{...command,owner:id},{...command,content:{...content,projectUrl:'javascript:alert(1)'}},{...command,content:{...content,projectUrl:'https://user:pass@example.com'}},{...command,content:{...content,body:' '}},{...command,content:{...content,tags:['x','x']}},{action:'edit',id,expectedAt:'yesterday',content}])assert.throws(()=>validateCommand(value));
 for(const query of ['cursor=bad','thread='+id+'&thread='+id,'kind=reply','q='+ 'x'.repeat(121)])assert.throws(()=>validateQuery(new URLSearchParams(query)));
});
test('human API confirms database writes, denies viewers, retains conflicts and hides database details',async()=>{
 let writes=0;const api=createBoardApi({write:async()=>{writes++;return {id};},read:async()=>({threads:[]})});
 const context={owner:{id},permission:'viewer'};assert.equal((await api.POST(req(command),context)).status,403);assert.equal(writes,0);
 context.permission='editor';assert.equal((await api.POST(req({...command,extra:true}),context)).status,400);assert.equal(writes,0);assert.equal((await api.POST(req(command),context)).status,200);assert.equal(writes,1);
 assert.equal((await createBoardApi({write:async()=>null}).POST(req(command),context)).status,409);
 const failure=await createBoardApi({read:async()=>{throw Error('internal secret');}}).GET(new Request('https://example.com'),context);assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/internal secret/);
});
test('robot API requires bearer capability, rejects owner override, never substitutes cookie auth and bounds bodies',async()=>{
 let calls=0,args;const api=createRobotApi(async(name,input)=>{calls++;args={name,input};return {data:{threads:[]}};});
 const auth={authorization:'Bearer rp_'+'A'.repeat(43)};
 assert.equal((await api(new Request('https://example.com/api/robot-party',{headers:{cookie:'admin=1'}}))).status,401);
 assert.equal((await api(new Request('https://example.com/api/robot-party?owner='+id,{headers:auth}))).status,400);assert.equal(calls,0);
 const response=await api(new Request('https://example.com/api/robot-party',{headers:auth}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(args.name,'robot_party_read');
 assert.equal((await api(req(command,auth))).status,200);assert.equal(args.name,'robot_party_write');assert.deepEqual(args.input.command,command);
 assert.equal((await api(req({...command,content:{...content,body:'x'.repeat(40001)}},auth))).status,413);
 for(const [message,status] of [['robot_access_denied',401],['robot_read_only',403],['robot_conflict',409],['robot_rate_limited',429]])assert.equal((await createRobotApi(async()=>({error:{message}}))(req(command,auth))).status,status);
 const help=await api(new Request('https://example.com/api/robot-party?help=1'));assert.equal(help.status,200);assert.match((await help.json()).contentPolicy,/untrusted/);
});
test('robot management requires app access and same origin; only a one-time key is returned while storage receives a hash',async()=>{
 let stored;const api=createRobotsApi({authorize:async()=>({ok:true,user:{id},ownerId:id,role:'owner'}),siteOrigin:()=> 'https://example.com',storage:{create:async(owner,data)=>{stored=data;return {id};},list:async()=>[]}});
 const body={action:'create',id,name:'Party bot',role:'writer'};
 assert.equal((await api(req(body))).status,403);assert.equal(stored,undefined);
 const response=await api(req(body,{origin:'https://example.com'}));const data=await response.json();assert.equal(response.status,200);assert.match(data.token,/^rp_[A-Za-z0-9_-]{43}$/);assert.match(stored.hash,/^[a-f0-9]{64}$/);assert.equal(stored.token,undefined);assert.notEqual(stored.hash,data.token);
 assert.equal((await createRobotsApi({authorize:async()=>({ok:false,reason:'forbidden',status:403})})(req(body))).status,403);
});
test('member token endpoint scopes every operation to authorized board and denies viewer writer delegation',async()=>{
 let calls=0,selected;const access={ok:true,user:{id:'33333333-3333-4333-8333-333333333333'},ownerId:id,role:'viewer'};
 const api=createRobotsApi({authorize:async owner=>{selected=owner;return owner===id?access:{ok:false,status:404,reason:'not_found'};},siteOrigin:()=> 'https://example.com',storage:{list:async context=>{assert.equal(context.ownerId,id);calls++;return[];},create:async(context,input)=>{assert.equal(context.user.id,access.user.id);calls++;return{id:input.id};},revoke:async()=>{calls++;return null;}}});
 const request=(body,owner=id)=>new Request('https://example.com/api/admin/robot-party/robots?owner='+owner,{method:body?'POST':'GET',headers:{origin:'https://example.com','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await api(request())).status,200);assert.equal(selected,id);assert.equal(calls,1);
 const body={action:'create',id,name:'Member robot',role:'writer'};assert.equal((await api(request(body))).status,403);assert.equal(calls,1);assert.equal((await api(request({...body,role:'reader'}))).status,200);assert.equal(calls,2);
 assert.equal((await api(request(body,'22222222-2222-4222-8222-222222222222'))).status,404);assert.equal(calls,2);
 assert.equal((await api(new Request('https://example.com/api/admin/robot-party/robots?owner='+id+'&owner='+id))).status,400);
 assert.equal((await api(request({action:'revoke',id,expectedAt:'2026-10-27T00:00:00.000001+00:00'}))).status,409);
});
