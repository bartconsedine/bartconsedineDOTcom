import { getTldr } from '@/private-apps/morning-feed/tldr/server';
import { cookies } from 'next/headers';
import QRCode from 'qrcode';
import { authConfig } from '@/lib/auth-config';
import { anonymousRpc } from '@/private-apps/robot-party/anonymous-rpc';
import { createTvApi, TV_COOKIE } from '@/private-apps/morning-feed/tv/api';
export const dynamic = 'force-dynamic';
const api = createTvApi({
  getTldr, rpc: anonymousRpc, origin: () => authConfig()?.siteUrl,
  cookie: async () => (await cookies()).get(TV_COOKIE)?.value,
  setCookie: async (value, maxAge) => (await cookies()).set(TV_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/tv', maxAge }),
  qr: url => QRCode.toDataURL(url, { width: 360, margin: 4, errorCorrectionLevel: 'M' }),
});
export const GET = api.GET;
export const POST = api.POST;
