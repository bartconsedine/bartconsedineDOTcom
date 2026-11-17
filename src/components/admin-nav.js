'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import WorkspaceIcon from './workspace-icon';
import { activeWorkspaceApp, appPresentation, matchesWorkspaceApp, roleLabel } from '@/lib/workspace-presentation';

export default function AdminNav({ apps, isAdmin = false }) {
  const pathname = usePathname();
  const owner = useSearchParams().get('owner');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const dialog = useRef(null), input = useRef(null), trigger = useRef(null), opener = useRef(null);
  const destinations = [{ slug: 'home', name: 'My apps', description: 'Workspace overview', href: '/admin' }, ...apps,
    ...(isAdmin ? [{ slug: 'people', name: 'People & access', description: 'Manage invitations', href: '/admin/access' }] : [])];
  const results = destinations.filter(app => matchesWorkspaceApp(app, query));
  function openLauncher() {
    if (document.querySelector('dialog[open]') || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    opener.current = document.activeElement;
    setQuery(''); setSelected(0); dialog.current?.showModal(); input.current?.focus();
  }
  const closeLauncher = () => dialog.current?.close();
  useEffect(() => {
    const onKey = event => {
      if (!event.isComposing && !event.altKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (dialog.current?.open) closeLauncher(); else openLauncher();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { closeLauncher(); }, [pathname, owner]);
  const activeIndex = Math.min(selected, Math.max(0, results.length - 1));
  useEffect(() => { if (dialog.current?.open) dialog.current.querySelectorAll('[data-launcher-result]')[activeIndex]?.scrollIntoView({ block: 'nearest' }); }, [activeIndex, query]);
  return <>
    <button ref={trigger} className="ws-launcher-trigger" onClick={openLauncher} aria-label="Find an app (Control K)"><WorkspaceIcon name="search"/><span>Find an app</span><kbd>Ctrl K</kbd></button>
    <nav className="ws-navigation" aria-label="Workspace navigation">
      <Link className="ws-nav-link" href="/admin" title="My apps" aria-current={pathname === '/admin' ? 'page' : undefined}><WorkspaceIcon name="home"/><span>My apps</span></Link>
      <p className="ws-nav-label">YOUR APPS</p>
      {apps.map(app => <Link className="ws-nav-link" key={app.href} href={app.href} title={`${app.name} · ${roleLabel(app.role)}`} style={{ '--app-color': appPresentation(app.slug).color }} aria-current={activeWorkspaceApp(app, pathname, owner) ? 'page' : undefined}><WorkspaceIcon name={app.slug}/><span>{app.name}{app.role !== 'owner' && <small>{roleLabel(app.role)}</small>}</span></Link>)}
      <div className="ws-nav-divider"/>
      {isAdmin && <Link className="ws-nav-link" href="/admin/access" title="People & access" aria-current={pathname === '/admin/access' ? 'page' : undefined}><WorkspaceIcon name="people"/><span>People & access</span></Link>}
      <Link className="ws-nav-link" href="/" title="Public site"><WorkspaceIcon name="globe"/><span>Public site</span></Link>
    </nav>
    <dialog className="ws-launcher" ref={dialog} aria-labelledby="ws-launcher-title" onClose={() => (opener.current?.isConnected ? opener.current : trigger.current)?.focus()} onClick={event => { if (event.target === dialog.current) closeLauncher(); }}>
      <div className="ws-launcher-inner"><div className="ws-launcher-heading"><h2 id="ws-launcher-title">Go somewhere.</h2><button onClick={closeLauncher} aria-label="Close app launcher">Esc</button></div>
        <label className="ws-launcher-search"><WorkspaceIcon name="search"/><span className="sr-only">Search your apps</span><input ref={input} value={query} placeholder="Search apps, plans, conversations…" onChange={event => { setQuery(event.target.value); setSelected(0); }} onKeyDown={event => {
          if (event.isComposing) return;
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setSelected(results.length ? (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0); }
          if (event.key === 'Enter' && results.length) { event.preventDefault(); dialog.current?.querySelectorAll('[data-launcher-result]')[activeIndex]?.click(); }
        }} aria-describedby="ws-launcher-help" aria-controls="ws-launcher-results"/></label>
        <div id="ws-launcher-results" className="ws-launcher-results">{results.map((app, index) => <Link key={app.href} href={app.href} data-launcher-result="" data-selected={index === activeIndex} className="ws-launcher-result" onClick={closeLauncher} onFocus={() => setSelected(index)}><WorkspaceIcon name={app.slug}/><span><strong>{app.name}</strong><small>{app.role ? roleLabel(app.role) : app.description}</small></span>{index === activeIndex && <kbd>Enter</kbd>}</Link>)}{!results.length && <p className="ws-search-empty" role="status">No apps match “{query}”. Try another name.</p>}</div>
        <p id="ws-launcher-help" className="ws-launcher-help">Arrow keys to choose · Enter to open · Escape to close</p><p className="sr-only" aria-live="polite">{results.length ? `${results[activeIndex].name}, ${activeIndex + 1} of ${results.length}` : 'No matching apps'}</p>
      </div>
    </dialog>
  </>;
}
