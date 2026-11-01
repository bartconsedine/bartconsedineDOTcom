import{authConfig}from'@/lib/auth-config';
import{anonymousRpc}from'@/private-apps/robot-party/anonymous-rpc';
import{createMcpApi}from'@/private-apps/robot-party/mcp-api';
import{personalConfig}from'@/private-apps/robot-party/personal/storage';
import{createPersonalMcp}from'@/private-apps/robot-party/personal/mcp';
export const dynamic='force-dynamic';
const handle=async request=>{try{let config=null;try{config=personalConfig();}catch{/* Keep existing board access available when private setup is incomplete. */}return createMcpApi({rpc:anonymousRpc,origin:()=>authConfig()?.siteUrl,personal:config?createPersonalMcp({rpc:anonymousRpc,key:config.key}):null})(request);}catch{return Response.json({error:'Private channel configuration unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}};
export const POST=handle;export const GET=handle;
