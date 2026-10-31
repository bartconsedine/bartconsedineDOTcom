// Allow enough time to read the source copy. No summary is shortened to fit a timer.
export function readingSeconds(summary = '') {
  return Math.max(24, Math.min(180, 10 + Math.ceil(summary.trim().split(/\s+/).filter(Boolean).length / 3)));
}
export function headlineSize(length) {
  return Math.max(30, Math.round(76 * Math.min(1, Math.sqrt(85 / Math.max(1, length)))));
}
// Fit real fonts to a two-line target when space permits; never clip pathological titles.
export function fitHeadline(element) {
  if (!element?.getBoundingClientRect || !element.textContent) return;
  const win = element.ownerDocument.defaultView;
  const max = Math.min(76, Math.max(34, win.innerWidth * 0.04));
  let size = max;
  element.style.fontSize = `${size}px`;
  while (size > 30 && element.scrollHeight > parseFloat(win.getComputedStyle(element).lineHeight) * 2 + 2) {
    size -= 2; element.style.fontSize = `${size}px`;
  }
}
export function issueDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', timeZone:'UTC' }).format(time) : 'Not loaded';
}
export function checkedAgo(value, now = Date.now()) {
  const elapsed = Math.max(0, now - Date.parse(value));
  if (!Number.isFinite(elapsed)) return 'Not checked yet';
  if (elapsed < 60000) return 'Checked just now';
  if (elapsed < 3600000) return `Checked ${Math.floor(elapsed / 60000)} min ago`;
  if (elapsed < 86400000) return `Checked ${Math.floor(elapsed / 3600000)} hr ago`;
  return `Checked ${Math.floor(elapsed / 86400000)} days ago`;
}
