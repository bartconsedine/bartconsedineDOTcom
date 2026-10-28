import { EDITIONS, archiveDates, issueArticles, mergeIssues, publicLink } from './model.js';
import { publicGet, publicHost } from './network.js';
export async function loadIssue(edition, page, { get = publicGet, host = publicHost, now = () => new Date().toISOString() } = {}) {
  const archive = await get(`https://tldr.tech/${edition}/archives`);
  const dates = archiveDates(archive.text, edition);
  const date = dates[page];
  if (!date) { if (!dates.length) throw Error('Archive format unavailable.'); return { edition, date: null, articles: [], checkedAt: now(), hasOlder: false }; }
  const issue = await get(`https://tldr.tech/${edition}/${date}`);
  const extracted = issueArticles(issue.text);
  if (!extracted.length) throw Error('Issue format unavailable.'); // Never replace a successful cache with a broken parser/empty page.
  let rejected = 0;
  const articles = (await Promise.all(extracted.map(async article => {
    try {
      // Public archive tracking redirects are resolved without cookies or subscriber credentials.
      if (/^(?:links?|clicks?)\.tldr\.tech$/i.test(new URL(article.url).hostname)) article = { ...article, url: publicLink((await get(article.url)).url) };
      if (!article.url) throw Error();
      await host(new URL(article.url).hostname);
      return article;
    } catch { rejected++; return null; }
  }))).filter(Boolean);
  // A temporary DNS/redirect failure must not silently truncate an issue or replace last success.
  if (rejected) throw Error('Article links temporarily unavailable.');
  return { edition, date, articles, checkedAt: now(), hasOlder: page + 1 < dates.length };
}
export async function collectIssues(page, readIssue) {
  const issues = await Promise.all(EDITIONS.map(async edition => {
    try { return await readIssue(edition, page); }
    catch { return { edition, error: true }; }
  }));
  return { ...mergeIssues(issues), history: page };
}
