import{authConfig}from'@/lib/auth-config';
import{anonymousRpc}from'@/private-apps/robot-party/anonymous-rpc';
import{createTokenApi}from'@/private-apps/robot-party/oauth-api';
export const dynamic='force-dynamic';
export const POST=createTokenApi({rpc:anonymousRpc,origin:()=>authConfig()?.siteUrl});
