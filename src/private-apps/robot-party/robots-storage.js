import 'server-only';
import {serverClient} from '../../lib/supabase';
const columns='id,created_by,name,role,expires_at,revoked_at,created_at,updated_at';
export const robotsStorage={
 async list(context){const {data,error}=await(await serverClient()).from('robot_party_robots').select(columns).eq('owner_id',context.ownerId).order('created_at',{ascending:false});if(error)throw error;return data;},
 async create(context,input){const {data,error}=await(await serverClient()).from('robot_party_robots').insert({id:input.id,owner_id:context.ownerId,created_by:context.user.id,name:input.name,role:input.role,token_hash:input.hash}).select(columns).single();if(error?.code==='23505')return null;if(error)throw error;return data;},
 async revoke(context,input){const {data,error}=await(await serverClient()).from('robot_party_robots').update({revoked_at:new Date().toISOString()}).eq('owner_id',context.ownerId).eq('id',input.id).eq('updated_at',input.expectedAt).is('revoked_at',null).select(columns).maybeSingle();if(error)throw error;return data;},
};
