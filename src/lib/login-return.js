// The only supported login continuation is our own validated OAuth consent page.
// Never redirect to external URLs, protocol-relative paths or arbitrary admin APIs.
export function loginReturn(value){if(typeof value!=='string'||value.length>4096||/[\u0000-\u001f\\]/.test(value))return '/admin';try{const url=new URL(value,'https://local.invalid');if(url.origin!=='https://local.invalid'||url.pathname!=='/auth/robot-party/authorize'||url.hash)return '/admin';return url.pathname+url.search;}catch{return '/admin';}}

export const LOGIN_RETURN_COOKIE='robot-party-login-return';
