// A fixed allowlist; never redirect to an arbitrary callback query value.
export function authReturnPath(value) { return value === 'calendar' ? '/admin/apps/calendar-companion' : '/admin'; }
