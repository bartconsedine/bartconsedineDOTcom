export const SLUG = 'japan-trip';
export const KEY = 'plan-v1';
export const MAX_BYTES = 180000;
export const STATUSES = ['Not started', 'Researching', 'Ready to book', 'On request', 'Booked', 'Waiting', 'Not needed'];

export function emptyPlan() {
  return { version: 1, title: 'Japan / Japow', start: '', end: '', travelers: 1, budget: 0, notes: '', sourceUrl: '', sourceReadAt: '', days: [], bookings: [], tasks: [] };
}

function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Unexpected or missing fields.');
}
function text(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label} is required or too long.`);
}
function date(value, label) {
  text(value, 10, label);
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) throw new Error(`${label} must be a valid date.`);
}
function amount(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000000 || Math.round(value * 100) / 100 !== value) throw new Error(`${label} must be a nonnegative amount with at most two decimal places.`);
}
function url(value) {
  text(value, 2000, 'Link');
  if (value) {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('Links must be valid HTTPS URLs.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Links must be valid HTTPS URLs.');
  }
}
function list(value, limit, keys, validate) {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Too many entries (maximum ${limit}).`);
  const ids = new Set();
  for (const entry of value) {
    object(entry, keys);
    if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(entry.id) || ids.has(entry.id)) throw new Error('Entries need unique IDs.');
    ids.add(entry.id);
    validate(entry);
  }
}
export function validatePlan(plan) {
  object(plan, Object.keys(emptyPlan()));
  if (plan.version !== 1) throw new Error('Unsupported plan version.');
  text(plan.title, 120, 'Trip name', true);
  date(plan.start, 'Departure'); date(plan.end, 'Return');
  if (plan.start && plan.end && plan.start > plan.end) throw new Error('Return must follow departure.');
  if (!Number.isInteger(plan.travelers) || plan.travelers < 1 || plan.travelers > 20) throw new Error('Travelers must be between 1 and 20.');
  amount(plan.budget, 'Target budget'); text(plan.notes, 16000, 'Notes'); url(plan.sourceUrl); date(plan.sourceReadAt, 'Source read date');
  list(plan.days, 60, ['id', 'date', 'location', 'morning', 'afternoon', 'evening', 'sleep', 'risk', 'riding'], day => {
    date(day.date, 'Day');
    if (!day.date || (plan.start && day.date < plan.start) || (plan.end && day.date > plan.end)) throw new Error('Itinerary dates must fall within the trip.');
    text(day.location, 120, 'Location', true);
    for (const key of ['morning', 'afternoon', 'evening', 'sleep', 'risk']) text(day[key], 1500, key);
    if (typeof day.riding !== 'boolean') throw new Error('Riding day must be true or false.');
  });
  list(plan.bookings, 100, ['id', 'item', 'status', 'due', 'provider', 'estimate', 'actual', 'confirmation', 'url', 'notes'], booking => {
    text(booking.item, 160, 'Booking name', true);
    if (!STATUSES.includes(booking.status)) throw new Error('Unknown booking status.');
    date(booking.due, 'Deadline'); text(booking.provider, 200, 'Provider'); amount(booking.estimate, 'Estimate', true); amount(booking.actual, 'Actual', true);
    text(booking.confirmation, 200, 'Confirmation'); url(booking.url); text(booking.notes, 3000, 'Booking notes');
  });
  list(plan.tasks, 150, ['id', 'title', 'due', 'done'], task => {
    text(task.title, 500, 'Task', true); date(task.due, 'Task deadline');
    if (typeof task.done !== 'boolean') throw new Error('Task completion must be true or false.');
  });
  if (new TextEncoder().encode(JSON.stringify(plan)).length > MAX_BYTES) throw new Error('Plan is too large.');
  return plan;
}

export function metrics(plan, today = new Date().toISOString().slice(0, 10)) {
  const included = plan.bookings.filter(row => row.status !== 'Not needed');
  const estimated = included.reduce((sum, row) => sum + (row.estimate ?? 0), 0);
  const actual = included.reduce((sum, row) => sum + (row.actual ?? 0), 0);
  const forecast = included.reduce((sum, row) => sum + (row.actual ?? row.estimate ?? 0), 0);
  const unpriced = included.filter(row => row.actual === null && row.estimate === null).length;
  const open = included.filter(row => row.status !== 'Booked');
  return { estimated, actual, forecast, unpriced, remaining: plan.budget - forecast, perTraveler: forecast / plan.travelers, booked: included.length - open.length, total: included.length, riding: plan.days.filter(day => day.riding).length, overdue: open.filter(row => row.due && row.due < today), next: open.filter(row => row.due).sort((a, b) => a.due.localeCompare(b.due))[0] ?? null };
}
