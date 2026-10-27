import{authConfig}from'@/lib/auth-config';
import{anonymousRpc}from'@/private-apps/robot-party/anonymous-rpc';
import{createMcpApi}from'@/private-apps/robot-party/mcp-api';
export const dynamic='force-dynamic';
const handle=createMcpApi({rpc:anonymousRpc,origin:()=>authConfig()?.siteUrl});
export const POST=handle;export const GET=handle;
