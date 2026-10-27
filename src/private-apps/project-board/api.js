import { BoardError,exact,project,task,revision } from './model.js';
import { starterProject,starterTasks } from './starter.js';
async function bodyOf(request){if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new BoardError('Send JSON.',415);const reader=request.body?.getReader();if(!reader)throw new BoardError('Body required.');let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24000){await reader.cancel();throw new BoardError('Request too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(all));}catch{throw new BoardError('Invalid JSON.');}}
export function createProjectBoardApi({storage,verifyCalendarLink}){
 const own = context => {if(context.dataOwnerId!==context.owner.id)throw new BoardError('This board is private to its owner.',403);return context.owner.id;};
 const run = async fn => {try{return Response.json(await fn());}catch(e){if(e instanceof BoardError)return Response.json({error:e.message},{status:e.status});throw e;}};
 return {
 GET:(request,context)=>run(()=>storage.list(own(context))),
 POST:(request,context)=>run(async()=>{const owner=own(context),body=await bodyOf(request);if(body.op==='starter'){exact(body,['op']);project(starterProject);starterTasks.forEach(task);await storage.start(starterProject,starterTasks);return {saved:true,...await storage.list(owner)};}
 exact(body,['op','value','expectedRevision']);if(!['projects','tasks'].includes(body.op))throw new BoardError('Unknown operation.');const value=(body.op==='projects'?project:task)(body.value),expected=revision(body.expectedRevision);
 // Only validate a new/changed reference. Existing links remain editable if Google consent expires.
 if(body.op==='tasks'&&value.calendar_id){const old=(await storage.list(owner)).tasks.find(t=>t.id===value.id);if(!old||old.calendar_id!==value.calendar_id||old.event_id!==value.event_id)await verifyCalendarLink(context.owner,value);}
 return {saved:true,record:await storage.save(owner,body.op,value,expected)};
 }),
 };
}
