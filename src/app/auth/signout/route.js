import { qrEnabled, qrCall } from '@/lib/admin-qr/api';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth-config';
import { serverClient } from '@/lib/supabase';

export async function POST(request) {
  const config = authConfig();
  if (!config || request.headers.get('origin') !== config.siteUrl) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const client = await serverClient();
  if(qrEnabled())try{await qrCall(client.rpc.bind(client),'signout',null);}catch{return NextResponse.json({error:'Device sign-out unavailable. Please retry.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) return NextResponse.json({ error: 'Sign-out failed. Please retry.' }, { status: 503 });
  const response = NextResponse.redirect(new URL('/login?state=signedout', config.siteUrl), 303);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
