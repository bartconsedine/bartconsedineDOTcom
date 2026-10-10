import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, appendFile, readFile, rm, symlink, stat, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reviewedMigrations, verifyReviewedMigrations, withReviewedMigrationSnapshot } from '../scripts/reviewed-migrations.mjs';
const fixture = async fn => {
  const root = await mkdtemp(join(tmpdir(), 'reviewed-migration-test-'));
  const source = join(root, 'migrations');
  try { await cp(new URL('../prisma/migrations', import.meta.url), source, { recursive: true }); await fn(source); }
  finally { await rm(root, { recursive: true, force: true }); }
};

test('only exact reviewed SQL and PostgreSQL lock are accepted', async () => {
  const files = await verifyReviewedMigrations();
  assert.deepEqual(Object.keys(files).sort(), ['migration_lock.toml', ...Object.keys(reviewedMigrations).map(name => `${name}/migration.sql`)].sort());
  for (const mutate of [
    async dir => { await mkdir(join(dir,'20990101000000_extra')); await writeFile(join(dir,'20990101000000_extra/migration.sql'),'select 1;'); },
    async dir => appendFile(join(dir,'20261009203911_two_admin_membership/migration.sql'), '\nselect 1;'),
    async dir => appendFile(join(dir,'0_private_workspace/migration.sql'), '\n-- edited base'),
    async dir => rm(join(dir,'0_private_workspace'), { recursive: true }),
    async dir => writeFile(join(dir,'migration_lock.toml'), 'provider = "mysql"\n'),
    async dir => { const path = join(dir,'0_private_workspace/migration.sql'); await rm(path); await symlink('/missing.sql',path); },
  ]) await fixture(async dir => {
    await mutate(dir); let ran = false;
    await assert.rejects(withReviewedMigrationSnapshot(async () => { ran = true; }, dir), /Reviewed migration files/);
    assert.equal(ran, false, 'invalid SQL must not reach a Prisma invocation');
  });
});

test('Prisma snapshot contains only verified bytes despite subsequent checkout edits and is cleaned up', async () => fixture(async dir => {
  let staging;
  await withReviewedMigrationSnapshot(async (config, migrations) => {
    staging = dirname(config);
    assert.equal((await stat(staging)).mode & 0o777, 0o700);
    const original = await readFile(join(migrations,'20261009203911_two_admin_membership/migration.sql'));
    await appendFile(join(dir,'20261009203911_two_admin_membership/migration.sql'), '\nselect 1;');
    assert.deepEqual(await readFile(join(migrations,'20261009203911_two_admin_membership/migration.sql')), original);
    const settings = await readFile(config, 'utf8');
    assert.match(settings, /process.env.DATABASE_URL/);
    assert.ok(!settings.includes('postgresql://'));
  }, dir);
  await assert.rejects(stat(staging), { code: 'ENOENT' });
}));

test('actual adoption and deployment reject extra or edited SQL before opening a database connection', async () => {
  for (const extra of [true, false]) await fixture(async dir => {
    const root = dirname(dir);
    await mkdir(join(root, 'scripts')); await mkdir(join(root, 'prisma'));
    const migrations = join(root, 'prisma/migrations');
    await rename(dir, migrations);
    for (const name of ['database.mjs', 'database-connection.mjs', 'reviewed-migrations.mjs']) {
      await cp(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
    }
    await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir');
    if (extra) {
      await mkdir(join(migrations, '20990101000000_extra'));
      await writeFile(join(migrations, '20990101000000_extra/migration.sql'), 'create table private.unapproved(id integer);');
    } else await appendFile(join(migrations, '20261009203911_two_admin_membership/migration.sql'), '\ncreate table private.unapproved(id integer);');
    const db = await import(pathToFileURL(join(root, 'scripts/database.mjs')).href);
    const c = db.connection('postgresql://synthetic@127.0.0.1:9/postgres');
    for (const operation of [db.adoptBaseline, db.deployMigrations]) {
      await assert.rejects(operation(c), /Reviewed migration files/, 'must reject SQL, not attempt a database connection');
    }
  });
});

test('snapshot files are removed after a failed Prisma invocation', async () => {
  let staging;
  await assert.rejects(withReviewedMigrationSnapshot(async config => {
    staging = dirname(config); throw new Error('synthetic failure');
  }), /synthetic failure/);
  await assert.rejects(stat(staging), { code: 'ENOENT' });
});
