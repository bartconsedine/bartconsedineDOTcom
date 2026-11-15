import 'server-only';
import { serverClient } from '../../lib/supabase';
import { BoardError } from './model';
import { WORKFLOW_KINDS, workflowRecord } from './workflow-model';

export function createWorkflowStorage(clientFor=serverClient){
 const check=result=>{
  if(result.error){
   if(['PGRST205','42P01','42883'].includes(result.error.code)){const error=new BoardError('Workflow schema is not active. Existing projects and tasks remain available.',503);error.schemaMissing=true;throw error;}
   const message=result.error.message??'';
   if(message.includes('board_conflict'))throw new BoardError('This request changed or was already dispatched. Refresh and reconcile before retrying.',409);
   if(message.includes('board_approval_required'))throw new BoardError('Approve the exact current request revision before dispatching it.',409);
   if(message.includes('board_disconnected')||message.includes('personal_disconnected'))throw new BoardError('The existing private Dot connection is disconnected. Nothing new was dispatched.',503);
   if(message.includes('board_access_denied'))throw new BoardError('This workflow is private to its owner.',403);
   if(message.includes('board_invalid_request_size'))throw new BoardError('The approved request and linked definitions exceed the private message limit. Shorten the request or definitions, then review the new revision.',400);
   if(message.includes('board_invalid'))throw new BoardError('The workflow request is invalid.',400);
   throw new BoardError('Workflow storage is unavailable. Its reviewed migration may need activation; retry after checking setup.',503);
  }
  return result.data;
 };
 const rpc=async(name,params)=>check(await (await clientFor()).rpc(name,params));
 return {
  async list(owner){const client=await clientFor();const names=[...WORKFLOW_KINDS,'events'];const rows=await Promise.all(names.map(kind=>client.from(`project_board_${kind}`).select('*').eq('owner_id',owner).order('created_at',{ascending:false}).limit(1001)));return Object.fromEntries(rows.map((result,index)=>{const data=check(result);if(data.length>1000)throw new BoardError('Workflow exceeds the supported 1,000-row view. Request a scoped export.',503);return[names[index],data];}));},
  async save(owner,kind,value,expectedRevision){workflowRecord(kind,value);const client=await clientFor();const result=expectedRevision===null?await client.from(`project_board_${kind}`).insert({...value,owner_id:owner}).select('*'):await client.from(`project_board_${kind}`).update(value).eq('owner_id',owner).eq('id',value.id).eq('revision',expectedRevision).select('*');if(result.error?.code==='23505')throw new BoardError('This workflow record already exists. Refresh before editing.',409);const rows=check(result);if(rows.length!==1)throw new BoardError('This workflow changed in another editor. Refresh and reconcile your draft.',409);return rows[0];},
  dispatch(_owner,runId,id,expectedRevision){return rpc('project_board_dispatch',{p_run_id:runId,p_message_id:id,p_expected_revision:expectedRevision});},
  cancel(_owner,runId,expectedRevision){return rpc('project_board_cancel',{p_run_id:runId,p_expected_revision:expectedRevision});},
  reconcile(){return rpc('project_board_reconcile',{});},
 };
}
export const workflowStorage=createWorkflowStorage();
