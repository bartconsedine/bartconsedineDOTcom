import { checkAdmin } from '@/lib/auth';
import { authConfig } from '@/lib/auth-config';
import { serverClient } from '@/lib/supabase';
import { createTvConsentApi } from '@/private-apps/morning-feed/tv/api';
export const dynamic = 'force-dynamic';
export const POST = createTvConsentApi({ authorize: checkAdmin, origin: () => authConfig()?.siteUrl,
  rpc: async (name, args) => (await serverClient()).rpc(name, args),
});
