import 'server-only';
import { serverClient } from './supabase';
export const accessStorage = {
  async list(ownerId) {
    const client = await serverClient();
    const { data, error } = await client.from('app_access_grants').select('app_slug, invited_email, role, updated_at').eq('owner_id', ownerId).order('invited_email').limit(501);
    if (error) throw error;
    if (data.length > 500) throw new Error('Too many grants for this view.');
    return data;
  },
  async change(ownerId, change) {
    const client = await serverClient();
    const { slug, email, role, action, expectedAt } = change;
    let query;
    if (action === 'invite') query = client.from('app_access_grants').insert({ owner_id: ownerId, app_slug: slug, invited_email: email, role });
    else {
      query = action === 'revoke' ? client.from('app_access_grants').delete() : client.from('app_access_grants').update({ role });
      query = query.eq('owner_id', ownerId).eq('app_slug', slug).eq('invited_email', email).eq('updated_at', expectedAt);
    }
    const { data, error } = await query.select('updated_at');
    if (error?.code === '23505') return false;
    if (error) throw error;
    return data.length === 1;
  },
};
