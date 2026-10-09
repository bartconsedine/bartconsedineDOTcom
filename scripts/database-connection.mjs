import { isAbsolute } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const project = 'vgsmfbupgydafvotkold';
export class DatabaseToolError extends Error {}
export const bundledCaPath = fileURLToPath(new URL('../certs/supabase-prod-ca-2021.crt', import.meta.url));
const bundledCaSha256 = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';

function readCa(path) {
  let pem;
  try { pem = readFileSync(path, 'utf8'); }
  catch { throw new DatabaseToolError('Approved database CA could not be loaded.'); }
  if (path === bundledCaPath && createHash('sha256').update(pem).digest('hex') !== bundledCaSha256) {
    throw new DatabaseToolError('Bundled database CA integrity check failed.');
  }
  return pem;
}

// node-postgres needs PEM contents; libpq and Prisma need absolute file paths.
export function nodePgSsl(c) {
  return c.local ? false : { rejectUnauthorized: true, ca: readCa(c.caCert) };
}

// Shared by the tools AND prisma.config.ts, including direct Prisma CLI use.
export function connection(value, { caCert = process.env.DATABASE_CA_CERT } = {}) {
  if (!value) throw new DatabaseToolError('Supply DATABASE_URL securely in the process environment.');
  let url;
  try { url = new URL(value); } catch { throw new DatabaseToolError('Invalid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new DatabaseToolError('Expected a PostgreSQL URL.');
  let host = url.hostname.replace(/^\[|\]$/g, '');
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (host === 'localhost') { host = '127.0.0.1'; url.hostname = host; }
  const user = decodeURIComponent(url.username);
  if (!local && !(host === `db.${project}.supabase.co` || (host.endsWith('.pooler.supabase.com') && user === `postgres.${project}`))) throw new DatabaseToolError('Database target is not this site project.');
  if (!local && url.port && url.port !== '5432') throw new DatabaseToolError('Use direct connection or session pooler port 5432, not transaction pooling.');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database) || !user) throw new DatabaseToolError('Use a simple database name and provide a user.');
  for (const key of url.searchParams.keys()) {
    if (!['sslmode', 'sslaccept', 'sslcert', 'sslrootcert', 'schema', 'connect_timeout', 'pool_timeout', 'connection_limit'].includes(key)) throw new DatabaseToolError('Unsupported connection URL option.');
  }
  const certificates = [...new Set([caCert, ...url.searchParams.getAll('sslrootcert'), ...url.searchParams.getAll('sslcert')].filter(Boolean))];
  if (certificates.length > 1 || certificates.some(path => !isAbsolute(path))) throw new DatabaseToolError('Supply one absolute CA certificate path consistently.');
  caCert = local ? undefined : certificates[0] || bundledCaPath;
  if (caCert === bundledCaPath) readCa(caCert); // Fail closed before any network/authentication.
  url.searchParams.delete('sslrootcert');
  url.searchParams.delete('sslcert');
  if (caCert) url.searchParams.set('sslcert', caCert);
  // Prisma's native connector supports require + strict, not libpq's verify-full.
  // Both encryption AND certificate/hostname verification must be explicit.
  url.searchParams.set('sslmode', local ? 'disable' : 'require');
  url.searchParams.set('sslaccept', 'strict');
  url.searchParams.set('schema', 'private');
  url.searchParams.set('connect_timeout', '15');
  url.searchParams.sort();
  return { url, host, local, database, user, password: decodeURIComponent(url.password), port: url.port || '5432', caCert };
}

// An allowlist prevents PGHOSTADDR/PGSERVICE/PGOPTIONS and future libpq options,
// as well as TLS/engine overrides, from redirecting or weakening a subprocess.
export function subprocessEnvironment(inherited = process.env) {
  const allowed = ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'LANG', 'LC_ALL'];
  return Object.fromEntries(allowed.filter(key => inherited[key] !== undefined).map(key => [key, inherited[key]]));
}
export function pgEnvironment(c, inherited = process.env) {
  return { ...subprocessEnvironment(inherited), PGHOST: c.host, PGPORT: c.port,
    PGDATABASE: c.database, PGUSER: c.user, PGPASSWORD: c.password,
    PGSSLMODE: c.local ? 'disable' : 'verify-full',
    ...(c.local ? {} : { PGSSLROOTCERT: c.caCert || 'system' }),
    PGGSSENCMODE: 'disable', PGCONNECT_TIMEOUT: '15' };
}
export function prismaEnvironment(c, inherited = process.env) {
  return { ...subprocessEnvironment(inherited), DATABASE_URL: c.url.href,
    CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' };
}
