import 'server-only';
import { requireWorkspace, checkAppAccess } from './auth';
import { visibleApps } from './workspace-policy';
import { createAppRegistry } from './app-registry';
import MorningFeed from '@/private-apps/morning-feed/screen';
import { createMorningApi } from '@/private-apps/morning-feed/api';
import ProjectBoard from '@/private-apps/project-board/board';
import { createProjectBoardApi } from '@/private-apps/project-board/api';
import { boardStorage as projectStorage } from '@/private-apps/project-board/storage';
import { verifyCalendarLink } from '@/private-apps/project-board/calendar';
import CalendarCompanion from '@/private-apps/calendar-companion/planner';
import { googleSession, connectGoogle } from '@/private-apps/calendar-companion/google-session';
import { createCalendarApi } from '@/private-apps/calendar-companion/api';
import RobotParty from '@/private-apps/robot-party/board';
import { createBoardApi } from '@/private-apps/robot-party/api';
import { boardStorage } from '@/private-apps/robot-party/storage';
import JapanTrip from '@/private-apps/japan-trip/command-center';
import { createTripApi } from '@/private-apps/japan-trip/api';
import { startingPlan } from '@/private-apps/japan-trip/starter';
import { readAppData, compareAndWriteAppData } from './app-data';

// Register only implemented apps here. Never place private app data in /public.
// Each entry: { slug, name, description, Component }. See docs/ADDING_APPS.md.
const registry = createAppRegistry([{
  slug: 'morning-feed', name: 'Morning signal',
  description: 'Your morning rituals, briefings and big ideas. One personal feed, ready for the big screen.',
  Component: MorningFeed, api: createMorningApi({ readAppData, compareAndWriteAppData }),
}, {
  slug: 'project-board', name: 'Project board',
  description: 'Private projects and next steps, connected to your calendar.',
  Component: ProjectBoard, api: createProjectBoardApi({ storage: projectStorage, verifyCalendarLink }),
}, {
  slug: 'robot-party', name: 'Robot Party',
  description: 'A private message board for people and their robots to share progress, ideas and useful feedback.',
  Component: RobotParty, api: createBoardApi(boardStorage),
}, {
  slug: 'japan-trip', name: 'Japan command center',
  description: 'Tokyo streets, Hokkaido snow. Your itinerary, bookings and next decisions in one place.',
  Component: JapanTrip, api: createTripApi({ readAppData, compareAndWriteAppData, startingPlan }),
}, {
  slug: 'calendar-companion', name: 'Calendar companion',
  description: 'Your Google calendars, family birthdays and sitter plans. More time for the good things.',
  Component: CalendarCompanion, api: createCalendarApi({ readAppData, compareAndWriteAppData, googleSession, connectGoogle }),
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
