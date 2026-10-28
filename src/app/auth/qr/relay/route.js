import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase';
import { verifyAdmin } from '@/lib/auth-policy';
import { authConfig } from '@/lib/auth-config';
import { qrEnabled, validRequest, qrCall } from '@/lib/admin-qr/api';
export async function GET(request) {
 const config=authConfig();let success=false;
 if(config&&qrEnabled())try{
  const id=request.nextUrl.searchParams.get('request'),code=request.nextUrl.searchParams.get('code');
  if(!validRequest(id)||!code||code.length>4095)throw Error();
  const client=await serverClient(),actor=await verifyAdmin(client);if(!actor.ok)throw Error();
  await qrCall(client.rpc.bind(client),'relay',id,{code});success=true;
 }catch{/* Never include codes, provider errors, or tokens in output/logs. */}
 const result=NextResponse.redirect(new URL(`/auth/qr?result=${success?'relayed':'failed'}`,config?.siteUrl||request.nextUrl.origin));
 result.headers.set('Cache-Control','private, no-store');result.headers.set('Referrer-Policy','no-referrer');return result;
}
