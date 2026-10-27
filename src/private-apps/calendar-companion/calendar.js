import { coverageWindow, deadline } from './model.js';

const stamp = n => new Date(n).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const escape = text => text.replaceAll('\\', '\\\\').replaceAll('\r', '').replaceAll('\n', '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
function fold(line) {
  const lines = []; let part = '', bytes = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    if (bytes + length > 75) { lines.push(part); part = ' '; bytes = 1; }
    part += char; bytes += length;
  }
  return [...lines, part].join('\r\n');
}
// A private download, not a public feed. Stable UIDs relate the three event types.
export function calendarFile(planner, revision, now = Date.now()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bart workspace//Calendar companion//EN', 'CALSCALE:GREGORIAN'];
  const event = (plan, kind, title, start, end, extra = []) => {
    lines.push('BEGIN:VEVENT', `UID:${plan.id}-${kind}@calendar-companion.bartconsedine.com`, `DTSTAMP:${stamp(now)}`, `LAST-MODIFIED:${stamp(revision ?? now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escape(title)}`, `STATUS:${plan.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, `TRANSP:${kind === 'plan' ? 'OPAQUE' : 'TRANSPARENT'}`, `DESCRIPTION:${escape(`${plan.notes}\nCoverage: ${plan.coverage}${plan.sitter ? ` — ${plan.sitter}` : ''}\nCalendar companion export. Reconcile changes in your calendar after a new export.`)}`, ...extra, 'END:VEVENT');
  };
  for (const p of planner.plans) {
    event(p, 'plan', p.title, p.start, p.end);
    if (p.coverage === 'Not needed') continue;
    const window = coverageWindow(p, planner.settings);
    event(p, 'sitter', `Sitter ${p.coverage.toLowerCase()}: ${p.title}${p.sitter ? ` (${p.sitter})` : ''}`, window.start, window.end, [`RELATED-TO:${p.id}-plan@calendar-companion.bartconsedine.com`]);
    if (p.cancelled || p.coverage === 'Confirmed' || Date.parse(p.start) <= now) continue;
    // Each future morning from the booking deadline until the day before the plan.
    const due = Math.max(deadline(p, planner.settings), now + 60000);
    if (due >= Date.parse(p.start)) continue;
    const title = `${p.coverage === 'Asked' ? 'Follow up' : 'Book sitter'}: ${p.title}`;
    event(p, 'reminder', title, due, due + 15 * 60000, [
      `RRULE:FREQ=DAILY;UNTIL=${stamp(Date.parse(p.start) - 1)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(title)}`, 'TRIGGER:PT0S', 'END:VALARM',
    ]);
  }
  return lines.map(fold).join('\r\n') + '\r\n';
}
