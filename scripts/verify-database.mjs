// Requires a dedicated disposable local PostgreSQL cluster. Never uses DATABASE_URL.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, chmod, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { connection, baselineCheck, backup, restoreLocal, migrationState } from './database.mjs';

const c = connection(process.env.TEST_DATABASE_URL);
assert.equal(c.local, true, 'Only a disposable local cluster is permitted');
const admin = new pg.Client({ connectionString: c.url.href });
await admin.connect();
const suffix = randomBytes(6).toString('hex');
const names = [`migration_test_${suffix}`, `fresh_test_${suffix}`, `restore_test_${suffix}`];
const backups = await mkdtemp(join(tmpdir(), 'prisma-recovery-fixture-')); await chmod(backups, 0o700);
const target = name => { const url = new URL(c.url); url.pathname = `/${name}`; return url.href; };
const query = async (name, sql) => { const db = new pg.Client({ connectionString: target(name), options: '-c search_path=public' }); await db.connect(); try { return await db.query(sql); } finally { await db.end(); } };
const run = (args, name) => {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, DATABASE_URL: target(name), BACKUP_DIR: backups } });
  assert.equal(result.status, 0, result.stderr); return result.stdout;
};
try {
  for (const role of ['anon', 'authenticated']) if (!(await admin.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) await admin.query(`create role ${role}`);
  for (const name of names) await admin.query(`create database ${name}`);
  const fixture = await readFile(new URL('../tests/fixtures/auth.sql', import.meta.url), 'utf8');
  const baseline = await readFile(new URL('../prisma/migrations/0_private_workspace/migration.sql', import.meta.url), 'utf8');
  for (const name of names.slice(0, 2)) await query(name, fixture);
  await query(names[0], baseline);
  // Poison inherited libpq configuration: real backup/restore must still use the
  // validated loopback target and ignore service/TLS/role overrides.
  Object.assign(process.env, { PGHOSTADDR: '192.0.2.1', PGSERVICE: 'missing_service', PGSERVICEFILE: '/nonexistent/service', PGSSLMODE: 'verify-full', PGSSLROOTCERT: '/nonexistent/ca', PGOPTIONS: '-c search_path=untrusted' });
  await baselineCheck(connection(target(names[0])));
  await query(names[0], 'alter table public.app_data disable row level security');
  await assert.rejects(baselineCheck(connection(target(names[0]))), /differs/);
  await query(names[0], 'alter table public.app_data enable row level security');
  assert.equal(await migrationState(connection(target(names[0]))), 'unadopted');
  const blocked = action => spawnSync(process.execPath, ['scripts/database.mjs', action], {
    encoding: 'utf8', env: { ...process.env, DATABASE_URL: target(names[0]), BACKUP_DIR: join(backups, 'does-not-exist') },
  });
  assert.notEqual(blocked('baseline').status, 0, 'missing backup directory must block baseline adoption');
  assert.equal(await migrationState(connection(target(names[0]))), 'unadopted', 'backup failure must not record the base');
  console.log(run(['scripts/database.mjs', 'baseline'], names[0]).trim());
  let history = (await query(names[0], 'select migration_name from private._prisma_migrations')).rows;
  assert.deepEqual(history.map(r => r.migration_name), ['0_private_workspace']);
  assert.equal(await migrationState(connection(target(names[0]))), 'baseline');
  assert.notEqual(blocked('deploy').status, 0, 'missing backup directory must block deployment');
  assert.equal(await migrationState(connection(target(names[0]))), 'baseline');
  assert.equal((await query(names[0], "select to_regclass('private.site_admin') as name")).rows[0].name, null);
  console.log(run(['scripts/database.mjs', 'deploy'], names[0]).trim());
  assert.equal(await migrationState(connection(target(names[0]))), 'complete');
  history = (await query(names[0], 'select migration_name from private._prisma_migrations where finished_at is not null order by migration_name')).rows;
  assert.equal(history.length, 2);
  assert.equal((await query(names[0], "select relrowsecurity from pg_class where oid='private._prisma_migrations'::regclass")).rows[0].relrowsecurity, true);
  await assert.rejects(query(names[0], 'set role authenticated; select * from private._prisma_migrations'), /permission denied/);
  run(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], names[1]);
  run(['node_modules/prisma/build/index.js', 'migrate', 'status'], names[1]);
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const seed = `insert into auth.users values ('${ids[0]}','bartconsedine@gmail.com',now(),false),('${ids[1]}','mjshah8@gmail.com',now(),false);
    insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users;
    insert into private.site_admin(user_id,email) select id,email from auth.users;
    insert into public.app_data(owner_id,app_slug,key,value) values ('${ids[0]}','restore-test','note','{"saved":"bart"}'),('${ids[1]}','restore-test','note','{"saved":"wife"}');`;
  await query(names[0], seed);
  process.env.BACKUP_DIR = backups;
  const archive = await backup(connection(target(names[0])));
  // Prove corrupt backups and occupied destinations cannot restore.
  const manifest = await readFile(`${archive}.json`, 'utf8');
  await writeFile(`${archive}.json`, manifest.replace(/"sha256": "[a-f0-9]+"/, '"sha256": "invalid"'));
  await assert.rejects(restoreLocal(archive, connection(target(names[2]))), /checksum/);
  await writeFile(`${archive}.json`, manifest);
  await query(names[2], 'create table occupied(id int)');
  await assert.rejects(restoreLocal(archive, connection(target(names[2]))), /not empty/);
  await query(names[2], 'drop table occupied');
  await restoreLocal(archive, connection(target(names[2])));
  assert.equal((await query(names[2], 'select * from private._prisma_migrations')).rowCount, 2);
  for (const [index, id] of ids.entries()) {
    const restored = await query(names[2], `set role authenticated; select set_config('request.jwt.claim.sub','${id}',false); select public.is_site_admin() allowed; select value from public.app_data;`);
    assert.equal(restored[2].rows[0].allowed, true);
    assert.deepEqual(restored[3].rows, [{ value: { saved: index === 0 ? 'bart' : 'wife' } }]);
    await assert.rejects(query(names[2], 'set role authenticated; select * from private.site_admin'), /permission denied/);
  }
  const denied = await query(names[2], "set role authenticated; select set_config('request.jwt.claim.sub','',false); select * from public.app_data;");
  assert.equal(denied[2].rowCount, 0);
  console.log('PASS: Prisma baseline + fresh deploy + incremental deploy + logical backup + isolated restore + restored RLS/grants/data.');
  console.log(`Disposable fixture backups retained at ${backups}`);
} finally {
  for (const name of names) await admin.query(`drop database if exists ${name} with (force)`);
  await admin.end();
}
