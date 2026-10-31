export const EDITIONS = ['tech', 'ai', 'dev', 'infosec', 'devops'];
export function historyPage(request) {
  const raw = new URL(request.url).searchParams.get('history') ?? '0';
  if (!/^(0|[1-9]\d{0,2})$/.test(raw)) throw Error('Invalid issue page.');
  return Number(raw);
}
export function decode(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };
  return value.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, key) => {
    if (!key.startsWith('#')) return named[key] ?? whole;
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}
const plain = value => decode(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
export function archiveDates(html, edition) {
  if (!EDITIONS.includes(edition)) throw Error('Unknown edition.');
  return [...new Set([...html.matchAll(new RegExp(`href=["'](?:https://tldr\\.tech)?/${edition}/(\\d{4}-\\d{2}-\\d{2})["']`, 'g'))].map(m => m[1]))].sort().reverse();
}
export function publicLink(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.href.length > 3000) return null;
    if (!/^[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}$/i.test(url.hostname) || /\.(local|internal|localhost|test|invalid)$/i.test(url.hostname)) return null;
    if (/unsubscribe|referral|\/refer(?:\/|\?)|\/subscribe(?:\/|\?)/i.test(url.href) || /^(advertise\.|tracking\.|click\.)/i.test(url.hostname)) return null;
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid|mc_cid|mc_eid|subscriber_id|email|referral|token)$/i.test(key)) url.searchParams.delete(key);
    url.hash = ''; // Canonical identity; functional query parameters (v, id, st, etc.) survive.
    return url.href;
  } catch { return null; }
}
export function summaryText(html) {
  return decode(html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(?:br|\/p|\/div|\/li)\b[^>]*>/gi, '\n').replace(/<li\b[^>]*>/gi, '• ').replace(/<[^>]*>/g, '')).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function issueArticles(html) {
  const articles = [];
  // Only explicit editorial article blocks, never newsletter navigation, body links or scripts.
  for (const match of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    const block = match[1];
    const heading = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<\/a>/i);
    if (!heading || /(?:\((?:sponsor(?:ed)?|advertisement)[^)]*\)|^(?:sponsored|advertisement)\b)/i.test(plain(heading[2])) || /data-(?:sponsor|ad)\b|rel=["'][^"']*\bsponsored\b|>\s*(?:sponsor(?:ed)?|advertisement|partner content)\s*</i.test(match[0])) continue;
    const title = plain(heading[2]).replace(/\s*\(\d+ minute (?:read|watch)\)\s*$/i, '');
    const url = publicLink(decode(decode(heading[1])));
    if (title && title.length <= 500 && url) articles.push({ title, url, summary: summaryText(block.slice(heading.index + heading[0].length)) });
  }
  return articles;
}
export function mergeIssues(issues, now = Date.now()) {
  const unique = new Map();
  const sources = issues.map(issue => {
    for (const article of issue.articles ?? []) {
      let item = unique.get(article.url);
      if (!item) { item = { ...article, editions: [] }; unique.set(article.url, item); }
      item.editions.push({ edition: issue.edition, date: issue.date, summary: article.summary ?? '' });
    }
    return { edition: issue.edition, date: issue.date ?? null, checkedAt: issue.checkedAt ?? null, status: issue.error ? 'unavailable' : now - Date.parse(issue.checkedAt) > 3600000 ? 'cached' : now - Date.parse(issue.date) > 3 * 86400000 ? 'older' : 'current', count: issue.articles?.length ?? 0, hasOlder: Boolean(issue.hasOlder) };
  });
  return { articles: [...unique.values()], sources, hasOlder: sources.some(s => s.hasOlder) };
}
