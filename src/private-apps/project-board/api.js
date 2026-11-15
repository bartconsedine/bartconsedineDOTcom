import { BoardError,exact,project,task,revision,uuid } from './model.js';
import { WORKFLOW_FIELDS, workflowRecord } from './workflow-model.js';
import { starterProject,starterTasks } from './starter.js';
async function bodyOf(request){if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new BoardError('Send JSON.',415);const reader=request.body?.getReader();if(!reader)throw new BoardError('Body required.');let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24000){await reader.cancel();throw new BoardError('Request too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(all));}catch{throw new BoardError('Invalid JSON.');}}
export function createProjectBoardApi({storage,verifyCalendarLink}){
 const own = context => {if(context.dataOwnerId!==context.owner.id)throw new BoardError('This board is private to its owner.',403);return context.owner.id;};
 const run = async fn => {try{return Response.json(await fn());}catch(e){if(e instanceof BoardError)return Response.json({error:e.message},{status:e.status});throw e;}};
 return {
 GET:(request,context)=>run(()=>storage.list(own(context))),
 POST:(request,context)=>run(async()=>{const owner=own(context),body=await bodyOf(request);
 const keys={starter:['op'],reconcile:['op'],deliver:['op'],dispatch:['op','runId','id','expectedRevision'],cancel:['op','runId','expectedRevision']};
 exact(body,Object.hasOwn(keys,body?.op)?keys[body.op]:['op','value','expectedRevision']);
 if(body.op==='starter'){project(starterProject);starterTasks.forEach(task);await storage.start(starterProject,starterTasks);return {saved:true,...await storage.list(owner)};}
 if(['dispatch','cancel','reconcile','deliver'].includes(body.op)){
  if(typeof storage[body.op]!=='function')throw new BoardError('Workflow setup is unavailable.',503);
  let result;
  if(['dispatch','cancel'].includes(body.op)){
   uuid(body.runId);const expected=revision(body.expectedRevision);if(expected===null)throw new BoardError('Refresh this run before acting.',409);
   result=body.op==='dispatch'?await storage.dispatch(owner,body.runId,uuid(body.id),expected):await storage.cancel(owner,body.runId,expected);
  }else result=await storage[body.op](owner);
  // The command may already be committed. A later read failure must not turn
  // that known result into an apparent failed action that invites a new send.
  try{return {...result,...await storage.list(owner)};}
  catch{return {...result,refreshError:'The operation returned, but refreshing the board failed. Read the saved record before taking another action.'};}
 }
 if(!['projects','tasks',...Object.keys(WORKFLOW_FIELDS)].includes(body.op))throw new BoardError('Unknown operation.');const value=body.op==='projects'?project(body.value):body.op==='tasks'?task(body.value):workflowRecord(body.op,body.value),expected=revision(body.expectedRevision);
 // Only validate a new/changed reference. Existing links remain editable if Google consent expires.
 if(body.op==='tasks'&&value.calendar_id){const old=(await storage.list(owner)).tasks.find(t=>t.id===value.id);if(!old||old.calendar_id!==value.calendar_id||old.event_id!==value.event_id)await verifyCalendarLink(context.owner,value);}
 return {saved:true,record:await storage.save(owner,body.op,value,expected)};
 }),
 };
}
