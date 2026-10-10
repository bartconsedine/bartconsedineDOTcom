import { lstat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join, isAbsolute } from 'node:path';
import { connection, project } from './database-connection.mjs';

const messages = {
  ACTION: 'This launcher permits only URL validation, a read-only baseline check, or a logical backup.',
  INPUT_EMPTY: 'Nothing was entered. Paste the full PostgreSQL connection URL at the hidden prompt.',
  INPUT_WRAPPER: 'Paste only the URL, without DATABASE_URL=, export, quotes, or a shell command.',
  INPUT_SCHEME: 'Expected a full URL beginning postgresql:// or postgres://, not a password alone or the HTTPS project URL.',
  INPUT_STRUCTURE: 'The URL structure is invalid. Use the project Connect URI and percent-encode special password characters.',
  INPUT_ENCODING: 'The URL contains invalid percent encoding. Encode reserved password characters once in the connection URI.',
  INPUT_PROJECT: 'The URL does not identify the approved hosted project. Copy its Direct or Session pooler URI from Connect.',
  INPUT_PORT: 'Use port 5432 (Direct or Session pooler), not transaction pooling.',
  INPUT_DATABASE: 'Use the postgres database and the username supplied by the project Connect panel.',
  INPUT_PASSWORD: 'The URL has no password or still contains YOUR-PASSWORD. Substitute the existing password privately.',
  INPUT_OPTIONS: 'The connection URL has unsupported options. Start with the project Connect URI.',
  INPUT_CA: 'Use one consistent absolute path for the approved CA certificate.',
  CA_BUNDLE: 'The approved database CA file is missing or changed. Restore it from the reviewed checkout; do not disable verification.',
  MIGRATION_FILES: 'Reviewed migration files are missing, changed, or unexpected. Stop for code review; do not regenerate checksums to bypass the guard.',
  DEPENDENCIES: 'Required local packages could not load. Run npm ci in this repository, then retry.',
  DNS: 'The database hostname could not be resolved. Check network/DNS and the project Connect URI privately.',
  CONNECTIVITY: 'The database could not be reached. Check connectivity; use the project Session pooler on port 5432 if direct IPv6 is unavailable.',
  TLS: 'TLS verification failed. Check the approved CA certificate and hostname; do not disable verification.',
  AUTH: 'PostgreSQL rejected authentication. Check the existing password and Connect username privately; do not reset credentials automatically.',
  PERMISSION: 'The database role lacks permission for this operation. No later step ran.',
  BACKUP_DIRECTORY: 'Choose an existing real directory with mode 0700 outside this repository and temporary folders.',
  BACKUP_TOOL: 'A PostgreSQL backup tool failed or is missing. Check PostgreSQL 17+ pg_dump/pg_restore and PG_BIN_DIR privately.',
  BASELINE: 'The hosted schema differs from the reviewed baseline. Stop and reconcile; do not bypass the baseline guard.',
  UNKNOWN: 'This stage failed for an unclassified reason. Share only the stage/code below; never the credential or raw error.',
};
class HandoffError extends Error { constructor(code) { super(code); this.safeCode = code; } }
const fail = code => { throw new HandoffError(code); };

// Local format/target/CA validation. No database drivers or network calls.
export function validateTarget(value, options = {}) {
  if (!value?.trim()) fail('INPUT_EMPTY');
  const input = value.trim();
  if (/^(?:export\s+)?DATABASE_URL\s*=|^["'`]/.test(input)) fail('INPUT_WRAPPER');
  if (!/^postgres(?:ql)?:\/\//.test(input)) fail('INPUT_SCHEME');
  if (/[\u0000-\u0020\u007f]/.test(input)) fail('INPUT_STRUCTURE');
  let url, username, password;
  try { url = new URL(input); } catch { fail('INPUT_STRUCTURE'); }
  if (url.hash) fail('INPUT_STRUCTURE');
  try { username = decodeURIComponent(url.username); password = decodeURIComponent(url.password); }
  catch { fail('INPUT_ENCODING'); }
  const direct = url.hostname === `db.${project}.supabase.co` && username === 'postgres';
  const pooled = url.hostname.endsWith('.pooler.supabase.com') && username === `postgres.${project}`;
  if (!direct && !pooled) fail('INPUT_PROJECT');
  if (url.port && url.port !== '5432') fail('INPUT_PORT');
  if (url.pathname !== '/postgres') fail('INPUT_DATABASE');
  if (!password || /\[?YOUR[-_]PASSWORD\]?/i.test(password)) fail('INPUT_PASSWORD');
  try { return connection(input, options); }
  catch (error) {
    if (error instanceof URIError) fail('INPUT_ENCODING');
    if (error.message === 'Unsupported connection URL option.') fail('INPUT_OPTIONS');
    if (error.message === 'Supply one absolute CA certificate path consistently.') fail('INPUT_CA');
    if (['Approved database CA could not be loaded.', 'Bundled database CA integrity check failed.'].includes(error.message)) fail('CA_BUNDLE');
    fail('INPUT_STRUCTURE');
  }
}

// Only fixed, allowlisted text is emitted. Never forward messages, stacks, URLs,
// paths, error causes, query details, or driver-supplied identity strings.
export function safeDiagnostic(error, stage) {
  let code = error instanceof HandoffError ? error.safeCode : undefined;
  if (!code) {
    if (error?.message === 'Reviewed migration files are missing, changed, or unexpected. Stop for code review.') code = 'MIGRATION_FILES';
    else if (['Approved database CA could not be loaded.', 'Bundled database CA integrity check failed.'].includes(error?.message)) code = 'CA_BUNDLE';
    else if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(error?.code)) code = 'DEPENDENCIES';
    else if (['ENOTFOUND', 'EAI_AGAIN'].includes(error?.code)) code = 'DNS';
    else if (['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNRESET'].includes(error?.code) || error?.message === 'timeout expired') code = 'CONNECTIVITY';
    else if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(error?.code)) code = 'TLS';
    else if (['28P01', '28000'].includes(error?.code)) code = 'AUTH';
    else if (error?.code === '42501') code = 'PERMISSION';
    else if (error?.message === 'Database differs from the verified base migration; STOP and reconcile before baselining.') code = 'BASELINE';
    else if (/^(pg_dump|pg_restore) failed;/.test(error?.message || '') || error?.message === 'pg_dump must be the same major version as the server or newer.') code = 'BACKUP_TOOL';
    else code = 'UNKNOWN';
  }
  const label = ['startup', 'input', 'dependencies', 'connection/baseline', 'backup-directory', 'backup'].includes(stage) ? stage : 'startup';
  return `[${label}/${code}] ${messages[code]} No schema migration or enrollment was performed.`;
}

export async function validateBackupDirectory(path) {
  try {
    if (!path || !isAbsolute(path)) fail('BACKUP_DIRECTORY');
    const stat = await lstat(path);
    const directory = await realpath(path);
    const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
    const forbidden = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', root];
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 ||
        (process.getuid && stat.uid !== process.getuid()) ||
        forbidden.some(p => directory === p || directory.startsWith(p + '/'))) fail('BACKUP_DIRECTORY');
    for (let parent = directory; ; parent = dirname(parent)) {
      try { await lstat(join(parent, '.git')); fail('BACKUP_DIRECTORY'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (dirname(parent) === parent) break;
    }
    return directory;
  } catch { fail('BACKUP_DIRECTORY'); }
}

export async function runHandoff(action, env = process.env, load = () => import('./database.mjs')) {
  let stage = 'input';
  try {
    if (!['validate-target', 'baseline-check', 'backup'].includes(action)) fail('ACTION');
    const target = validateTarget(env.DATABASE_URL, { caCert: env.DATABASE_CA_CERT });
    if (action === 'validate-target') return { ok: true, message: '[input/OK] URL format accepted. No network connection or password verification has occurred.' };
    if (action === 'backup') {
      stage = 'backup-directory';
      await validateBackupDirectory(env.BACKUP_DIR);
    }
    stage = 'dependencies';
    const db = await load();
    stage = action === 'backup' ? 'backup' : 'connection/baseline';
    // Explicit methods only: this helper cannot dispatch baseline/deploy/enrollment.
    if (action === 'backup') await db.backup(target); else await db.baselineCheck(target);
    return { ok: true, message: `[${stage}/OK] Finished. No schema migration or enrollment was performed.` };
  } catch (error) { return { ok: false, message: safeDiagnostic(error, stage) }; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runHandoff(process.argv[2]);
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}
