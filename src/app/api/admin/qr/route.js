import { serverClient } from '@/lib/supabase';
import { verifyAdmin } from '@/lib/auth-policy';
import { authConfig } from '@/lib/auth-config';
import { qrEnabled, response, sameOrigin, readInput, validRequest, providerUrl, qrCall } from '@/lib/admin-qr/api';
export async function POST(request) {
 const config=authConfig();
 if(!config)return response({error:'Admin QR sign-in is not configured.'},503);
 if(!sameOrigin(request,config.siteUrl))return response({error:'Invalid origin.'},403);
 const client=await serverClient(),actor=await verifyAdmin(client);
 if(!actor.ok)return response({error:actor.reason},actor.status);
 let input;
 try { input=await readInput(request); if(Object.keys(input).sort().join(',')!=='action,id'||!['approve','decline','revoke'].includes(input.action)||(input.action!=='revoke'?!validRequest(input.id):!/^[a-f0-9]{64}$/.test(input.id)))throw Error(); }
 catch{return response({error:'Invalid approval.'},400);}
 try{
 if(!qrEnabled()&&input.action!=='revoke')return response({error:'Admin QR sign-in is not active.'},503);
 const data=await qrCall(client.rpc.bind(client),input.action,input.id);
 if(input.action==='approve'){
  const url=providerUrl(data.url,config,input.id);if(!url)throw Error();
  return response({url});
 }
 return response(data);
 }catch{return response({error:'This request expired, was already approved, or could not be updated. Generate a new request on the target device.'},410);}
}
