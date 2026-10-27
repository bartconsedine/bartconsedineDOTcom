import 'server-only';
import { getApp } from './apps';
import { serverClient } from './supabase';
import { compareAndWrite } from './app-data-write';

async function context(slug, key, ownerId, writing = false) {
  const app = await getApp(slug, ownerId);
  if (!app || writing && app.access.role === 'viewer') throw new Error('App access denied');
  if (typeof key !== 'string' || key.length < 1 || key.length > 200) throw new Error('Invalid key');
  return { ownerId: app.access.ownerId, client: await serverClient() };
}
export async function readAppData(slug, key, targetOwner) {
  const { ownerId, client } = await context(slug, key, targetOwner);
  const { data, error } = await client.from('app_data').select('value, updated_at').eq('owner_id', ownerId).eq('app_slug', slug).eq('key', key).maybeSingle();
  if (error) throw new Error('Unable to load app data');
  return data;
}
export async function compareAndWriteAppData(slug, key, value, expectedAt, targetOwner) {
  const { ownerId, client } = await context(slug, key, targetOwner, true);
  return compareAndWrite(client, ownerId, slug, key, value, expectedAt);
}
