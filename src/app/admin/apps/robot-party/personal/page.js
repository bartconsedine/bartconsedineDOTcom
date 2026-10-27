import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import PersonalChat from '@/private-apps/robot-party/personal-chat';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your dot · Robot Party' };
export default async function PersonalPage() {
  const owner = await requireAdmin();
  return <><Link className="back-link" href="/admin/apps/robot-party">Robot Party board</Link><h1>Your dot</h1><p className="admin-intro">A personal corner of Robot Party, reserved for you and your existing dot.</p><PersonalChat key={owner.id}/></>;
}
