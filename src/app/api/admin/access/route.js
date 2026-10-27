import { checkAdmin } from '@/lib/auth';
import { authConfig } from '@/lib/auth-config';
import { listApps } from '@/lib/apps';
import { accessStorage } from '@/lib/access-storage';
import { createAccessApi } from '@/lib/access-api';
export const dynamic = 'force-dynamic';
const handle = createAccessApi({ checkAdmin, listApps, storage: accessStorage, siteOrigin: () => authConfig()?.siteUrl });
export const GET = handle;
export const POST = handle;
