import { validateRevision } from './app-data-contracts.js';

// The caller supplies the independently verified admin and user-scoped client.
export async function compareAndWrite(client, ownerId, slug, key, value, expectedAt) {
  validateRevision(expectedAt);
  const updatedAt = new Date(Math.max(Date.now(), expectedAt ? Date.parse(expectedAt) + 1 : 0)).toISOString();
  const row = { owner_id: ownerId, app_slug: slug, key, value, updated_at: updatedAt };
  const query = expectedAt === null
    ? client.from('app_data').insert(row)
    : client.from('app_data').update({ value, updated_at: updatedAt }).eq('owner_id', ownerId).eq('app_slug', slug).eq('key', key).eq('updated_at', expectedAt);
  const { data, error } = await query.select('updated_at').maybeSingle();
  if (error?.code === '23505' && expectedAt === null) return null;
  if (error) throw new Error('Unable to save app data');
  return data?.updated_at ?? null;
}
