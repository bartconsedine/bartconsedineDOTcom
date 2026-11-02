import { cookies } from 'next/headers';
import QRCode from 'qrcode';
import { createServerClient } from '@supabase/ssr';
import { cookieOptions, authConfig } from '@/lib/auth-config';
import { anonymousRpc } from '@/private-apps/robot-party/anonymous-rpc';
import { createQrDeviceApi, qrEnabled, QR_COOKIE } from '@/lib/admin-qr/api';
export const dynamic = 'force-dynamic';
export async function POST(request) {
 const jar=await cookies(), staged=new Map();
 const api=createQrDeviceApi({ enabled: qrEnabled, config: authConfig, client: async () => {const config=authConfig();return createServerClient(config.url,config.key,{cookieOptions,cookies:{getAll:()=>[...new Map([...jar.getAll().map(c=>[c.name,c]),...staged.entries()]).values()],setAll:values=>values.forEach(c=>staged.set(c.name,c))}});},
 commitSession: async () => {for(const {name,value,options} of staged.values())jar.set(name,value,{...options,maxAge:Math.min(options?.maxAge??2592000,2592000)});}, rpc: anonymousRpc,
 cookie: async () => (await cookies()).get(QR_COOKIE)?.value,
 setCookie: async (value,maxAge) => (await cookies()).set(QR_COOKIE,value,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/admin-qr',maxAge}),
 qr: url => QRCode.toDataURL(url,{width:360,margin:4,errorCorrectionLevel:'M'}),
});
 return api(request);
}
