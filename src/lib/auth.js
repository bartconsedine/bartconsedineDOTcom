import 'server-only';
import { redirect } from 'next/navigation';
import { authConfig } from './auth-config';
import { serverClient } from './supabase';
import { verifyOwner } from './auth-policy';

export async function checkOwner() {
  const client = await serverClient();
  return verifyOwner(client?.auth, authConfig()?.ownerId, authConfig()?.ownerEmail);
}

export async function requireOwner() {
  const result = await checkOwner();
  if (!result.ok) redirect(`/login?state=${result.reason}`);
  return result.user;
}
