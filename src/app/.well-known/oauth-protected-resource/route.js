import{authConfig}from'@/lib/auth-config';import{protectedMetadata}from'@/private-apps/robot-party/oauth-model';
export const dynamic='force-dynamic';
export async function GET(){const config=authConfig();return Response.json(config?protectedMetadata(config.siteUrl):{error:'unconfigured'},{status:config?200:503,headers:{'Cache-Control':'no-store'}});}
