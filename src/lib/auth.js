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

export async function checkWorkspace() {
  const { verifyWorkspace } = await import('./workspace-policy');
  return verifyWorkspace(await serverClient());
}
export async function requireWorkspace() {
  const result = await checkWorkspace();
  if (!result.ok) redirect(`/login?state=${result.reason}`);
  return result;
}
export async function checkAppAccess(slug, ownerId) {
  const { appAccess } = await import('./workspace-policy');
  return appAccess(await checkWorkspace(), slug, ownerId);
}
