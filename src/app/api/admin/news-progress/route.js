import { authConfig } from '@/lib/auth-config';
import { checkAdmin } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { createNewsProgressApi } from '@/private-apps/morning-feed/tldr/progress-api';
export const dynamic = 'force-dynamic';
const api = createNewsProgressApi({ authorize: checkAdmin, rpc: async (name, args) => (await serverClient()).rpc(name, args), origin: () => authConfig()?.siteUrl });
export const GET = api.GET;
export const POST = api.POST;
