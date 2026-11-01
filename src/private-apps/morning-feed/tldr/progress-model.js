import { publicLink } from './model.js';
export { newestFirst } from './model.js';

export async function articleId(url) {
  const canonical = publicLink(url);
  if (!canonical) throw Error('Invalid article URL.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Only confirmed database state enters this disposable projection. Idempotent,
// append-only marks cannot overwrite progress from another session/device.
export function createNewsProgress({ endpoint, fetcher = fetch }) {
  let reads = new Set(), ready = false;
  return {
    async load() {
      const response = await fetcher(endpoint, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.state !== 'ready' || !Array.isArray(data.reads) || data.reads.some(row => !/^[a-f0-9]{64}$/.test(row?.id) || !row.readAt)) throw Error(data.state === 'disabled' ? 'Saved reading progress is not enabled yet.' : 'Could not load reading progress. Retry.');
      const loaded = new Set(data.reads.map(row => row.id));
      // Marks are append-only, so a late list must never erase confirmed reads,
      // including reads learned by another overlapping list from another session.
      for (const id of reads) loaded.add(id);
      reads = loaded;
      // A successful list is required before a partial mark response can be used.
      ready = true;
      return new Set(reads);
    },
    async mark(url) {
      if (!ready) await this.load();
      const id = await articleId(url);
      const response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', url }) });
      const data = await response.json();
      if (!response.ok || data.state !== 'saved' || data.id !== id || !data.readAt) throw Error('Read status was not saved. Retry to keep your progress.');
      reads.add(id);
      return new Set(reads);
    },
  };
}
