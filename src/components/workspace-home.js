'use client';

import Link from 'next/link';
import { useState } from 'react';
import WorkspaceIcon from './workspace-icon';
import { appPresentation, matchesWorkspaceApp, roleLabel } from '@/lib/workspace-presentation';

export default function WorkspaceHome({ apps, isAdmin }) {
  const [query, setQuery] = useState('');
  const filtered = apps.filter(app => matchesWorkspaceApp(app, query));
  return <div className="ws-home">
    <div className="ws-apps-heading"><h1>My apps <span>{apps.length}</span></h1><span className="private-badge">{isAdmin ? 'Admin' : 'Invited access'}</span><label className="ws-home-search"><WorkspaceIcon name="search"/><span className="sr-only">Filter apps</span><input type="search" placeholder="Filter apps…" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
    {apps.length ? <><div className="ws-app-grid">{filtered.map(app => { const presentation = appPresentation(app.slug); return <Link className="ws-app-card" href={app.href} key={app.href} style={{ '--app-color': presentation.color }}><div className="ws-card-top"><span className="ws-card-icon"><WorkspaceIcon name={app.slug}/></span><span className="ws-card-category">{presentation.category}</span></div><h3>{app.name}</h3><p>{presentation.summary}</p><div className="ws-card-bottom"><span>{presentation.action}</span><small>{roleLabel(app.role)}</small></div></Link>; })}</div>{!filtered.length && <div className="ws-search-empty" role="status"><h3>No apps found.</h3><p>Try another name or start fresh.</p><button onClick={() => setQuery('')}>Clear search</button></div>}</> : <section className="empty-apps"><WorkspaceIcon name="home"/><h2>Your workspace starts here.</h2><p>Your first app will appear here when it’s ready.</p><a className="inline-link" href="mailto:bartconsedine@gmail.com?subject=An%20idea%20for%20my%20workspace">Capture an app idea</a></section>}

  </div>;
}
