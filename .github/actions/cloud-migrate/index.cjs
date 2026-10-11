// JavaScript actions receive the artifact runtime token; shell steps do not.
// Spawn the pinned Node 22 from setup-node. Credentials travel only in env.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync('node',[path.resolve(__dirname,'../../../scripts/cloud-database-migrate.mjs')],{env:process.env,encoding:'utf8',maxBuffer:1024*1024,timeout:25*60*1000});
let reply;
try {reply=JSON.parse((result.stdout||'').trim().split('\n').at(-1));} catch {}
if(result.status===0 && reply?.ok===true && ['inspect','adopt','deploy'].includes(reply.operation) && ['unadopted','baseline','complete'].includes(reply.state) && (reply.artifactId===null || Number.isSafeInteger(reply.artifactId))) {
  console.log(`[cloud/OK] ${reply.operation}: ${reply.state}. Encrypted backup artifact: ${reply.artifactId===null?'none (read-only)':reply.artifactId}. No admin enrollment ran.`);
} else {
  // Neither child stdout nor stderr is forwarded: package/native errors may
  // contain credential-bearing strings. Never claim a failed write rolled back.
  console.log('[cloud/STOP] Cloud migration stopped. Inspect ledger/schema before retrying; a failure does not prove rollback.');process.exitCode=1;
}
