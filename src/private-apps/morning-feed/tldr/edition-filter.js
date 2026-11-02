import { EDITIONS } from './model.js';
export { EDITIONS };

// Filter edition metadata too: shared links must use the selected source's copy.
export function filterEdition(articles, edition) {
  if (edition === 'all') return articles;
  return articles.flatMap(article => {
    const editions = article.editions.filter(item => item.edition === edition);
    return editions.length ? [{ ...article, editions, summary: editions[0].summary ?? '' }] : [];
  });
}
