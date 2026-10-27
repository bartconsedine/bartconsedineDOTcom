// Trusted operator path only. Never expose as a web endpoint.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {project,task,revision} from '../src/private-apps/project-board/model.js';
export const PROJECT_ID='vgsmfbupgydafvotkold';
const literal=value=>value===null?'null':`'${String(value).replaceAll("'","''")}'`;
export function projectBoardSql({operation,email,kind,value,expectedRevision}){
 if(!['bartconsedine@gmail.com','mjshah8@gmail.com'].includes(email))throw new Error('Specify an approved owner email');
 const owner=`owner as (select a.user_id from private.site_admin a join auth.users u on u.id=a.user_id where a.email=${literal(email)} and lower(u.email)=a.email and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=a.email))`;
 if(operation==='read')return `with ${owner} select exists(select 1 from owner) authorized,coalesce((select jsonb_agg(p) from public.project_board_projects p join owner o on o.user_id=p.owner_id),'[]'::jsonb) projects,coalesce((select jsonb_agg(t) from public.project_board_tasks t join owner o on o.user_id=t.owner_id),'[]'::jsonb) tasks;`;
 if(operation!=='write'||!['projects','tasks'].includes(kind))throw new Error('Use read or write and a supported record kind');
 (kind==='projects'?project:task)(value);revision(expectedRevision);if(Buffer.byteLength(JSON.stringify(value))>20000)throw new Error('Change too large');
 const table=`public.project_board_${kind}`,keys=Object.keys(value),cast=k=>k==='due_date'?'::date':['id','project_id'].includes(k)?'::uuid':'';
 // Google references can only be added/replaced by the Google-verified browser API.
 if(kind==='tasks'&&expectedRevision===null&&value.calendar_id!==null)throw new Error('Add calendar links in the verified browser workflow');
 const scope=`d.owner_id=o.user_id and d.id=${literal(value.id)}::uuid and d.revision=${expectedRevision}`;
 const linkGuard=kind==='tasks'?` and d.calendar_id is not distinct from ${literal(value.calendar_id)} and d.event_id is not distinct from ${literal(value.event_id)}`:'';
 const change=expectedRevision===null?`insert into ${table}(owner_id,${keys.join(',')}) select user_id,${keys.map(k=>literal(value[k])+cast(k)).join(',')} from owner on conflict do nothing returning revision`:`update ${table} d set ${keys.filter(k=>k!=='id').map(k=>`${k}=${literal(value[k])}${cast(k)}`).join(',')} from owner o where ${scope}${linkGuard} returning d.revision`;
 return `with ${owner},changed as (${change}) select exists(select 1 from owner) authorized,exists(select 1 from changed) saved,(select revision from changed) revision;`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const[operation,email,file]=process.argv.slice(2);if(process.argv.length!==(operation==='read'?4:5))throw new Error('Usage: read <owner-email> | write <owner-email> <change.json>');let change={};if(operation==='write'){const bytes=await readFile(file);if(bytes.length>24000)throw new Error('Change too large');change=JSON.parse(bytes);if(!change||Object.keys(change).sort().join()!=='expectedRevision,kind,value')throw new Error('Use only kind, value, expectedRevision');}console.log(JSON.stringify({project_id:PROJECT_ID,query:projectBoardSql({operation,email,...change})}));}catch(e){console.error(e.message);process.exitCode=1;}}
