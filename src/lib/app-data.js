import 'server-only';
import { requireAdmin } from './auth';
import { getApp } from './apps';
import { serverClient } from './supabase';

async function context(slug, key) {
  const owner = await requireAdmin();
  if (!await getApp(slug)) throw new Error('App not installed');
  if (typeof key !== 'string' || key.length < 1 || key.length > 200) throw new Error('Invalid key');
  return { owner, client: await serverClient() };
}

export async function readAppData(slug, key) {
  const { owner, client } = await context(slug, key);
  const { data, error } = await client.from('app_data').select('value, updated_at').eq('owner_id', owner.id).eq('app_slug', slug).eq('key', key).maybeSingle();
  if (error) throw new Error('Unable to load app data');
  return data;
}

export async function writeAppData(slug, key, value) {
  const { owner, client } = await context(slug, key);
  // Uses the owner's session and publishable key: RLS remains in force.
  const { error } = await client.from('app_data').upsert({ owner_id: owner.id, app_slug: slug, key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error('Unable to save app data');
}
