import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseToolError } from './database-connection.mjs';

// Update only in the PR that reviews a new migration. Never auto-regenerate pins
// from the working tree or change an already applied migration to match history.
export const reviewedMigrations = Object.freeze({
  '0_private_workspace': 'c9273dddc08696f5f8bbf0b8e762366faa41d4b0ddf84ac25989cc00351852bd',
  '20261009203911_two_admin_membership': '09cecac105386c936a6453454457594ef17c5cddb87f8c2282d73d9489c183a2',
});
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
export async function withReviewedMigrationSnapshot(run, directory = source) {
  const files = await verifyReviewedMigrations(directory);
  const staging = await mkdtemp(join(tmpdir(), 'bart-reviewed-migrations-'));
  try {
    const migrations = join(staging, 'migrations');
    await mkdir(migrations, { mode: 0o700 });
    for (const name of Object.keys(reviewedMigrations)) await mkdir(join(migrations, name), { mode: 0o700 });
    for (const [name, bytes] of Object.entries(files)) await writeFile(join(migrations, name), bytes, { mode: 0o400, flag: 'wx' });
    const config = join(staging, 'prisma.config.ts');
    // Only file paths are persisted. The normalized connection remains in the
    // child process environment; no credential is written into this config.
    await writeFile(config, `export default { schema: ${JSON.stringify(join(root, 'prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.DATABASE_URL } };\n`, { mode: 0o400, flag: 'wx' });
    return await run(config, migrations);
  } finally { await rm(staging, { recursive: true, force: true }); }
}
