// Trusted operator path only. Never expose as a web endpoint.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {project,task,revision} from '../src/private-apps/project-board/model.js';
import {WORKFLOW_FIELDS,workflowRecord} from '../src/private-apps/project-board/workflow-model.js';
export const PROJECT_ID='vgsmfbupgydafvotkold';
const literal=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`;
export function projectBoardSql({operation,email,kind,value,expectedRevision}){
 if(!['bartconsedine@gmail.com','mjshah8@gmail.com'].includes(email))throw new Error('Specify an approved owner email');
 const owner=`owner as (select a.user_id from private.site_admin a join auth.users u on u.id=a.user_id where a.email=${literal(email)} and lower(u.email)=a.email and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=a.email))`;
 const kinds=['projects','tasks',...Object.keys(WORKFLOW_FIELDS)];
 if(operation==='read')return `with ${owner} select exists(select 1 from owner) authorized,${[...kinds,'events'].map(name=>`coalesce((select jsonb_agg(d order by d.created_at,d.id) from public.project_board_${name} d join owner o on o.user_id=d.owner_id),'[]'::jsonb) ${name}`).join(',')};`;
 if(operation!=='write'||!kinds.includes(kind))throw new Error('Use read or write and a supported record kind');
 if(kind==='projects')project(value);else if(kind==='tasks')task(value);else workflowRecord(kind,value);
 revision(expectedRevision);if(Buffer.byteLength(JSON.stringify(value))>20000)throw new Error('Change too large');
 const table=`public.project_board_${kind}`,keys=Object.keys(value);
 const sqlValue=(key,item)=>{
  if(item===null)return 'null';
  if(key==='evidence')return literal(JSON.stringify(item))+'::jsonb';
  const cast=key==='due_date'?'::date':key==='id'||key.endsWith('_id')&&!key.startsWith('provider_')&&!['calendar_id','event_id'].includes(key)?'::uuid':['job_revision','task_revision','run_revision'].includes(key)?'::integer':key==='requires_approval'?'::boolean':key.endsWith('_at')?'::timestamptz':'';
  return literal(item)+cast;
 };
 // Google references can only be added/replaced by the Google-verified browser API.
 if(kind==='tasks'&&expectedRevision===null&&value.calendar_id!==null)throw new Error('Add calendar links in the verified browser workflow');
 const scope=`d.owner_id=o.user_id and d.id=${literal(value.id)}::uuid and d.revision=${expectedRevision}`;
 const linkGuard=kind==='tasks'?` and d.calendar_id is not distinct from ${literal(value.calendar_id)} and d.event_id is not distinct from ${literal(value.event_id)}`:'';
 const change=expectedRevision===null?`insert into ${table}(owner_id,${keys.join(',')}) select user_id,${keys.map(k=>sqlValue(k,value[k])).join(',')} from owner on conflict do nothing returning revision`:`update ${table} d set ${keys.filter(k=>k!=='id').map(k=>`${k}=${sqlValue(k,value[k])}`).join(',')} from owner o where ${scope}${linkGuard} returning d.revision`;
 return `with ${owner},changed as (${change}) select exists(select 1 from owner) authorized,exists(select 1 from changed) saved,(select revision from changed) revision;`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const[operation,email,file]=process.argv.slice(2);if(process.argv.length!==(operation==='read'?4:5))throw new Error('Usage: read <owner-email> | write <owner-email> <change.json>');let change={};if(operation==='write'){const bytes=await readFile(file);if(bytes.length>24000)throw new Error('Change too large');change=JSON.parse(bytes);if(!change||Object.keys(change).sort().join()!=='expectedRevision,kind,value')throw new Error('Use only kind, value, expectedRevision');}console.log(JSON.stringify({project_id:PROJECT_ID,query:projectBoardSql({operation,email,...change})}));}catch(e){console.error(e.message);process.exitCode=1;}}
