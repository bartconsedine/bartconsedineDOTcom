import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {authConfig} from '@/lib/auth-config';
export async function anonymousRpc(name,args){const config=authConfig();if(!config)throw Error('Unavailable');return createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}).rpc(name,args);}
