import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseToolError } from './database-connection.mjs';

// Update only in the PR that reviews a new migration. Never auto-regenerate pins
// from the working tree or change an already applied migration to match history.
export const reviewedMigrations = Object.freeze({
  '20261028232412_admin_qr_sessions': 'ab45472b7a5f6c214ef581ea6cf2a4db01c8861d7ec694ebbeb2ba79a61b8e44',
  '20261028223639_morning_tv_pairing': 'cbea67535b9176fd7d63bf615e99cded347e6b807ffc5d8586cf9ef3d8f4f86c',
  '20261027080423_project_board': '24736a36e3486631b644c53eaf25f3b745c29d7db8f0721e8bcffb99e81fdee7',
  '20261027015049_robot_party_dot_oauth': '6a6e328aaa03fddc4685f5497ca80a273c1d45a0f697d68fa81735ce413baeb4',
  '20261027013318_robot_party_member_tokens': '3ce24d7d9d2c2854104e16472204c1d4cd0becbd35135f5e4b7e66e7a2aa7cfc',
  '20261027010424_robot_party_board': 'c428eda948b436352622c89fbf32f78ea19ce2921a3435dc93be2cc742127e7d',
  '20261026235556_app_sharing': '94f3bae66c6e05e215d92a502fcfd5f5d9f7f6788371f5af71b6651c38356935',
  '0_private_workspace': 'c9273dddc08696f5f8bbf0b8e762366faa41d4b0ddf84ac25989cc00351852bd',
  '20261009203911_two_admin_membership': '09cecac105386c936a6453454457594ef17c5cddb87f8c2282d73d9489c183a2',
});
// This fixed prefix matches the separately approved Robot Party OAuth rollout.
// No arbitrary target, exclusion list, or out-of-order history is accepted.
export const robotPartyMigrationPlan = Object.freeze([
  '0_private_workspace', '20261009203911_two_admin_membership',
  '20261026235556_app_sharing', '20261027010424_robot_party_board',
  '20261027013318_robot_party_member_tokens', '20261027015049_robot_party_dot_oauth',
]);
export function migrationPlan(profile = 'full') {
  if (profile === 'full') return Object.keys(reviewedMigrations).sort();
  if (profile === 'robot-party') return [...robotPartyMigrationPlan];
  throw new DatabaseToolError('Unknown reviewed migration plan.');
}
export function matchesRobotPartyHistory(rows, complete = false) {
  const expected = robotPartyMigrationPlan.slice(0, complete ? undefined : -1);
  return rows.length === expected.length && rows.every((row, index) =>
    row.migration_name === expected[index] && row.checksum === reviewedMigrations[row.migration_name] && row.finished_at && !row.rolled_back_at);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'prisma/migrations');
const fail = () => { throw new DatabaseToolError('Reviewed migration files are missing, changed, or unexpected. Stop for code review.'); };

export async function verifyReviewedMigrations(directory = source) {
  try {
    const parent = await lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink()) fail();
    const entries = await readdir(directory, { withFileTypes: true });
    const expected = ['migration_lock.toml', ...Object.keys(reviewedMigrations)].sort();
    if (JSON.stringify(entries.map(e => e.name).sort()) !== JSON.stringify(expected)) fail();
    const files = {};
    for (const entry of entries) {
      if (entry.name === 'migration_lock.toml') {
        if (!entry.isFile()) fail();
        const lock = await readFile(join(directory, entry.name), 'utf8');
        if (lock !== 'provider = "postgresql"\n') fail();
        files[entry.name] = lock;
        continue;
      }
      if (!entry.isDirectory()) fail();
      const folder = join(directory, entry.name);
      const children = await readdir(folder, { withFileTypes: true });
      if (children.length !== 1 || children[0].name !== 'migration.sql' || !children[0].isFile()) fail();
      const sql = await readFile(join(folder, 'migration.sql'));
      if (createHash('sha256').update(sql).digest('hex') !== reviewedMigrations[entry.name]) fail();
      files[`${entry.name}/migration.sql`] = sql;
    }
    return files;
  } catch { fail(); }
}

// Prisma executes a private snapshot of the verified bytes, never a working-tree
// directory that another editor could change while a backup is running.
export async function withReviewedMigrationSnapshot(run, directory = source, profile = 'full') {
  const selected = migrationPlan(profile);
  const inventory = await verifyReviewedMigrations(directory);
  const files = Object.fromEntries(Object.entries(inventory).filter(([name]) => name === 'migration_lock.toml' || selected.includes(name.split('/')[0])));
  const staging = await mkdtemp(join(tmpdir(), 'bart-reviewed-migrations-'));
  try {
    const migrations = join(staging, 'migrations');
    await mkdir(migrations, { mode: 0o700 });
    for (const name of selected) await mkdir(join(migrations, name), { mode: 0o700 });
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(migrations, name), bytes, { mode: 0o400, flag: 'wx' });
    const config = join(staging, 'prisma.config.ts');
    // Only file paths are persisted. The normalized connection remains in the
    // child process environment; no credential is written into this config.
    await writeFile(config, `export default { schema: ${JSON.stringify(join(root, 'prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.DATABASE_URL } };\n`, { mode: 0o400, flag: 'wx' });
    return await run(config, migrations);
  } finally { await rm(staging, { recursive: true, force: true }); }
}
