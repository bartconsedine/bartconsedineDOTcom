export const SLUG = 'calendar-companion';
export const KEY = 'planner-v1';
export const MAX_BYTES = 180000;
export const COVERAGE = ['Needed', 'Asked', 'Confirmed', 'Not needed'];
export const DAY = 86400000;
export const emptyPlanner = () => ({ version: 1, settings: { timeZone: 'America/New_York', leadDays: 14, horizonWeeks: 6, preferredDay: 5, preferredTime: '19:00', durationHours: 3, bufferMinutes: 30, weeklyGoal: 1 }, plans: [], ideas: [] });
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new Error('Unexpected or missing fields.');
}
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('Invalid text.');
}
function integer(value, min, max) { if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid planning setting.'); }
export function dayInZone(instant, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function addDays(day, count) { return new Date(Date.parse(`${day}T12:00:00Z`) + count * DAY).toISOString().slice(0, 10); }
export function localInstant(day, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error('Invalid date or time.');
  const desired = Date.parse(`${day}T${time}:00Z`);
  let guess = desired;
  const parts = n => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(n)).map(p => [p.type, p.value]));
  for (let i = 0; i < 4; i++) {
    const p = parts(guess);
    const delta = desired - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    if (delta === 0) return guess;
    guess += delta;
  }
  throw new Error('This local time does not exist because of daylight saving time. Choose another time.');
}
export function validatePlanner(value) {
  exact(value, ['version', 'settings', 'plans', 'ideas']);
  if (value.version !== 1) throw new Error('Unsupported planner version.');
  const s = value.settings;
  exact(s, ['timeZone', 'leadDays', 'horizonWeeks', 'preferredDay', 'preferredTime', 'durationHours', 'bufferMinutes', 'weeklyGoal']);
  text(s.timeZone, 80, true);
  try { new Intl.DateTimeFormat('en-US', { timeZone: s.timeZone }).format(); } catch { throw new Error('Choose a valid IANA time zone.'); }
  integer(s.leadDays, 1, 90); integer(s.horizonWeeks, 2, 12); integer(s.preferredDay, 0, 6); integer(s.durationHours, 1, 12); integer(s.bufferMinutes, 0, 120); integer(s.weeklyGoal, 1, 3);
  localInstant('2030-01-15', s.preferredTime, s.timeZone);
  if (!Array.isArray(value.plans) || value.plans.length > 150 || !Array.isArray(value.ideas) || value.ideas.length > 30) throw new Error('Keep up to 150 plans and 30 ideas.');
  const ids = new Set();
  for (const p of value.plans) {
    exact(p, ['id', 'title', 'start', 'end', 'coverage', 'sitter', 'notes', 'cancelled']);
    text(p.id, 80, true); text(p.title, 160, true); text(p.sitter, 120); text(p.notes, 2000);
    if (!/^[a-zA-Z0-9-]+$/.test(p.id) || ids.has(p.id)) throw new Error('Plan IDs must be unique.');
    ids.add(p.id);
    for (const d of [p.start, p.end]) if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString() !== d) throw new Error('Invalid event timestamp.');
    if (Date.parse(p.end) <= Date.parse(p.start) || Date.parse(p.end) - Date.parse(p.start) > DAY) throw new Error('Plans must last between one minute and 24 hours.');
    if (!COVERAGE.includes(p.coverage) || typeof p.cancelled !== 'boolean') throw new Error('Invalid sitter coverage.');
    if (p.coverage === 'Confirmed' && !p.sitter.trim()) throw new Error('Name the confirmed sitter.');
  }
  for (const idea of value.ideas) text(idea, 160, true);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES) throw new Error('Planner is too large.');
  return value;
}
export function coverageWindow(plan, settings) {
  return { start: Date.parse(plan.start) - settings.bufferMinutes * 60000, end: Date.parse(plan.end) + settings.bufferMinutes * 60000 };
}
export function deadline(plan, settings) {
  return localInstant(addDays(dayInZone(plan.start, settings.timeZone), -settings.leadDays), '09:00', settings.timeZone);
}
export function reminders(planner, now = Date.now()) {
  return planner.plans.filter(p => !p.cancelled && Date.parse(p.end) > now && ['Needed', 'Asked'].includes(p.coverage)).map(plan => {
    const due = deadline(plan, planner.settings);
    const days = Math.ceil((Date.parse(plan.start) - now) / DAY);
    return { plan, due, days, urgent: days <= 3, overdue: due <= now, action: plan.coverage === 'Asked' ? 'Follow up with sitter' : 'Book a sitter' };
  }).sort((a, b) => a.due - b.due);
}
export function suggestions(planner, now = Date.now()) {
  const s = planner.settings, today = dayInZone(now, s.timeZone);
  const weekStart = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const result = [];
  const active = planner.plans.filter(p => !p.cancelled);
  for (let w = 0; w < s.horizonWeeks; w++) {
    const first = addDays(weekStart, w * 7), last = addDays(first, 7);
    const count = active.filter(p => { const day = dayInZone(p.start, s.timeZone); return day >= first && day < last; }).length;
    const needed = Math.max(0, s.weeklyGoal - count);
    let added = 0;
    for (let offset = 0; offset < 7 && added < needed; offset++) {
      const day = addDays(first, (s.preferredDay + 6 + offset) % 7);
      if (day < addDays(today, s.leadDays)) continue;
      let start;
      try { start = localInstant(day, s.preferredTime, s.timeZone); } catch { continue; }
      const end = start + s.durationHours * 3600000;
      const window = coverageWindow({ start: new Date(start).toISOString(), end: new Date(end).toISOString() }, s);
      if (active.some(p => { const other = coverageWindow(p, s); return other.start < window.end && other.end > window.start; })) continue;
      result.push({ day, start: new Date(start).toISOString(), end: new Date(end).toISOString(), title: planner.ideas.length ? planner.ideas[(w + added) % planner.ideas.length] : 'Time together', week: first });
      added++;
    }
  }
  return result;
}
