const paths = {
  home: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  'morning-feed': <><path d="M3 17h18M5 21h14M7 13a5 5 0 0 1 10 0M12 2v3M3 6l2 2M21 6l-2 2"/></>,
  'project-board': <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M15 4v16M5.5 8h1M11.5 8h1M17.5 8h1M5.5 12h1M11.5 12h1"/></>,
  'robot-party': <><rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 3v4M9 16h6M8 11v1M16 11v1M1 11v5M23 11v5"/></>,
  'japan-trip': <><path d="m2 20 7-10 4 5 3-4 6 9H2Z"/><circle cx="16" cy="5" r="2.5"/></>,
  'calendar-companion': <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18M7 15h3M14 15h3M7 18h3"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  people: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
};
export default function WorkspaceIcon({ name, className = '' }) {
  return <svg className={`ws-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.home}</svg>;
}
