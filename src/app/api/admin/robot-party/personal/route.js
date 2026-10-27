import { checkAdmin } from '@/lib/auth';
import { authConfig } from '@/lib/auth-config';
import { createPersonalApi } from '@/private-apps/robot-party/personal-api';

export const dynamic = 'force-dynamic';
const handle = createPersonalApi({ authorize: checkAdmin, siteOrigin: () => authConfig()?.siteUrl });
export const GET = handle;
export const POST = handle;
