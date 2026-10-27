import {isId} from './model.js';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {authorizationRequest,verifyChatGptClient,callbackFor,READ,WRITE,resourceFor} from './oauth-model.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function boundedText(request,limit=12000){const reader=request.body?.getReader();if(!reader)throw Error('Body required');let size=0;const chunks=[];try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('Request too large');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer'}});
export function createConsentApi({origin,authorize,rpc,verify=verifyChatGptClient}){return async request=>{
 try{
  const site=origin();if(!site||request.headers.get('origin')!==site||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Invalid origin.'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'Send JSON.'},415);
  let input,authorization;try{input=JSON.parse(await boundedText(request));if(!input||Object.keys(input).sort().join(',')!=='authorization,name,owner')throw Error('Invalid consent.');if(!isId(input.owner))throw Error('Choose a board.');if(typeof input.authorization!=='string'||input.authorization.length>4096||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>60)throw Error('Invalid connection.');authorization=authorizationRequest(new URLSearchParams(input.authorization),site);}catch{return reply({error:'Invalid consent request.'},400);}
  const actor=await authorize(input.owner);if(!actor.ok)return reply({error:actor.reason},actor.status);if(authorization.role==='writer'&&actor.role==='viewer')return reply({error:'This board invitation is read only.'},403);
  await verify(authorization);
  const code=randomBytes(32).toString('base64url');const unusedKey=randomBytes(32).toString('base64url');
  const{error}=await rpc('robot_party_authorize_connection',{p_code_hash:hash(code),p_robot_id:randomUUID(),p_owner:actor.ownerId,p_name:input.name.trim(),p_role:authorization.role,p_initial_hash:hash(unusedKey),p_client_id:authorization.client_id,p_redirect_uri:authorization.redirect_uri,p_resource:authorization.resource,p_challenge:authorization.code_challenge});if(error)throw error;
  return reply({redirect:callbackFor(authorization,site,{code})});
 }catch{return reply({error:'Could not authorize this connection. Retry; the reviewed OAuth migration may still be pending.'},503);}
};}
export function createTokenApi({origin,rpc}){return async request=>{
 if(request.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')return reply({error:'invalid_request'},415);
 let form;try{form=new URLSearchParams(await boundedText(request,12000));const allowed=['grant_type','code','client_id','redirect_uri','resource','code_verifier'];if([...form.keys()].some(k=>!allowed.includes(k)||form.getAll(k).length!==1)||form.size!==allowed.length||form.get('grant_type')!=='authorization_code'||!/^[-A-Za-z0-9._~]{43,128}$/.test(form.get('code_verifier')||'')||!/^[-A-Za-z0-9_]{43}$/.test(form.get('code')||'')||form.get('resource')!==resourceFor(origin()))throw Error();}catch{return reply({error:'invalid_request'},400);}
 const token='rp_'+randomBytes(32).toString('base64url');
 try{const{data,error}=await rpc('robot_party_exchange_code',{p_code_hash:hash(form.get('code')),p_client_id:form.get('client_id'),p_redirect_uri:form.get('redirect_uri'),p_resource:form.get('resource'),p_challenge:createHash('sha256').update(form.get('code_verifier')).digest('base64url'),p_token_hash:hash(token)});if(error)throw error;if(!data?.expires_at||!['reader','writer'].includes(data.role))throw Error();return reply({access_token:token,token_type:'Bearer',expires_in:Math.max(0,Math.floor((Date.parse(data.expires_at)-Date.now())/1000)),scope:READ+(data.role==='writer'?' '+WRITE:'')});}catch(error){return reply({error:error.message==='invalid_grant'?'invalid_grant':'temporarily_unavailable'},error.message==='invalid_grant'?400:503);}
};}
