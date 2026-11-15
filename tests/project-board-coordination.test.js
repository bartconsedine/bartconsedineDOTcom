import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectBoardApi } from '../src/private-apps/project-board/api.js';
import { BoardError } from '../src/private-apps/project-board/model.js';
import { workflowDefaults } from '../src/private-apps/project-board/workflow-model.js';
import { projectBoardSql } from '../scripts/project-board-sql.mjs';

const owner='11111111-1111-4111-8111-111111111111', runId='22222222-2222-4222-8222-222222222222', messageId='33333333-3333-4333-8333-333333333333';
const context={owner:{id:owner},dataOwnerId:owner};
const request=body=>new Request('https://site.test/api/admin/apps/project-board',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function fixture(){
 const calls=[];
 const data={projects:[],tasks:[],jobs:[],schedules:[],runs:[],approvals:[],deliveries:[],events:[]};
 const storage={list:async id=>{calls.push(['list',id]);return data;},save:async(...args)=>{calls.push(['save',...args]);return {...args[2],revision:1};}};
 for(const name of ['dispatch','cancel','reconcile','deliver'])storage[name]=async(...args)=>{calls.push([name,...args]);return name==='deliver'?{attempted:true,recorded:true}:{saved:true,accepted:name==='dispatch'};};
 return {calls,data,storage,api:createProjectBoardApi({storage,verifyCalendarLink:async()=>{throw Error('Unexpected Google access');}})};
}
test('coordination commands validate exact identities and revisions; receipt cannot claim execution success',async()=>{
 const f=fixture();
 const response=await f.api.POST(request({op:'dispatch',runId,id:messageId,expectedRevision:7}),context);
 assert.equal(response.status,200);assert.deepEqual(f.calls[0],['dispatch',owner,runId,messageId,7]);assert.deepEqual((await response.json()).runs,[]);
 f.calls.length=0;
 const receipt=await (await f.api.POST(request({op:'deliver'}),context)).json();
 assert.equal(receipt.attempted,true);assert.equal(receipt.recorded,true);assert.equal(receipt.saved,undefined);assert.equal(receipt.succeeded,undefined);
 for(const body of [{op:'dispatch',runId,id:messageId,expectedRevision:null},{op:'dispatch',runId,id:'invalid',expectedRevision:1},{op:'cancel',runId,expectedRevision:0},{op:'reconcile',owner_id:owner},{op:'deliver',id:messageId},{op:'__proto__',value:{},expectedRevision:null}]){
  f.calls.length=0;assert.ok((await f.api.POST(request(body),context)).status>=400);assert.deepEqual(f.calls,[]);
 }
});
test('GET never reconciles or dispatches; foreign-owner commands fail before storage',async()=>{
 const f=fixture();await f.api.GET(new Request('https://site.test'),context);assert.deepEqual(f.calls,[['list',owner]]);
 f.calls.length=0;const other={...context,dataOwnerId:runId};
 for(const op of ['reconcile','deliver'])assert.equal((await f.api.POST(request({op}),other)).status,403);
 assert.deepEqual(f.calls,[]);
});
test('conflicts and disconnected delivery remain explicit failures without repeat attempts',async()=>{
 const f=fixture();let calls=0;f.storage.dispatch=async()=>{calls++;throw new BoardError('Refresh to reconcile.',409);};
 const response=await f.api.POST(request({op:'dispatch',runId,id:messageId,expectedRevision:1}),context);
 assert.equal(response.status,409);assert.equal(calls,1);assert.deepEqual(f.calls,[]);
 f.storage.deliver=async()=>{throw new BoardError('Disconnected.',503);};
 assert.equal((await f.api.POST(request({op:'deliver'}),context)).status,503);
});
test('a failed read after a committed command preserves its result and asks for readback',async()=>{
 const f=fixture();f.storage.list=async()=>{throw new BoardError('Read unavailable',503);};
 const result=await f.api.POST(request({op:'dispatch',runId,id:messageId,expectedRevision:1}),context);
 assert.equal(result.status,200);const value=await result.json();assert.equal(value.saved,true);assert.equal(value.accepted,true);assert.match(value.refreshError,/Read the saved record/);
 assert.deepEqual(f.calls,[['dispatch',owner,runId,messageId,1]],'known dispatch must not be repeated');
});
test('workflow maintenance uses a reviewed owner/revision guard and preserves provider revision strings',()=>{
 const job={...workflowDefaults('jobs'),id:runId,title:"Private task'; select 'literal'",provider_revision:'provider-revision-abc'};
 const sql=projectBoardSql({operation:'write',email:'bartconsedine@gmail.com',kind:'jobs',value:job,expectedRevision:4});
 assert.match(sql,/d\.owner_id=o\.user_id/);assert.match(sql,/d\.revision=4/);assert.match(sql,/provider_revision='provider-revision-abc'/);assert.doesNotMatch(sql,/provider-revision-abc'::integer/);assert.match(sql,/Private task''; select ''literal''/);
 assert.throws(()=>projectBoardSql({operation:'write',email:'bartconsedine@gmail.com',kind:'events',value:{},expectedRevision:null}));
 assert.throws(()=>projectBoardSql({operation:'write',email:'someone@example.com',kind:'jobs',value:job,expectedRevision:null}));
 assert.throws(()=>projectBoardSql({operation:'write',email:'bartconsedine@gmail.com',kind:'jobs',value:{...job,owner_id:owner},expectedRevision:null}));
});
