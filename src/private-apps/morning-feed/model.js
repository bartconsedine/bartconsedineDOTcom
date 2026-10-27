export const SLUG = 'morning-feed';
export const KEY = 'screen-v1';
export const MAX_BYTES = 64000;
export const KINDS = ['ritual', 'briefing', 'link'];
export const emptyScreen = () => ({ version: 1, title: 'Morning signal', focus: '', timezone: 'America/New_York', rotationSeconds: 20, cards: [] });
function shape(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Unexpected screen fields.');
}
function text(value, limit, name, required = false) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error(`${name} must ${required ? 'have text and ' : ''}be at most ${limit} characters.`);
}
export function validateScreen(value) {
  shape(value, ['version', 'title', 'focus', 'timezone', 'rotationSeconds', 'cards']);
  if (value.version !== 1) throw new Error('Unsupported screen version.');
  text(value.title, 80, 'Title', true); text(value.focus, 400, 'Focus'); text(value.timezone, 80, 'Time zone', true);
  try { new Intl.DateTimeFormat('en-US', { timeZone: value.timezone }).format(); } catch { throw new Error('Use a valid time zone, such as America/New_York.'); }
  if (!Number.isInteger(value.rotationSeconds) || value.rotationSeconds < 10 || value.rotationSeconds > 300) throw new Error('Slide interval must be 10–300 seconds.');
  if (!Array.isArray(value.cards) || value.cards.length > 24) throw new Error('Use at most 24 cards.');
  const ids = new Set();
  for (const card of value.cards) {
    shape(card, ['id', 'kind', 'title', 'body', 'minutes', 'url', 'enabled', 'completedOn']);
    if (typeof card.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(card.id) || ids.has(card.id)) throw new Error('Cards need unique IDs.');
    ids.add(card.id);
    if (!KINDS.includes(card.kind)) throw new Error('Unknown card type.');
    text(card.title, 100, 'Card title', true); text(card.body, 1600, 'Card details'); text(card.url, 1000, 'Link');
    if (card.url) {
      let url; try { url = new URL(card.url); } catch { throw new Error('Use a full http or https link.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a full http or https link without credentials.');
    }
    if (card.kind === 'link' && !card.url) throw new Error('Link cards need a URL.');
    if (!Number.isInteger(card.minutes) || card.minutes < 0 || card.minutes > 180) throw new Error('Minutes must be 0–180.');
    if (typeof card.enabled !== 'boolean') throw new Error('Card visibility must be true or false.');
    if (typeof card.completedOn !== 'string' || card.completedOn !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(card.completedOn) || !Number.isFinite(Date.parse(card.completedOn)) || new Date(card.completedOn).toISOString().slice(0, 10) !== card.completedOn)) throw new Error('Invalid completion date.');
  }
  return value;
}
export function dayInZone(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function moveCard(cards, id, direction) {
  const result = [...cards], index = result.findIndex(card => card.id === id), target = index + direction;
  if (index >= 0 && target >= 0 && target < result.length) [result[index], result[target]] = [result[target], result[index]];
  return result;
}
