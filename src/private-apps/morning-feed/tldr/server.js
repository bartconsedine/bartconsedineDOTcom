import 'server-only';
import { unstable_cache } from 'next/cache';
import { collectIssues, loadIssue } from './source.js';
// Disposable PUBLIC source cache only. Never cache TV cookies, owner records or sessions.
// Revalidation throws on source/link errors, retaining Next's last successful cache entry.
// Slightly shorter than the half-hour cron cadence so scheduled reads trigger revalidation.
const readIssue = unstable_cache(loadIssue, ['tldr-public-editorial-summaries-v2'], { revalidate: 1740 });
export const getTldr = page => collectIssues(page, readIssue);
