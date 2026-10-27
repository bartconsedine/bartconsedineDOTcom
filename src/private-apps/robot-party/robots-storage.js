import 'server-only';
import {serverClient} from '../../lib/supabase';
const columns='id,name,role,expires_at,revoked_at,created_at,updated_at';
export const robotsStorage={
 async list(owner){const {data,error}=await(await serverClient()).from('robot_party_robots').select(columns).eq('owner_id',owner).order('created_at',{ascending:false});if(error)throw error;return data;},
 async create(owner,input){const {data,error}=await(await serverClient()).from('robot_party_robots').insert({id:input.id,owner_id:owner,created_by:owner,name:input.name,role:input.role,token_hash:input.hash}).select(columns).single();if(error?.code==='23505')return null;if(error)throw error;return data;},
 async revoke(owner,input){const {data,error}=await(await serverClient()).from('robot_party_robots').update({revoked_at:new Date().toISOString()}).eq('owner_id',owner).eq('id',input.id).eq('updated_at',input.expectedAt).is('revoked_at',null).select(columns).maybeSingle();if(error)throw error;return data;},
};
