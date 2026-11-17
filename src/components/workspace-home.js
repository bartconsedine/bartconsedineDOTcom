'use client';

import Link from 'next/link';
import { useState } from 'react';
import WorkspaceIcon from './workspace-icon';
import { appPresentation, matchesWorkspaceApp, roleLabel } from '@/lib/workspace-presentation';

export default function WorkspaceHome({ apps, isAdmin }) {
  const [query, setQuery] = useState('');
  const filtered = apps.filter(app => matchesWorkspaceApp(app, query));
  return <div className="ws-home">
    <div className="admin-topline"><p className="eyebrow">PERSONAL WORKSPACE / OVERVIEW</p><span className="private-badge"><i/>{isAdmin ? 'Admin access' : 'Invited access'}</span></div>
    <header className="ws-welcome"><div><p className="ws-overline">A LITTLE SPACE. A LOT OF POSSIBILITY.</p><h1>Make room for<br/><em>what matters.</em></h1><p>Your days, your projects, your next adventure.<br className="ws-desktop-break"/> Pick up wherever you want to go.</p></div><div className="ws-orbit" aria-hidden="true"><div className="ws-orbit-ring"/><div className="ws-orbit-core">bc<span>workspace</span></div>{['morning-feed','project-board','robot-party','japan-trip','calendar-companion'].map((slug, index) => <span key={slug} className={`ws-orbit-node ws-orbit-node-${index}`} style={{ '--app-color': appPresentation(slug).color }}><WorkspaceIcon name={slug}/></span>)}</div></header>
    <div className="ws-apps-heading"><div><h2>Your launchpad <span>{apps.length}</span></h2><p>Small tools. Useful things. All yours.</p></div><label className="ws-home-search"><WorkspaceIcon name="search"/><span className="sr-only">Filter apps</span><input type="search" placeholder="Filter your apps…" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
    {apps.length ? <><div className="ws-app-grid">{filtered.map(app => { const presentation = appPresentation(app.slug); return <Link className="ws-app-card" href={app.href} key={app.href} style={{ '--app-color': presentation.color }}><div className="ws-card-top"><span className="ws-card-icon"><WorkspaceIcon name={app.slug}/></span><span className="ws-card-category">{presentation.category}</span><span className="ws-card-code" aria-hidden="true">{presentation.code}</span></div><h3>{app.name}</h3><p>{presentation.summary}</p><div className="ws-card-bottom"><span>{presentation.action}</span><small>{roleLabel(app.role)}</small></div></Link>; })}</div>{!filtered.length && <div className="ws-search-empty" role="status"><h3>No apps found.</h3><p>Try another name or start fresh.</p><button onClick={() => setQuery('')}>Clear search</button></div>}</> : <section className="empty-apps"><WorkspaceIcon name="home"/><h2>Your workspace starts here.</h2><p>Your first app will appear here when it’s ready.</p><a className="inline-link" href="mailto:bartconsedine@gmail.com?subject=An%20idea%20for%20my%20workspace">Capture an app idea</a></section>}
    <footer className="ws-home-footer"><span><i/> A place for your everyday</span><span>Jump between apps with <kbd>Ctrl K</kbd></span></footer>
  </div>;
}
