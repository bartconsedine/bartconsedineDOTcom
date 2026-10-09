import { checkOwner } from '@/lib/auth';
import { authConfig } from '@/lib/auth-config';
import { getApp } from '@/lib/apps';
import { createAppApi } from '@/lib/app-api-policy';

export const dynamic = 'force-dynamic';
const handle = createAppApi({ checkOwner, getApp, siteOrigin: () => authConfig()?.siteUrl });
export const GET = handle;
export const POST = handle;
