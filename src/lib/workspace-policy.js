import { googleIdentityDecision } from './auth-policy.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const appHref = (slug, ownerId) => `/admin/apps/${encodeURIComponent(slug)}?owner=${encodeURIComponent(ownerId)}`;
export async function verifyWorkspace(client) {
  if (!client) return { ok: false, status: 503, reason: 'unconfigured' };
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return { ok: false, status: error.status >= 500 ? 503 : 401, reason: error.status >= 500 ? 'unavailable' : 'unauthenticated' };
    const identity = googleIdentityDecision(data?.user);
    if (!identity.ok) return identity;
    const admin = await client.rpc('is_site_admin');
    if (admin.error) throw new Error('Membership unavailable');
    const grants = await client.rpc('my_app_grants');
    // Allows a code-first rollout while the reviewed sharing migration is pending.
    // Only existing admins may proceed; invitations never fall back on failure.
    if (grants.error) {
      if (admin.data === true && ['PGRST202', '42883'].includes(grants.error.code)) return { ...identity, isAdmin: true, grants: [], sharingReady: false };
      throw new Error('Grants unavailable');
    }
    if (!Array.isArray(grants.data) || grants.data.some(g => !uuid.test(g.owner_id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(g.app_slug) || !['viewer', 'editor'].includes(g.role))) throw new Error('Invalid grants');
    if (admin.data !== true && !grants.data.length) return { ok: false, status: 403, reason: 'forbidden' };
    return { ...identity, isAdmin: admin.data === true, grants: grants.data, sharingReady: true };
  } catch { return { ok: false, status: 503, reason: 'unavailable' }; }
}
export function appAccess(workspace, slug, requestedOwner) {
  if (!workspace.ok) return workspace;
  if (requestedOwner && !uuid.test(requestedOwner)) return { ok: false, status: 400, reason: 'invalid_owner' };
  const candidates = workspace.grants.filter(g => g.app_slug === slug);
  const ownerId = requestedOwner || (workspace.isAdmin ? workspace.user.id : candidates.length === 1 ? candidates[0].owner_id : null);
  const grant = candidates.find(g => g.owner_id === ownerId);
  if (!ownerId || !(workspace.isAdmin && ownerId === workspace.user.id) && !grant) return { ok: false, status: 404, reason: 'not_found' };
  return { ...workspace, ownerId, role: workspace.isAdmin && ownerId === workspace.user.id ? 'owner' : grant.role };
}
export function visibleApps(entries, workspace) {
  if (!workspace.ok) return [];
  const result = [];
  for (const { slug, name, description } of entries) {
    if (workspace.isAdmin) result.push({ slug, name, description, ownerId: workspace.user.id, role: 'owner', href: appHref(slug, workspace.user.id) });
    for (const grant of workspace.grants.filter(g => g.app_slug === slug && g.owner_id !== workspace.user.id)) result.push({ slug, name, description, ownerId: grant.owner_id, role: grant.role, href: appHref(slug, grant.owner_id) });
  }
  return result;
}
