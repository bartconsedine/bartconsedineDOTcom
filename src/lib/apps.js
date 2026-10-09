import 'server-only';
import { requireOwner } from './auth';

// Register only implemented apps here. Never place private app data in /public.
// Each entry: { slug, name, description, Component }. See docs/ADDING_APPS.md.
const registry = [];

export async function listApps() {
  await requireOwner();
  return registry.map(({ slug, name, description }) => ({ slug, name, description }));
}

export async function getApp(slug) {
  await requireOwner();
  return registry.find(app => app.slug === slug) || null;
}
