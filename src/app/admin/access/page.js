import { requireAdmin } from '@/lib/auth';
import AccessManager from './access-manager';
export const metadata = { title: 'People & app access' };
export default async function AccessPage({ searchParams }) {
  await requireAdmin();
  return <><p className="eyebrow">YOUR WORKSPACE</p><h1>People & access.</h1><p className="admin-intro">Invite people to a specific app. Choose whether they can view or edit your shared data.</p><AccessManager initialApp={(await searchParams).app || ''}/></>;
}
