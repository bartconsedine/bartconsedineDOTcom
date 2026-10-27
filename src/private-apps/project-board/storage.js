import 'server-only';
import { serverClient } from '../../lib/supabase';
import { BoardError } from './model';
export function createBoardStorage(clientFor=serverClient){
 const table = kind => `project_board_${kind}`;
 const check = result => {if(result.error)throw new BoardError('Board storage unavailable. Check that its reviewed migration is active, then retry.',503);return result.data;};
 return {
 async list(owner){const client=await clientFor();const [p,t]=await Promise.all(['projects','tasks'].map(kind=>client.from(table(kind)).select('*').eq('owner_id',owner).order('id').limit(1001)));const projects=check(p),tasks=check(t);if(projects.length>1000||tasks.length>1000)throw new BoardError('Board exceeds the supported 1,000-row view. Ask for a scoped export.',503);return {projects,tasks};},
 async save(owner,kind,value,expected){const client=await clientFor();const rows=expected===null?await client.from(table(kind)).insert({...value,owner_id:owner}).select('*'):await client.from(table(kind)).update(value).eq('owner_id',owner).eq('id',value.id).eq('revision',expected).select('*');if(rows.error?.code==='23505')throw new BoardError('Record already exists. Refresh before editing.',409);const data=check(rows);if(data.length!==1)throw new BoardError('Record changed in another editor. Refresh and reconcile your draft.',409);return data[0];},
 async start(project,tasks){const client=await clientFor();check(await client.rpc('project_board_start',{p_project:project,p_tasks:tasks}));},
 };
}
export const boardStorage=createBoardStorage();
