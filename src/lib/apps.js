import 'server-only';
import { requireWorkspace, checkAppAccess } from './auth';
import { visibleApps } from './workspace-policy';
import { createAppRegistry } from './app-registry';
import JapanTrip from '@/private-apps/japan-trip/command-center';
import { createTripApi } from '@/private-apps/japan-trip/api';
import { startingPlan } from '@/private-apps/japan-trip/starter';
import { readAppData, compareAndWriteAppData } from './app-data';

// Register only implemented apps here. Never place private app data in /public.
// Each entry: { slug, name, description, Component }. See docs/ADDING_APPS.md.
const registry = createAppRegistry([{
  slug: 'japan-trip', name: 'Japan command center',
  description: 'Tokyo streets, Hokkaido snow. Your itinerary, bookings and next decisions in one place.',
  Component: JapanTrip, api: createTripApi({ readAppData, compareAndWriteAppData, startingPlan }),
}], requireWorkspace);

export async function listApps() {
  return visibleApps(await registry.list(), await requireWorkspace());
}

export async function getApp(slug, ownerId) {
  const access = await checkAppAccess(slug, ownerId);
  if (!access.ok) return null;
  const app = await registry.get(slug);
  return app ? { ...app, access } : null;
}
