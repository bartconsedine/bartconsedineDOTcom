import 'server-only';
import { serverClient } from '../../lib/supabase';
import { BoardError } from './model';
import { WORKFLOW_FIELDS } from './workflow-model';
import { createWorkflowStorage } from './workflow-storage';
import { personalConfig, personalStorage } from '../robot-party/personal/storage';
import { dispatchOne, unseal } from '../robot-party/personal/transport';

// Use the existing granted private channel and its durable notification outbox.
// A notification receipt is deliberately never reported as an action outcome.
export function createBoardStorage(clientFor=serverClient, coordination={configuration:personalConfig,storage:personalStorage,deliver:dispatchOne}){
 const workflow=createWorkflowStorage(clientFor);
 const table = kind => `project_board_${kind}`;
 const check = result => {if(result.error)throw new BoardError('Board storage unavailable. Check that its reviewed migration is active, then retry.',503);return result.data;};
 async function connection(){
  const config=coordination.configuration();
  if(!config)throw new BoardError('Private Dot delivery is not configured. Nothing new was queued.',503);
  const snapshot=await coordination.storage.owner('snapshot',{});
  if(!snapshot.connectionActive||!snapshot.channel||!snapshot.subscription)throw new BoardError('The existing private Dot subscription is disconnected. Nothing new was queued.',503);
  try{unseal(snapshot.subscription,snapshot.channel,config.key);}catch{throw new BoardError('The existing private Dot subscription cannot be verified. Nothing new was queued.',503);}
  return config;
 }
 return {
 async list(owner){
  const client=await clientFor();const [p,t]=await Promise.all(['projects','tasks'].map(kind=>client.from(table(kind)).select('*').eq('owner_id',owner).order('id').limit(1001)));const projects=check(p),tasks=check(t);if(projects.length>1000||tasks.length>1000)throw new BoardError('Board exceeds the supported 1,000-row view. Ask for a scoped export.',503);
  try{return {projects,tasks,...await workflow.list(owner)};}catch(error){
   // During the guarded code-then-schema rollout preserve the old board, but
   // explicitly report that workflow records could not be loaded. No empty
   // workflow collections or fabricated data substitute for a failed read.
   if(error instanceof BoardError&&error.schemaMissing)return {projects,tasks,workflowError:error.message};
   throw error;
  }
 },
 async save(owner,kind,value,expected){
  if(Object.hasOwn(WORKFLOW_FIELDS,kind))return workflow.save(owner,kind,value,expected);
  const client=await clientFor();const rows=expected===null?await client.from(table(kind)).insert({...value,owner_id:owner}).select('*'):await client.from(table(kind)).update(value).eq('owner_id',owner).eq('id',value.id).eq('revision',expected).select('*');if(rows.error?.code==='23505')throw new BoardError('Record already exists. Refresh before editing.',409);const data=check(rows);if(data.length!==1)throw new BoardError('Record changed in another editor. Refresh and reconcile your draft.',409);return data[0];
 },
 async start(project,tasks){const client=await clientFor();check(await client.rpc('project_board_start',{p_project:project,p_tasks:tasks}));},
 async dispatch(owner,runId,id,expected){await connection();return workflow.dispatch(owner,runId,id,expected);},
 cancel:(owner,runId,expected)=>workflow.cancel(owner,runId,expected),
 reconcile:owner=>workflow.reconcile(owner),
 async deliver(){const config=await connection();return coordination.deliver(coordination.storage,config.key);},
 };
}
export const boardStorage=createBoardStorage();
