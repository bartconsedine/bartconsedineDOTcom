import { getTldr } from '@/private-apps/morning-feed/tldr/server';
import { createTldrRefreshApi } from '@/private-apps/morning-feed/tldr/refresh-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = createTldrRefreshApi({ getTldr, secret: () => process.env.CRON_SECRET });
