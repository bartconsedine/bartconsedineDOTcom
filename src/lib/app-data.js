import 'server-only';
import { getApp } from './apps';
import { serverClient } from './supabase';

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
  if (expectedAt === null) {
    const { data, error } = await client.from('app_data').insert({ owner_id: ownerId, app_slug: slug, key, value }).select('updated_at').single();
    if (error?.code === '23505') return null;
    if (error) throw new Error('Unable to save app data');
    return data.updated_at;
  }
  const updated_at = new Date(Math.max(Date.now(), Date.parse(expectedAt) + 1)).toISOString();
  const { data, error } = await client.from('app_data').update({ value, updated_at }).eq('owner_id', ownerId).eq('app_slug', slug).eq('key', key).eq('updated_at', expectedAt).select('updated_at').maybeSingle();
  if (error) throw new Error('Unable to save app data');
  return data?.updated_at ?? null;
}
