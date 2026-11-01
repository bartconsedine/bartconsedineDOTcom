import { cookies } from 'next/headers';
import { authConfig } from '@/lib/auth-config';
import { anonymousRpc } from '@/private-apps/robot-party/anonymous-rpc';
import { TV_COOKIE } from '@/private-apps/morning-feed/tv/api';
import { createNewsProgressApi } from '@/private-apps/morning-feed/tldr/progress-api';
export const dynamic = 'force-dynamic';
const api = createNewsProgressApi({ rpc: anonymousRpc, cookie: async () => (await cookies()).get(TV_COOKIE)?.value, origin: () => authConfig()?.siteUrl });
export const GET = api.GET;
export const POST = api.POST;
