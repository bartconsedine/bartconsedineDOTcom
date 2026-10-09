'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authConfig } from '@/lib/auth-config';
import { serverClient } from '@/lib/supabase';

export async function signInWithGoogle() {
  const config = authConfig();
  if (!config) redirect('/login?state=unconfigured');
  if ((await headers()).get('origin') !== config.siteUrl) redirect('/login?state=unavailable');
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
