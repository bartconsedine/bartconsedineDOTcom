import 'server-only';
import {createClient} from '@supabase/supabase-js';
import { cognitoClient } from '@/lib/cognito-client';
import {authConfig} from '@/lib/auth-config';
export async function anonymousRpc(name,args){const config=authConfig();if(!config)throw Error('Unavailable');if(config.cognito)return cognitoClient(config,{get:()=>undefined}).rpc(name,args);return createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}).rpc(name,args);}
