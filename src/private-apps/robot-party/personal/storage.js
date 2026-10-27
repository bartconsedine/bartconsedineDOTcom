import 'server-only';
import { serverClient } from '@/lib/supabase';
import { encryptionKey } from './transport.js';
export function personalConfig() {
  if (process.env.ROBOT_PARTY_PERSONAL_ENABLED !== '1') return null;
  // A missing/invalid key fails closed; never generate or persist one at runtime.
  return { key: encryptionKey(process.env.ROBOT_PARTY_PERSONAL_KEY) };
}
export const personalStorage = {
  async owner(action, input) {
    const client = await serverClient();
    const { data, error } = await client.rpc('robot_party_personal_owner', { p_action: action, p_input: input });
    if (error) throw error;
    return data;
  },
};
