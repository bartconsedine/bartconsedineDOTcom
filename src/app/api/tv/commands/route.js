import { checkAdmin } from '@/lib/auth';
import { authConfig } from '@/lib/auth-config';
import { createTvCommandApi } from '@/private-apps/robot-party/personal/tv-api';
import { personalConfig, personalStorage } from '@/private-apps/robot-party/personal/storage';

export const dynamic = 'force-dynamic';
const handle = createTvCommandApi({ authorize: checkAdmin, siteOrigin: () => authConfig()?.siteUrl, configuration: personalConfig, storage: personalStorage });
export const GET = handle;
export const POST = handle;
