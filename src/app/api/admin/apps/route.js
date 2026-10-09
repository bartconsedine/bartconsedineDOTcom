import { NextResponse } from 'next/server';
import { checkOwner } from '@/lib/auth';
import { listApps } from '@/lib/apps';

export const dynamic = 'force-dynamic';
export async function GET() {
  const access = await checkOwner();
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.status, headers });
  return NextResponse.json({ apps: await listApps() }, { headers });
}
