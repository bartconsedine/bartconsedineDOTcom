import 'server-only';
import { getApp } from '@/lib/apps';
import { serverClient } from '@/lib/supabase';
import { PAGE_SIZE, SLUG } from './model.js';
const columns='id,owner_id,parent_id,author_id,actor_kind,robot_id,author_label,robot_name,kind,status,title,body,tags,project_url,removed_at,created_at,updated_at';
async function connection(context,writing=false){
 const app=await getApp(SLUG,context.dataOwnerId);
 if(!app || writing && app.access.role==='viewer')throw new Error('Access denied');
 return {client:await serverClient(),ownerId:app.access.ownerId};
}
const contentRow=c=>({title:c.title,body:c.body,kind:c.kind,status:c.status,robot_name:c.robotName,tags:c.tags,project_url:c.projectUrl});
export const boardStorage={
 async read(context,filter){
  const {client,ownerId}=await connection(context);const base=()=>client.from('robot_party_messages').select(columns).eq('owner_id',ownerId);
  let parent=null;if(filter.thread){const result=await base().eq('id',filter.thread).is('parent_id',null).maybeSingle();if(result.error)throw result.error;parent=result.data;if(!parent)return null;}
  let query=base();
  if(parent)query=query.eq('parent_id',parent.id);else{query=query.is('parent_id',null).is('removed_at',null);if(filter.kind)query=query.eq('kind',filter.kind);if(filter.status)query=query.eq('status',filter.status);if(filter.q)query=query.ilike('search_text',`%${filter.q.replace(/[\\%_]/g,'\\$&')}%`);}
  if(filter.cursor){
   const cursor=await base().eq('id',filter.cursor).maybeSingle();if(cursor.error)throw cursor.error;if(!cursor.data || (parent?cursor.data.parent_id!==parent.id:cursor.data.parent_id!==null))throw new Error('Cursor unavailable');
   const op=parent?'gt':'lt';const stamp=cursor.data.created_at;const id=cursor.data.id;
   // Both values come from the scoped database row, not raw query text.
   query=query.or(`created_at.${op}.${stamp},and(created_at.eq.${stamp},id.${op}.${id})`);
  }
  const {data,error}=await query.order('created_at',{ascending:Boolean(parent)}).order('id',{ascending:Boolean(parent)}).limit(PAGE_SIZE+1);if(error)throw error;
  const more=data.length>PAGE_SIZE,rows=data.slice(0,PAGE_SIZE);
  return parent?{thread:parent,replies:rows,next:more?rows.at(-1).id:null}:{threads:rows,next:more?rows.at(-1).id:null};
 },
 async write(context,command){
  const {client,ownerId}=await connection(context,true);
  if(command.action==='create'){
   const row={...contentRow(command.content),id:command.id,parent_id:command.parentId,owner_id:ownerId,author_id:context.owner.id};
   const {data,error}=await client.from('robot_party_messages').insert(row).select(columns).single();
   if(error?.code==='23505'){
    const existing=await client.from('robot_party_messages').select(columns).eq('owner_id',ownerId).eq('id',command.id).maybeSingle();if(existing.error)throw existing.error;
    const same=existing.data&&Object.entries(row).every(([key,value])=>JSON.stringify(existing.data[key])===JSON.stringify(value));return same?existing.data:null;
   }
   if(error)throw error;return data;
  }
  const patch=command.action==='remove'?{removed_at:new Date().toISOString()}:contentRow(command.content);
  const {data,error}=await client.from('robot_party_messages').update(patch).eq('owner_id',ownerId).eq('id',command.id).eq('updated_at',command.expectedAt).is('removed_at',null).select(columns).maybeSingle();if(error)throw error;return data;
 },
};
