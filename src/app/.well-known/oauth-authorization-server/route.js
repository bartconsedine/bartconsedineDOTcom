import{authConfig}from'@/lib/auth-config';import{oauthMetadata}from'@/private-apps/robot-party/oauth-model';
export const dynamic='force-dynamic';
export async function GET(){const config=authConfig();return Response.json(config?oauthMetadata(config.siteUrl):{error:'unconfigured'},{status:config?200:503,headers:{'Cache-Control':'no-store'}});}
