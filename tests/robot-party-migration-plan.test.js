import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, appendFile } from 'node:fs/promises';
import { reviewedMigrations, robotPartyMigrationPlan, migrationPlan, matchesRobotPartyHistory, withReviewedMigrationSnapshot } from '../scripts/reviewed-migrations.mjs';
const rows = complete => robotPartyMigrationPlan.slice(0, complete ? undefined : -1).map(migration_name => ({ migration_name, checksum: reviewedMigrations[migration_name], finished_at: new Date(0), rolled_back_at: null }));
test('Robot Party activation requires the exact completed predecessor and resulting prefix', () => {
  assert.equal(matchesRobotPartyHistory(rows(false)), true);
  assert.equal(matchesRobotPartyHistory(rows(true), true), true);
  assert.equal(matchesRobotPartyHistory(rows(true)), false);
  assert.equal(matchesRobotPartyHistory(rows(false), true), false);
  for (const mutate of [r => r.slice(1), r => r.reverse(), r => [...r, r[0]], r => r.map((v,i) => i ? v : {...v, checksum:'wrong'}), r => r.map((v,i) => i ? v : {...v, finished_at:null}), r => r.map((v,i) => i ? v : {...v, rolled_back_at:new Date()})]) assert.equal(matchesRobotPartyHistory(mutate(rows(false))), false);
  assert.throws(() => migrationPlan('arbitrary-skip'));
});
test('scoped Prisma snapshot excludes newer migrations and retains the complete pinned inventory guard', async () => {
  await withReviewedMigrationSnapshot(async (_config, directory) => {
    assert.deepEqual((await readdir(directory)).sort(), ['migration_lock.toml', ...robotPartyMigrationPlan].sort());
    assert.ok(!(await readdir(directory)).includes('20261027080423_project_board'));
  }, undefined, 'robot-party');
  const { mkdtemp, cp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'robot-prefix-test-'));
  try {
    await cp('prisma/migrations', directory, {recursive:true});
    await appendFile(join(directory, '20261027080423_project_board/migration.sql'), '\n-- edited excluded migration');
    await assert.rejects(withReviewedMigrationSnapshot(() => assert.fail('must not run'), directory, 'robot-party'), /Reviewed migration files/);
  } finally { await rm(directory, {recursive:true,force:true}); }
});
