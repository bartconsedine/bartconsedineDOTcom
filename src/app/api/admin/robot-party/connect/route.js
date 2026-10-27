import{authConfig}from'@/lib/auth-config';
import{checkAppAccess}from'@/lib/auth';
import{serverClient}from'@/lib/supabase';
import{createConsentApi}from'@/private-apps/robot-party/oauth-api';
export const dynamic='force-dynamic';
export const POST=createConsentApi({origin:()=>authConfig()?.siteUrl,authorize:owner=>checkAppAccess('robot-party',owner),rpc:async(name,args)=>(await serverClient()).rpc(name,args)});
