import {createClient} from '@supabase/supabase-js';
import {authConfig} from '@/lib/auth-config';
import {createRobotApi} from '@/private-apps/robot-party/robot-api';
export const dynamic='force-dynamic';
const handle=createRobotApi(async(name,args)=>{
 const config=authConfig();if(!config)throw Error('Unavailable');
 return createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}).rpc(name,args);
});
export const GET=handle;
export const POST=handle;
