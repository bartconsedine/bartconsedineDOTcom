// Run only against a dedicated disposable loopback PostgreSQL server with TLS.
// TEST_DATABASE_URL and TEST_DATABASE_CA must contain synthetic fixture settings.
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { connection, prismaEnvironment } from './database-connection.mjs';
import { adoptBaseline, deployMigrations, migrationState, prismaConnectionCheck } from './database.mjs';
import { safeDiagnostic } from './private-database-check.mjs';

const c = connection(process.env.TEST_DATABASE_URL);
assert.equal(c.local, true, 'Only a dedicated loopback fixture is permitted');
const ca = process.env.TEST_DATABASE_CA;
assert.ok(ca && isAbsolute(ca), 'Supply the synthetic CA absolute path');
await readFile(ca);
const admin = new pg.Client({ connectionString: c.url.href });
await admin.connect();
const name = `prisma_tls_test_${randomBytes(6).toString('hex')}`;
let db;
try {
  await admin.query(`create database ${name}`);
  for (const role of ['anon', 'authenticated']) if (!(await admin.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) await admin.query(`create role ${role}`);
  const url = new URL(c.url); url.pathname = `/${name}`;
  const target = connection(url.href);
  db = new pg.Client({ connectionString: target.url.href }); await db.connect();
  await db.query(await readFile(new URL('../tests/fixtures/auth.sql', import.meta.url), 'utf8'));
  await db.query(await readFile(new URL('../prisma/migrations/0_private_workspace/migration.sql', import.meta.url), 'utf8'));
  // Only the synthetic fixture overrides the normalized loopback TLS settings.
  // Prisma must use its actual native TLS connector; production normalization is unchanged.
  target.url.searchParams.set('sslmode', 'require');
  target.url.searchParams.set('sslcert', ca);
  assert.equal(new URL(prismaEnvironment(target).DATABASE_URL).searchParams.get('sslaccept'), 'strict');
  process.env.BACKUP_DIR = await mkdtemp(join(tmpdir(), 'prisma-tls-backups-'));
  if (process.env.TEST_EXPECT_TLS_REJECTION === '1') {
    await assert.rejects(adoptBaseline(target), error => {
      assert.match(safeDiagnostic(error, 'startup'), /PRISMA_TLS/);
      return true;
    });
    assert.equal(await migrationState(target), 'unadopted');
    assert.equal((await (await import('node:fs/promises')).readdir(process.env.BACKUP_DIR)).length, 0, 'preflight must fail before backup');
    console.log('TLS rejection classified safely; no backup or migration history was created.');
  } else {
    await prismaConnectionCheck(target);
    const wrong = { ...target, url: new URL(target.url) };
    wrong.url.searchParams.set('sslcert', new URL('../certs/supabase-prod-ca-2021.crt', import.meta.url).pathname);
    await assert.rejects(prismaConnectionCheck(wrong), error => error.diagnosticCode === 'PRISMA_TLS');
    assert.equal(await migrationState(target), 'unadopted', 'read-only preflight must not create history');
    await adoptBaseline(target);
    assert.equal(await migrationState(target), 'baseline');
    await deployMigrations(target);
    assert.equal(await migrationState(target), 'complete');
    console.log('Prisma TLS snapshot preflight, wrong-CA denial, baseline adoption and deployment passed.');
  }
} finally {
  if (db) await db.end();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.end();
}
