import TvScreen from '@/private-apps/morning-feed/tv/tv-screen';
export const metadata = { title: 'Connect your TV', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function TV() { return <TvScreen/>; }
