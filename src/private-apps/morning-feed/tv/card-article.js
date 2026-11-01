// History stores only the card identifier. Resolve private copy from the currently authorized feed.
export function cardArticle(id, cards) {
 const card = cards.find(item => item.id === id && item.enabled);
 if (!card) return null;
 try { const url = new URL(card.url); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return null;
  return {kind:'card',title:card.title,url:url.href,summary:card.body,editions:[]};
 } catch { return null; }
}
