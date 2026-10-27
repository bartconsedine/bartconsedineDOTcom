import { randomBytes, createHash } from 'node:crypto';
import { isId } from './model.js';
import { validateRevision } from '../../lib/record-revision.js';
export function createRobotsApi({checkAdmin, storage, siteOrigin}) {
 return async request=>{
  const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
  try {
   const actor=await checkAdmin();if(!actor.ok)return reply({error:actor.reason},actor.status);
   if(request.method==='GET')return reply({robots:await storage.list(actor.user.id)});
   if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
   if(!siteOrigin()||request.headers.get('origin')!==siteOrigin()||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'invalid_origin'},403);
   if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'Send JSON.'},415);
   let body;try{
    const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];
    try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return reply({error:'Request too large.'},413);}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}body=JSON.parse(new TextDecoder().decode(bytes));
    const keys=body.action==='create'?['action','id','name','role']:body.action==='revoke'?['action','id','expectedAt']:[];
    if(!keys.length||Object.keys(body).length!==keys.length||Object.keys(body).some(k=>!keys.includes(k))||!isId(body.id))throw Error();
    if(body.action==='create'&&(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>60||/\0/.test(body.name)||!['reader','writer'].includes(body.role)))throw Error();
    if(body.action==='revoke'&&validateRevision(body.expectedAt)===null)throw Error();
   }catch{return reply({error:'Invalid robot access change.'},400);}
   if(body.action==='revoke'){if(!await storage.revoke(actor.user.id,body))return reply({error:'Robot access changed. Reload before retrying.'},409);return reply({saved:true});}
   const token='rp_'+randomBytes(32).toString('base64url');
   const robot=await storage.create(actor.user.id,{...body,name:body.name.trim(),hash:createHash('sha256').update(token).digest('hex')});
   if(!robot)return reply({error:'This robot already exists. Reload and revoke it before creating another key.'},409);
   return reply({saved:true,robot,token});
  }catch{return reply({error:'Robot connections need the reviewed Robot Party database migration, or the database is unavailable. Reload before retrying.'},503);}
 };
}
