import 'server-only';
import { requireAdmin } from './auth';
import { createAppRegistry } from './app-registry';

// Register only implemented apps here. Never place private app data in /public.
// Each entry: { slug, name, description, Component }. See docs/ADDING_APPS.md.
const registry = createAppRegistry([], requireAdmin);

export async function listApps() {
  return registry.list();
}

export async function getApp(slug) {
  return registry.get(slug);
}
