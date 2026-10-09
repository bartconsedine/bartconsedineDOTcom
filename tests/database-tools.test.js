import test from 'node:test';
import assert from 'node:assert/strict';
import { connection, restoreLocal } from '../scripts/database.mjs';
import { bundledCaPath, nodePgSsl } from '../scripts/database-connection.mjs';
import { X509Certificate } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('database tools restrict project target and keep Prisma history private', () => {
  assert.throws(() => connection(), /Supply DATABASE_URL/);
  assert.throws(() => connection('postgresql://postgres@127.0.0.1/postgres?host=example.com'), /Unsupported/);
  assert.throws(() => connection('postgresql://postgres@127.0.0.1/postgres%3A%2F%2Fevil'), /simple database/);
  assert.throws(() => connection('https://example.com'), /PostgreSQL/);
  assert.throws(() => connection('postgresql://postgres@example.com/postgres'), /not this site/);
  assert.throws(() => connection('postgresql://postgres.vgsmfbupgydafvotkold@aws-0-us-east-2.pooler.supabase.com:6543/postgres'), /transaction pooling/);
  for (const value of [
    'postgresql://postgres@db.vgsmfbupgydafvotkold.supabase.co/postgres',
    'postgresql://postgres.vgsmfbupgydafvotkold@aws-0-us-east-2.pooler.supabase.com:5432/postgres',
    'postgresql://postgres@127.0.0.1:55472/test',
  ]) assert.equal(connection(value).url.searchParams.get('schema'), 'private');
});

test('restore refuses hosted destinations and non-test local databases before reading backups', async () => {
  await assert.rejects(restoreLocal('/missing.dump', connection('postgresql://postgres@db.vgsmfbupgydafvotkold.supabase.co/postgres')), /restricted/);
  await assert.rejects(restoreLocal('/missing.dump', connection('postgresql://postgres@127.0.0.1/postgres')), /restricted/);
  await assert.rejects(restoreLocal('relative.dump', connection('postgresql://postgres@127.0.0.1/restore_test_fixture')), /absolute path/);
});

test('hosted Prisma URLs cannot downgrade encryption or certificate verification', async () => {
  const { pgEnvironment, prismaEnvironment } = await import('../scripts/database-connection.mjs');
  const base = 'postgresql://postgres@db.vgsmfbupgydafvotkold.supabase.co/postgres';
  for (const input of ['', '?sslmode=disable', '?sslmode=prefer', '?sslmode=verify-full', '?sslmode=require&sslaccept=accept_invalid_certs', '?sslmode=require&sslmode=disable&sslaccept=strict&sslaccept=accept_invalid_certs']) {
    const c = connection(base + input, { caCert: undefined });
    const url = new URL(prismaEnvironment(c, {}).DATABASE_URL);
    assert.deepEqual(url.searchParams.getAll('sslmode'), ['require']);
    assert.deepEqual(url.searchParams.getAll('sslaccept'), ['strict']);
    assert.equal(pgEnvironment(c, {}).PGSSLMODE, 'verify-full');
    assert.equal(pgEnvironment(c, {}).PGSSLROOTCERT, bundledCaPath);
    assert.equal(url.searchParams.get('sslcert'), bundledCaPath);
  }
});

test('the official bundled CA reaches node-postgres with strict verification and leaves loopback unchanged', () => {
  const c = connection('postgresql://postgres@db.vgsmfbupgydafvotkold.supabase.co/postgres', { caCert: null });
  const ssl = nodePgSsl(c);
  assert.equal(ssl.rejectUnauthorized, true);
  const ca = new X509Certificate(ssl.ca);
  assert.equal(ca.ca, true);
  assert.equal(ca.fingerprint256, '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
  assert.equal(ca.verify(ca.publicKey), true);
  const local = connection('postgresql://tester@127.0.0.1/restore_test_fixture');
  assert.equal(local.caCert, undefined);
  assert.equal(local.url.searchParams.has('sslcert'), false);
  assert.equal(nodePgSsl(local), false);
});

test('missing or modified bundled trust fails locally instead of falling back to weaker TLS', async () => {
  const root = await mkdtemp(join(tmpdir(), 'database-ca-policy-'));
  try {
    await mkdir(join(root, 'scripts')); await mkdir(join(root, 'certs'));
    const modulePath = join(root, 'scripts/database-connection.mjs');
    await writeFile(modulePath, await readFile(new URL('../scripts/database-connection.mjs', import.meta.url)));
    const policy = await import(pathToFileURL(modulePath).href);
    const url = 'postgresql://postgres@db.vgsmfbupgydafvotkold.supabase.co/postgres';
    assert.throws(() => policy.connection(url, { caCert: null }), /CA could not be loaded/);
    await writeFile(policy.bundledCaPath, (await readFile(bundledCaPath, 'utf8')) + '\n');
    assert.throws(() => policy.connection(url, { caCert: null }), /CA integrity check failed/);
    await writeFile(policy.bundledCaPath, await readFile(bundledCaPath));
    assert.equal(policy.connection(url, { caCert: null }).caCert, policy.bundledCaPath);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('explicit CA trust is consistent across clients and cannot use ambiguous relative paths', async () => {
  const { pgEnvironment, prismaEnvironment } = await import('../scripts/database-connection.mjs');
  const base = 'postgresql://postgres@db.vgsmfbupgydafvotkold.supabase.co/postgres';
  const c = connection(base, { caCert: '/protected/site-ca.pem' });
  assert.equal(c.caCert, '/protected/site-ca.pem');
  assert.equal(new URL(prismaEnvironment(c, {}).DATABASE_URL).searchParams.get('sslcert'), c.caCert);
  assert.equal(pgEnvironment(c, {}).PGSSLROOTCERT, c.caCert);
  assert.throws(() => connection(base, { caCert: 'relative.pem' }), /absolute CA/);
  assert.throws(() => connection(base + '?sslrootcert=/different.pem', { caCert: '/protected/site-ca.pem' }), /consistently/);
  assert.equal(connection(c.url.href, { caCert: undefined }).url.href, c.url.href, 'normalization is idempotent');
});

test('libpq and Prisma subprocesses cannot inherit target, service, credential or TLS overrides', async () => {
  const { pgEnvironment, prismaEnvironment, subprocessEnvironment } = await import('../scripts/database-connection.mjs');
  const hostile = {
    PATH: '/safe/bin', HOME: '/safe/home', PGHOST: 'evil.example', PGHOSTADDR: '192.0.2.1', PGPORT: '1',
    PGDATABASE: 'production', PGUSER: 'wrong', PGPASSWORD: 'wrong', PGPASSFILE: '/wrong/pass',
    PGSERVICE: 'production', PGSERVICEFILE: '/wrong/service', PGSYSCONFDIR: '/wrong',
    PGSSLMODE: 'disable', PGREQUIRESSL: '0', PGSSLROOTCERT: '/wrong/ca', PGSSLCERT: '/wrong/cert', PGSSLKEY: '/wrong/key',
    PGSSLNEGOTIATION: 'direct', PGOPTIONS: '-c role=postgres', PGTARGETSESSIONATTRS: 'any',
    PGGSSENCMODE: 'require', PGKRBSRVNAME: 'evil', PGFUTUREROUTINGOPTION: 'evil',
    DATABASE_URL: 'wrong', DIRECT_URL: 'wrong', RESTORE_DATABASE_URL: 'wrong',
    NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_EXTRA_CA_CERTS: '/wrong/ca', NODE_OPTIONS: '--require=/wrong.js',
    SSL_CERT_FILE: '/wrong/ca', SSL_CERT_DIR: '/wrong', OPENSSL_CONF: '/wrong',
    PRISMA_SCHEMA_ENGINE_BINARY: '/wrong/engine', HTTPS_PROXY: 'http://wrong',
  };
  assert.deepEqual(subprocessEnvironment(hostile), { PATH: '/safe/bin', HOME: '/safe/home' });
  const c = connection('postgresql://tester:test@localhost:55472/restore_test_fixture');
  assert.equal(c.host, '127.0.0.1', 'localhost is pinned to a loopback address');
  const libpq = pgEnvironment(c, hostile);
  assert.deepEqual(Object.keys(libpq).filter(key => key.startsWith('PG')).sort(), [
    'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGGSSENCMODE', 'PGCONNECT_TIMEOUT',
  ].sort());
  assert.equal(libpq.PGHOST, '127.0.0.1'); assert.equal(libpq.PGPORT, '55472');
  assert.equal(libpq.PGDATABASE, 'restore_test_fixture'); assert.equal(libpq.PGUSER, 'tester');
  assert.equal(libpq.PGPASSWORD, 'test'); assert.equal(libpq.PGSSLMODE, 'disable');
  const prisma = prismaEnvironment(c, hostile);
  assert.deepEqual(Object.keys(prisma).sort(), ['PATH', 'HOME', 'DATABASE_URL', 'CHECKPOINT_DISABLE', 'PRISMA_HIDE_UPDATE_MESSAGE'].sort());
  assert.equal(new URL(prisma.DATABASE_URL).hostname, '127.0.0.1');
});

test('direct Prisma CLI configuration uses the shared verified connection policy', async () => {
  const previous = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'postgresql://postgres@db.vgsmfbupgydafvotkold.supabase.co/postgres?sslmode=disable&sslaccept=accept_invalid_certs';
    const { default: config } = await import('../prisma.config.ts');
    const url = new URL(config.datasource.url);
    assert.equal(url.searchParams.get('sslmode'), 'require');
    assert.equal(url.searchParams.get('sslaccept'), 'strict');
    assert.equal(url.searchParams.get('schema'), 'private');
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
  }
});
