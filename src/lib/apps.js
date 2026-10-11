import 'server-only';
import { requireAdmin } from './auth';
import { createAppRegistry } from './app-registry';
import JapanTrip from '@/private-apps/japan-trip/command-center';
import { createTripApi } from '@/private-apps/japan-trip/api';
import { readAppData, writeAppData } from './app-data';

// Register only implemented apps here. Never place private app data in /public.
// Each entry: { slug, name, description, Component }. See docs/ADDING_APPS.md.
const registry = createAppRegistry([{
  slug: 'japan-trip', name: 'Japan command center',
  description: 'Tokyo streets, Hokkaido snow. Your itinerary, bookings and next decisions in one place.',
  Component: JapanTrip, api: createTripApi({ readAppData, writeAppData }),
}], requireAdmin);

export async function listApps() {
  return registry.list();
}

export async function getApp(slug) {
  return registry.get(slug);
}
