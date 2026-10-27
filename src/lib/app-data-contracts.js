import { SLUG, KEY, MAX_BYTES, validatePlan } from '../private-apps/japan-trip/model.js';

import { SLUG as CALENDAR, KEY as CALENDAR_KEY, MAX_BYTES as CALENDAR_BYTES, validatePreferences } from '../private-apps/calendar-companion/preferences.js';

import { SLUG as MORNING, KEY as MORNING_KEY, MAX_BYTES as MORNING_BYTES, validateScreen } from '../private-apps/morning-feed/model.js';

// Shared by trusted chat tooling and app APIs. Only reviewed data contracts belong here.
const contracts = new Map([[MORNING, { key: MORNING_KEY, maxBytes: MORNING_BYTES, validate: validateScreen }], [SLUG, { key: KEY, maxBytes: MAX_BYTES, validate: validatePlan }], [CALENDAR, { key: CALENDAR_KEY, maxBytes: CALENDAR_BYTES, validate: validatePreferences }]]);
export function appDataContract(slug) {
  const contract = contracts.get(slug);
  if (!contract) throw new Error('App has no reviewed chat data contract');
  return contract;
}
export { validateRevision } from './record-revision.js';
