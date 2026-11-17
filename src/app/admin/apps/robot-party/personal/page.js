import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import PersonalChat from '@/private-apps/robot-party/personal-chat';
import WorkspaceIcon from '@/components/workspace-icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your dot · Robot Party' };
export default async function PersonalPage() {
  const owner = await requireAdmin();
  return <><header className="ws-app-header" style={{ '--app-color': '#7dcfff' }}><div className="ws-app-breadcrumb"><Link href="/admin/apps/robot-party">Robot Party board</Link><span aria-hidden="true">/</span><span>Owner only</span></div><div className="ws-app-title"><span className="ws-app-title-icon"><WorkspaceIcon name="robot-party"/></span><h1>Your dot</h1></div></header><PersonalChat key={owner.id}/></>;
}
