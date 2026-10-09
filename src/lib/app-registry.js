// Dependency-injected policy, shared by the server-only registry and regression tests.
export function createAppRegistry(entries, requireOwner) {
  const slugs = new Set();
  const apps = entries.map(entry => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug) || entry.slug.length > 80 || slugs.has(entry.slug)) throw new Error('Invalid or duplicate app slug');
    if (typeof entry.name !== 'string' || !entry.name.trim() || typeof entry.description !== 'string' || typeof entry.Component !== 'function') throw new Error('Incomplete app registration');
    for (const [method, handler] of Object.entries(entry.api || {})) {
      if (!['GET', 'POST'].includes(method) || typeof handler !== 'function') throw new Error('Unsupported app API handler');
    }
    slugs.add(entry.slug);
    return Object.freeze({ ...entry, api: Object.freeze({ ...entry.api }) });
  });
  return {
    async list() {
      await requireOwner();
      return apps.map(({ slug, name, description }) => ({ slug, name, description }));
    },
    async get(slug) {
      await requireOwner();
      return apps.find(app => app.slug === slug) || null;
    },
  };
}
