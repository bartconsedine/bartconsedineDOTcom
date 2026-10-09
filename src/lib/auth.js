import 'server-only';
import { redirect } from 'next/navigation';
import { serverClient } from './supabase';
import { verifyAdmin } from './auth-policy';

export async function checkAdmin() {
  const client = await serverClient();
  return verifyAdmin(client);
}

export async function requireAdmin() {
  const result = await checkAdmin();
  if (!result.ok) redirect(`/login?state=${result.reason}`);
  return result.user;
}
