'use server';

import { loginReturn, LOGIN_RETURN_COOKIE } from '@/lib/login-return';
import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authConfig, cookieOptions } from '@/lib/auth-config';
import { serverClient } from '@/lib/supabase';

export async function signInWithGoogle(formData) {
  const config = authConfig();
  if (!config) redirect('/login?state=unconfigured');
  if ((await headers()).get('origin') !== config.siteUrl) redirect('/login?state=unavailable');
  const next=loginReturn(formData?.get('next'));
  const jar=await cookies();
  if(next==='/admin')jar.delete(LOGIN_RETURN_COOKIE);else jar.set(LOGIN_RETURN_COOKIE,next,{...cookieOptions,maxAge:600});
  let destination;
  try {
    const supabase = await serverClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${config.siteUrl}/auth/callback`, queryParams: { prompt: 'select_account' } },
    });
    if (!error && data.url) destination = data.url;
  } catch { /* Return a generic error; never log credentials or OAuth codes. */ }
  if (!destination) redirect('/login?state=unavailable');
  redirect(destination);
}
