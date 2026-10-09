import test from 'node:test';
import assert from 'node:assert/strict';
import { connection, restoreLocal } from '../scripts/database.mjs';

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
    assert.equal(pgEnvironment(c, {}).PGSSLROOTCERT, 'system');
  }
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
