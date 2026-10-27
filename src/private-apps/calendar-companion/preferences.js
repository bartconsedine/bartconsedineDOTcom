import { emptyPlanner, validatePlanner } from './model.js';

export const SLUG = 'calendar-companion';
export const KEY = 'google-v2';
export const MAX_BYTES = 16000;
export const emptyPreferences = () => ({ version: 2, settings: emptyPlanner().settings, ideas: [], readCalendars: [], writeCalendar: '' });
export function validatePreferences(value) {
  if (!value || Array.isArray(value) || Object.keys(value).sort().join() !== 'ideas,readCalendars,settings,version,writeCalendar' || value.version !== 2) throw new Error('Invalid calendar preferences. Events belong in Google Calendar.');
  validatePlanner({ version: 1, settings: value.settings, ideas: value.ideas, plans: [] });
  if (!Array.isArray(value.readCalendars) || value.readCalendars.length > 5 || new Set(value.readCalendars).size !== value.readCalendars.length) throw new Error('Choose up to five calendars.');
  for (const id of [...value.readCalendars, value.writeCalendar]) if (typeof id !== 'string' || id.length > 300 || /[\u0000-\u001f]/.test(id)) throw new Error('Invalid calendar identifier.');
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES) throw new Error('Preferences are too large.');
  return value;
}
