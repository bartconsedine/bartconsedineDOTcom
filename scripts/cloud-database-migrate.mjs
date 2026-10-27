import { mkdtemp, chmod, rm } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { connection } from './database-connection.mjs';
import { connectionFromPassword } from './private-database-password.mjs';
import { verifyReviewedMigrations } from './reviewed-migrations.mjs';
import { backupKey, retainCloudBackup } from './cloud-backup.mjs';

export function cloudInputs(env, platform = process.platform) {
  if(platform!=='linux' || env.GITHUB_ACTIONS!=='true' || env.GITHUB_REPOSITORY!=='bartconsedine/bartconsedineDOTcom' || env.GITHUB_REF!=='refs/heads/main' || env.GITHUB_EVENT_NAME!=='workflow_dispatch') throw new Error('Only manual cloud execution on main is allowed.');
  const operation=env.INPUT_OPERATION;
  if(!['inspect','adopt','deploy','deploy-robot-party'].includes(operation)) throw new Error('Unsupported action.');
  if(!env.SUPABASE_DATABASE_PASSWORD || !isAbsolute(env.RUNNER_TEMP || '')) throw new Error('Private cloud configuration is missing.');
  if(operation!=='inspect' && (env.INPUT_CONFIRMATION!==`${operation.toUpperCase()} vgsmfbupgydafvotkold` || env.INPUT_RECOVERY_CONFIRMED!=='true')) throw new Error('Exact action and recovery confirmation are required.');
  return {operation,c:connection(connectionFromPassword(env.SUPABASE_DATABASE_PASSWORD,'session')),key:operation==='inspect'?null:backupKey(env.CLOUD_BACKUP_KEY)};
}
export async function runCloudMigration(env, { platform=process.platform, loadDatabase=()=>import('./database.mjs'), loadArtifact=async()=>new (await import('@actions/artifact')).DefaultArtifactClient(), retain=retainCloudBackup } = {}) {
  let directory;
  try {
    const {operation,c,key}=cloudInputs(env,platform);
    await verifyReviewedMigrations();
    const db=await loadDatabase();
    await db.prismaConnectionCheck(c);
    const before=await db.migrationState(c);
    if(!['unadopted','baseline','pending','complete'].includes(before)) throw new Error('Migration history needs inspection.');
    if(operation==='inspect') return {ok:true,operation,state:before,artifactId:null};
    if(operation === 'adopt' ? before !== 'unadopted' : !['baseline', 'pending'].includes(before)) throw new Error('Wrong migration state.');
    directory=await mkdtemp(join(env.RUNNER_TEMP,'bart-cloud-migration-'));await chmod(directory,0o700);
    const previous={backup:process.env.BACKUP_DIR,confirmation:process.env.CONFIRM_HOSTED_MIGRATION};
    const artifact=await loadArtifact();let artifactId;let retained=false;
    try {
      process.env.BACKUP_DIR=directory;process.env.CONFIRM_HOSTED_MIGRATION='vgsmfbupgydafvotkold';
      const retainBackup=async archive=>{artifactId=await retain(archive,directory,key,artifact,`database-backup-${operation}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`);retained=true;};
      if(operation==='adopt') await db.adoptBaseline(c,{retainBackup}); else await db.deployMigrations(c,{retainBackup,...(operation==='deploy-robot-party'?{profile:'robot-party'}:{})});
      if(!retained || !Number.isSafeInteger(artifactId) || artifactId<=0) throw new Error('Backup retention was not verified.');
      const after=await db.migrationState(c);
      if(after!==(operation==='adopt'?'baseline':operation==='deploy-robot-party'?'pending':'complete')) throw new Error('Post-write migration state differs.');
      return {ok:true,operation,state:after,artifactId};
    } finally {
      if(previous.backup===undefined)delete process.env.BACKUP_DIR;else process.env.BACKUP_DIR=previous.backup;
      if(previous.confirmation===undefined)delete process.env.CONFIRM_HOSTED_MIGRATION;else process.env.CONFIRM_HOSTED_MIGRATION=previous.confirmation;
      key.fill(0);
    }
  } catch {return {ok:false,code:'STOP',message:'Cloud migration stopped. Inspect actual ledger/schema before retrying; a failure does not prove rollback.'};}
  finally {if(directory) await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await runCloudMigration(process.env);console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}
