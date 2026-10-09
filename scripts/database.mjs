import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { chmod, lstat, readFile, realpath, rename, writeFile, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { connection, DatabaseToolError, project, pgEnvironment, prismaEnvironment, subprocessEnvironment } from './database-connection.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export { connection } from './database-connection.mjs';
function tool(name) { return process.env.PG_BIN_DIR ? join(process.env.PG_BIN_DIR, name) : name; }
function run(command, args, env = subprocessEnvironment()) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  // Do not print driver/CLI errors: they can contain connection details or secrets.
  if (result.status !== 0) throw new DatabaseToolError(`${command.split('/').pop()} failed; no later step was executed. Inspect privately.`);
  return result.stdout;
}
function prisma(args, c) {
  return run(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), ...args], prismaEnvironment(c));
}
async function client(c) {
  const ssl = c.local ? false : { rejectUnauthorized: true, ...(c.caCert ? { ca: await readFile(c.caCert, 'utf8') } : {}) };
  const db = new pg.Client({ host: c.host, port: Number(c.port), user: c.user, database: c.database, password: async () => c.password, ssl, options: '-c search_path=public', replication: 'false', client_encoding: 'UTF8', application_name: 'bart-site-db-tools', connectionTimeoutMillis: 15000 });
  await db.connect(); return db;
}
async function withClient(c, fn) { const db = await client(c); try { return await fn(db); } finally { await db.end(); } }
async function sha256(path) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); }
function authorizeWrite(c) {
  if (!c.local && process.env.CONFIRM_HOSTED_MIGRATION !== project) throw new DatabaseToolError('Coordinate the reviewed hosted write, then set CONFIRM_HOSTED_MIGRATION to the project ref.');
}
async function backupDirectory() {
  const path = process.env.BACKUP_DIR;
  if (!path || !isAbsolute(path)) throw new DatabaseToolError('Set BACKUP_DIR to an existing absolute protected local directory.');
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new DatabaseToolError('BACKUP_DIR must be a real directory with permissions 0700.');
  const actual = await realpath(path);
  if (actual === root || actual.startsWith(`${root}/`)) throw new DatabaseToolError('Keep database backups outside the Git checkout.');
  return actual;
}
export async function backup(c) {
  process.umask(0o077);
  const dir = await backupDirectory();
  const version = run(tool('pg_dump'), ['--version']).match(/(\d+)\./)?.[1];
  const metadata = await withClient(c, async db => ({
    serverVersion: (await db.query('show server_version')).rows[0].server_version,
    roles: (await db.query("select rolname from pg_roles where rolname !~ '^pg_' order by rolname")).rows.map(row => row.rolname),
  }));
  if (Number(version) < Number(metadata.serverVersion.split('.')[0])) throw new DatabaseToolError('pg_dump must be the same major version as the server or newer.');
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.dump`;
  const archive = join(dir, name);
  run(tool('pg_dump'), ['--format=custom', '--file', `${archive}.partial`, '--no-password'], pgEnvironment(c));
  run(tool('pg_restore'), ['--list', `${archive}.partial`]);
  await rename(`${archive}.partial`, archive); await chmod(archive, 0o600);
  const migrations = {};
  for (const entry of (await readdir(join(root, 'prisma/migrations'))).sort()) {
    if (entry === 'migration_lock.toml') continue;
    migrations[entry] = await sha256(join(root, 'prisma/migrations', entry, 'migration.sql'));
  }
  const manifest = { formatVersion: 1, createdAt: new Date().toISOString(), sha256: await sha256(archive),
    sourceProject: c.local ? 'local-test' : project, database: c.database, ...metadata, migrations,
    scope: 'Full logical database; excludes Storage object bytes, cluster configuration and role passwords.' };
  await writeFile(`${archive}.json`, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(`Verified logical backup: ${archive}`); return archive;
}
export async function baselineCheck(c) {
  const expected = JSON.parse(await readFile(join(root, 'prisma/baseline-state.json'), 'utf8'));
  const sql = await readFile(join(root, 'scripts/baseline-state.sql'), 'utf8');
  const actual = await withClient(c, async db => (await db.query(sql)).rows[0].state);
  if (!isDeepStrictEqual(actual, expected)) throw new DatabaseToolError('Database differs from the verified base migration; STOP and reconcile before baselining.');
  console.log('Baseline tables, columns, constraints, RLS, functions and client grants match.');
}
export async function restoreLocal(archive, c) {
  if (!c.local || !/^restore_test_[a-z0-9_]+$/.test(c.database)) throw new DatabaseToolError('Restore is restricted to localhost databases named restore_test_*.');
  if (!archive || !isAbsolute(archive)) throw new DatabaseToolError('Supply the absolute path of a trusted backup archive.');
  const manifest = JSON.parse(await readFile(`${archive}.json`, 'utf8'));
  if (manifest.formatVersion !== 1 || await sha256(archive) !== manifest.sha256) throw new DatabaseToolError('Backup checksum/manifest mismatch.');
  await withClient(c, async db => {
    const { rows } = await db.query("select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema' and c.relkind in ('r','v','m','S','f')");
    if (rows[0].count !== 0) throw new DatabaseToolError('Restore target is not empty. No objects were changed.');
    // Roles are cluster-global; create only inert placeholders in an isolated test cluster.
    // Never reproduce source role passwords or privileged attributes.
    for (const role of manifest.roles) {
      if (!(await db.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) {
        await db.query(`create role "${role.replaceAll('"', '""')}" nologin`);
      }
    }
  });
  run(tool('pg_restore'), ['--exit-on-error', '--single-transaction', '--no-owner', '--no-password', '--dbname', c.database, archive], pgEnvironment(c));
  console.log('Restored into isolated local test database. Run application/RLS checks; hosted recovery is not certified.');
}
export async function main() {
  const command = process.argv[2];
  const c = connection(command === 'restore-local' ? process.env.RESTORE_DATABASE_URL : process.env.DATABASE_URL);
  if (command === 'backup') return backup(c);
  if (command === 'restore-local') return restoreLocal(process.argv[3], c);
  if (command === 'baseline-check') return baselineCheck(c);
  if (command === 'status') { prisma(['migrate', 'status'], c); console.log('Prisma migration status is current.'); return; }
  if (command === 'baseline') {
    authorizeWrite(c); await baselineCheck(c); await backup(c);
    await withClient(c, async db => {
      if ((await db.query("select to_regclass('private._prisma_migrations') as table_name")).rows[0].table_name &&
          (await db.query('select 1 from private._prisma_migrations limit 1')).rowCount) throw new DatabaseToolError('Prisma history already exists; inspect status instead of re-baselining.');
    });
    prisma(['migrate', 'resolve', '--applied', '0_private_workspace'], c);
    console.log('Recorded only the verified existing base migration. Two-admin migration remains pending.'); return;
  }
  if (command === 'deploy') {
    authorizeWrite(c);
    await withClient(c, async db => {
      const { rows } = await db.query("select migration_name from private._prisma_migrations where finished_at is not null and rolled_back_at is null and migration_name='0_private_workspace'");
      if (rows.length !== 1) throw new DatabaseToolError('Verified baseline must be recorded before deployment.');
    });
    await backup(c); prisma(['migrate', 'deploy'], c); prisma(['migrate', 'status'], c);
    console.log('Reviewed Prisma migrations applied; verify database security before enrollment/release.'); return;
  }
  throw new DatabaseToolError('Use backup, baseline-check, baseline, deploy, status or restore-local.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof DatabaseToolError ? error.message : 'Database operation failed. No later step was executed. Check protected configuration and prerequisites privately.'); process.exitCode = 1; });
}
