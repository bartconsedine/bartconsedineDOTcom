import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { connectionFromPassword, runPasswordHandoff } from './private-database-password.mjs';
import { validateTarget, validateBackupDirectory, safeDiagnostic } from './private-database-check.mjs';
import { project } from './database-connection.mjs';

const states = {
  unadopted: 'No Prisma history is recorded. Verify recovery prerequisites, then adopt the existing baseline.',
  baseline: 'Only the existing baseline is recorded. The reviewed two-admin migration remains pending.',
  complete: 'Both reviewed migrations are recorded complete. Stop here and verify hosted security before separate enrollment.',
  attention: 'Unexpected, failed, or rolled-back migration history. Stop for inspection; do not reset or resolve blindly.',
};
const stopped = (code, message) => ({ ok: false, message: `[migration/${code}] ${message} No later step ran; inspect state before retrying.` });

export async function runMigrationHandoff(action, env = process.env, load = () => import('./database.mjs')) {
  if (!['validate-target', 'state', 'adopt', 'deploy'].includes(action)) return stopped('ACTION', 'Only validation, read-only state, baseline adoption, or reviewed deployment is permitted.');
  const checked = await runPasswordHandoff('validate-target', env);
  if (!checked.ok || action === 'validate-target') return checked;
  let stage = 'input';
  try {
    const c = validateTarget(connectionFromPassword(env.DATABASE_PASSWORD), { caCert: env.DATABASE_CA_CERT });
    if (action !== 'state') {
      if (env.CONFIRM_HOSTED_MIGRATION !== project || env.CONFIRM_MIGRATION_ACTION !== action) return stopped('CONFIRMATION', 'The exact project and action must be confirmed in this private session.');
      if (env.CONFIRM_RECOVERY_POINT !== project) return stopped('RECOVERY', 'Confirm a completed recovery point and the recovery prerequisites before a hosted write.');
      stage = 'backup-directory';
      await validateBackupDirectory(env.BACKUP_DIR);
    }
    stage = 'dependencies';
    const db = await load();
    stage = 'state';
    const state = await db.migrationState(c);
    if (!Object.hasOwn(states, state) || state === 'attention') return stopped('HISTORY', states.attention);
    if (action === 'state') return { ok: true, message: `[migration/STATE] ${states[state]} No schema write was performed.` };
    if ((action === 'adopt' && state !== 'unadopted') || (action === 'deploy' && state !== 'baseline')) return stopped('HISTORY', states[state]);
    stage = action;
    // Explicit functions only. Both retain the existing write interlock and
    // perform a NEW verified backup before their Prisma write. No enrollment API.
    if (action === 'adopt') await db.adoptBaseline(c); else await db.deployMigrations(c);
    const after = await db.migrationState(c);
    if (after !== (action === 'adopt' ? 'baseline' : 'complete')) return stopped('HISTORY', 'The operation returned an unexpected migration state.');
    return { ok: true, message: `[migration/OK] ${states[after]} No administrative enrollment command was run.` };
  } catch (error) {
    // A write may have happened before an error; never claim otherwise.
    const detail = safeDiagnostic(error, 'startup').replace('[startup/', `[${stage}/`).replace(' No schema migration or enrollment was performed.', '');
    return { ok: false, message: `${detail} Stop and inspect migration state before retrying; do not reset or mark failed work applied.` };
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runMigrationHandoff(process.argv[2]);
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}
