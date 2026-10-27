import 'server-only';
import { requireAdmin } from './auth';
import { createAppRegistry } from './app-registry';
import CalendarCompanion from '@/private-apps/calendar-companion/planner';
import { googleSession, connectGoogle } from '@/private-apps/calendar-companion/google-session';
import { createCalendarApi } from '@/private-apps/calendar-companion/api';
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
}, {
  slug: 'calendar-companion', name: 'Calendar companion',
  description: 'Your Google calendars, family birthdays and sitter plans. More time for the good things.',
  Component: CalendarCompanion, api: createCalendarApi({ readAppData, compareAndWriteAppData, googleSession, connectGoogle }),
}], requireAdmin);

export async function listApps() {
  return registry.list();
}

export async function getApp(slug) {
  return registry.get(slug);
}
