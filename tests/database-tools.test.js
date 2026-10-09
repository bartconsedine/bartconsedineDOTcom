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
