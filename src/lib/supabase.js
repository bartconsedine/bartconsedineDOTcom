import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authConfig, cookieOptions } from './auth-config';

export async function serverClient() {
  const config = authConfig();
  if (!config) return null;
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions,
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        // Server components are read-only; proxy handles session-cookie refresh.
        try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch {}
      },
    },
  });
}
