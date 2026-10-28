import 'server-only';
import { unstable_cache } from 'next/cache';
import { collectIssues, loadIssue } from './source.js';
// Disposable PUBLIC source cache only. Never cache TV cookies, owner records or sessions.
// Revalidation throws on source/link errors, retaining Next's last successful cache entry.
const readIssue = unstable_cache(loadIssue, ['tldr-public-editorial-v1'], { revalidate: 1800 });
export const getTldr = page => collectIssues(page, readIssue);
