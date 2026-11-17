// Static presentation only. Availability and owner-scoped URLs come from listApps.
const presentations = {
  'morning-feed': { category: 'Daily rhythm', color: '#e0af68', code: 'MS', summary: 'A clear start to your day.', action: 'Open your morning' },
  'project-board': { category: 'Make progress', color: '#7aa2f7', code: 'PB', summary: 'Turn the next step into done.', action: 'Open your board' },
  'robot-party': { category: 'Stay connected', color: '#bb9af7', code: 'RP', summary: 'Good ideas deserve a conversation.', action: 'Join the conversation' },
  'japan-trip': { category: 'Go somewhere', color: '#7dcfff', code: 'JP', summary: 'Tokyo streets. Hokkaido snow.', action: 'Explore your trip' },
  'calendar-companion': { category: 'Make time', color: '#9ece6a', code: 'CC', summary: 'More room for the good things.', action: 'See your plans' },
};
export const appPresentation = slug => presentations[slug] ?? { category: 'Your tools', color: '#7aa2f7', code: 'APP', summary: 'A little space to make things happen.', action: 'Open app' };
export const roleLabel = role => role === 'owner' ? 'Your space' : role === 'viewer' ? 'Shared · View only' : 'Shared · Can edit';
export function matchesWorkspaceApp(app, query) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = `${app.name} ${app.description} ${appPresentation(app.slug).category} ${app.role ? roleLabel(app.role) : ''}`.toLocaleLowerCase();
  return terms.every(term => text.includes(term));
}
export function activeWorkspaceApp(app, pathname, owner, apps = []) {
  const path = `/admin/apps/${app.slug}`;
  const contexts = apps.filter(candidate => candidate.slug === app.slug);
  const defaultContext = contexts.find(candidate => candidate.role === 'owner') ?? (contexts.length === 1 ? contexts[0] : null);
  return (pathname === path || pathname?.startsWith(`${path}/`)) && (owner ? app.ownerId === owner : defaultContext ? app.ownerId === defaultContext.ownerId : app.role === 'owner');
}
