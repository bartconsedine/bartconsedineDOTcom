import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{authorizationRequest,verifyChatGptClient,callbackFor,oauthMetadata,protectedMetadata,READ,WRITE}from'../src/private-apps/robot-party/oauth-model.js';
import{createConsentApi,createTokenApi}from'../src/private-apps/robot-party/oauth-api.js';import{loginReturn}from'../src/lib/login-return.js';
const origin='https://bartconsedine.com',owner='11111111-1111-4111-8111-111111111111',verifier='V'.repeat(43),challenge=createHash('sha256').update(verifier).digest('base64url');
const query=()=>new URLSearchParams({client_id:'https://chatgpt.com/oauth/client.json',redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',response_type:'code',state:'opaque-state',scope:READ+' '+WRITE,code_challenge:challenge,code_challenge_method:'S256',resource:origin+'/api/robot-party/mcp'});
test('OAuth discovery and validation bind exact client, callback, resource, PKCE, scope and state; login continuation cannot become an open redirect',async()=>{
 const valid=authorizationRequest(query(),origin);assert.equal(valid.role,'writer');assert.equal(oauthMetadata(origin).client_id_metadata_document_supported,true);assert.deepEqual(oauthMetadata(origin).token_endpoint_auth_methods_supported,['none']);assert.equal(protectedMetadata(origin).resource,origin+'/api/robot-party/mcp');
 for(const[k,v]of[['client_id','https://evil.example/client.json'],['redirect_uri','https://chatgpt.com.evil.example/callback'],['resource','https://example.com/other-app'],['code_challenge_method','plain'],['code_challenge','bad'],['scope','admin'],['state','']]){const bad=query();bad.set(k,v);assert.throws(()=>authorizationRequest(bad,origin));}
 const dup=query();dup.append('state','second');assert.throws(()=>authorizationRequest(dup,origin));
 await verifyChatGptClient(valid,async(url,options)=>{assert.equal(url,valid.client_id);assert.equal(options.redirect,'error');return Response.json({client_id:url,redirect_uris:[valid.redirect_uri],token_endpoint_auth_methods_supported:['none','private_key_jwt']});});await assert.rejects(verifyChatGptClient(valid,async()=>Response.json({client_id:valid.client_id,redirect_uris:['https://evil.example'],token_endpoint_auth_methods_supported:['none']})),/do not match/);
 const callback=new URL(callbackFor(valid,origin,{code:'secret-code'}));assert.equal(callback.searchParams.get('state'),valid.state);assert.equal(callback.searchParams.get('iss'),origin);
 const next='/auth/robot-party/authorize?'+query();assert.equal(loginReturn(next),next);for(const bad of['//evil.example','https://evil.example','/api/admin/access','/auth/robot-party/authorize#fragment','/\\evil.example'])assert.equal(loginReturn(bad),'/admin');
});
test('consent requires exact origin, app authorization and permission, stores hashes only and verifies client again before granting',async()=>{
 let writes=0,args;const actor={ok:true,user:{id:owner},ownerId:owner,role:'owner'};const api=createConsentApi({origin:()=>origin,authorize:async()=>actor,verify:async()=>true,rpc:async(name,input)=>{writes++;args=input;return{data:null};}});
 const request=(headers={},overrides={})=>new Request(origin+'/api/admin/robot-party/connect',{method:'POST',headers:{'content-type':'application/json',origin,...headers},body:JSON.stringify({owner,name:'My dot',authorization:query().toString(),...overrides})});
 assert.equal((await api(request({origin:'https://evil.example'}))).status,403);actor.role='viewer';assert.equal((await api(request())).status,403);assert.equal(writes,0);actor.role='editor';const response=await api(request());assert.equal(response.status,200);const result=await response.json();const code=new URL(result.redirect).searchParams.get('code');assert.match(code,/^[A-Za-z0-9_-]{43}$/);assert.equal(args.p_code_hash,createHash('sha256').update(code).digest('hex'));assert.equal(args.p_code,undefined);assert.equal(args.p_token,undefined);assert.equal(args.p_owner,owner);assert.equal(args.p_role,'writer');
 const denied=createConsentApi({origin:()=>origin,authorize:async()=>({ok:false,status:404,reason:'not_found'}),rpc:async()=>{throw Error('must not call');}});assert.equal((await denied(request())).status,404);
});
test('public token exchange accepts only code + S256 verifier for the exact resource and returns a separate bearer token without cookies',async()=>{
 let args,calls=0;const api=createTokenApi({origin:()=>origin,rpc:async(name,input)=>{args=input;calls++;return{data:{role:'writer',expires_at:new Date(Date.now()+86400000).toISOString()}};}});
 const fields={grant_type:'authorization_code',code:'C'.repeat(43),client_id:'https://chatgpt.com/oauth/client.json',redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',resource:origin+'/api/robot-party/mcp',code_verifier:verifier};
 const request=(override={})=>new Request(origin+'/api/robot-party/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,...override})});
 assert.equal((await api(request({resource:'https://example.com'}))).status,400);assert.equal(calls,0);const response=await api(request());const token=await response.json();assert.match(token.access_token,/^rp_[A-Za-z0-9_-]{43}$/);assert.equal(token.token_type,'Bearer');assert.equal(token.scope,READ+' '+WRITE);assert.equal(args.p_challenge,challenge);assert.equal(args.p_token_hash,createHash('sha256').update(token.access_token).digest('hex'));assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal((await createTokenApi({origin:()=>origin,rpc:async()=>({error:{message:'invalid_grant'}})})(request())).status,400);
});

test('actual ChatGPT ui_locales hint reaches consent without changing authorization or relaxing duplicate and unknown parameter guards',async()=>{
 const original=authorizationRequest(query(),origin);
 for(const locale of ['en-US','fr-CA fr en','zh-Hant-TW','x-private']){const localized=query();localized.set('ui_locales',locale);assert.deepEqual(authorizationRequest(localized,origin),original);}
 for(const locale of ['', 'en\nUS', '<script>', 'en_US', 'en  US', 'a'.repeat(257)]){const bad=query();bad.set('ui_locales',locale);assert.throws(()=>authorizationRequest(bad,origin));}
 const duplicate=query();duplicate.append('ui_locales','en');duplicate.append('ui_locales','fr');assert.throws(()=>authorizationRequest(duplicate,origin));
 const unknown=query();unknown.set('unsupported','hint');assert.throws(()=>authorizationRequest(unknown,origin));
 let checked=false,written=false;const localized=query();localized.set('ui_locales','en-US');
 const api=createConsentApi({origin:()=>origin,authorize:async()=>({ok:true,user:{id:owner},ownerId:owner,role:'owner'}),verify:async request=>{assert.deepEqual(request,original);checked=true;},rpc:async(_name,input)=>{assert.equal(input.p_role,'writer');assert.equal(input.p_resource,origin+'/api/robot-party/mcp');written=true;return{data:null};}});
 const response=await api(new Request(origin+'/api/admin/robot-party/connect',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({owner,name:'My dot',authorization:localized.toString()})}));
 assert.equal(response.status,200);assert.equal(checked,true);assert.equal(written,true);
});
