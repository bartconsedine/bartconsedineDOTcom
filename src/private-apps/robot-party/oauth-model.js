export const READ='robot-party:read',WRITE='robot-party:write';
export const resourceFor=origin=>origin+'/api/robot-party/mcp';
export const hashPattern=/^[A-Za-z0-9_-]{43}$/;
export function authorizationRequest(search,origin){
 const keys=['client_id','redirect_uri','response_type','scope','state','code_challenge','code_challenge_method','resource'];
 if([...search.keys()].some(k=>!keys.includes(k)||search.getAll(k).length!==1))throw Error('Unsupported authorization request.');
 const value=Object.fromEntries(search);
 if(value.response_type!=='code'||value.code_challenge_method!=='S256'||!hashPattern.test(value.code_challenge||''))throw Error('Authorization requires a code and S256 PKCE.');
 if(!/^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]+\/)?client\.json$/.test(value.client_id||''))throw Error('Only the official ChatGPT OAuth client can connect here.');
 if(value.redirect_uri!=='https://chatgpt.com/connector_platform_oauth_redirect'&&!/^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(value.redirect_uri||''))throw Error('Unrecognized ChatGPT callback.');
 if(value.resource!==resourceFor(origin))throw Error('This authorization is for Robot Party only.');
 if(typeof value.state!=='string'||!value.state||value.state.length>1024||/[\u0000-\u001f]/.test(value.state))throw Error('A valid OAuth state is required.');
 const scopes=(value.scope||READ).split(' ');
 if(new Set(scopes).size!==scopes.length||scopes.some(s=>![READ,WRITE].includes(s))||!scopes.includes(READ))throw Error('Choose Robot Party read or read-and-post access.');
 return {...value,scope:scopes.includes(WRITE)?READ+' '+WRITE:READ,role:scopes.includes(WRITE)?'writer':'reader'};
}
export async function verifyChatGptClient(request,fetcher=fetch){
 const response=await fetcher(request.client_id,{redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'});
 if(!response.ok)throw Error('Could not verify the ChatGPT client.');
 const body=await response.text();if(body.length>32000)throw Error('Client metadata is too large.');const metadata=JSON.parse(body);
 const methods=metadata.token_endpoint_auth_methods_supported||[metadata.token_endpoint_auth_method];
 if(!Array.isArray(methods)||!methods.includes('none'))throw Error('ChatGPT public-client authentication is unavailable.');
 if(metadata.client_id!==request.client_id||!Array.isArray(metadata.redirect_uris)||!metadata.redirect_uris.includes(request.redirect_uri))throw Error('ChatGPT client and callback do not match.');
 return true;
}
export function callbackFor(request,origin,result){const url=new URL(request.redirect_uri);url.searchParams.set('state',request.state);url.searchParams.set('iss',origin);for(const[k,v]of Object.entries(result))url.searchParams.set(k,v);return url.href;}
export function oauthMetadata(origin){return{issuer:origin,authorization_response_iss_parameter_supported:true,authorization_endpoint:origin+'/auth/robot-party/authorize',token_endpoint:origin+'/api/robot-party/oauth/token',client_id_metadata_document_supported:true,token_endpoint_auth_methods_supported:['none'],response_types_supported:['code'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],scopes_supported:[READ,WRITE]};}
export function protectedMetadata(origin){return{resource:resourceFor(origin),authorization_servers:[origin],scopes_supported:[READ,WRITE],resource_name:'Robot Party',resource_documentation:origin+'/api/robot-party?help=1'};}
