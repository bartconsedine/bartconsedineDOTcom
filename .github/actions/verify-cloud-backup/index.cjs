const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync('node',[path.resolve(__dirname,'../../../scripts/verify-cloud-backup.mjs')],{env:process.env,encoding:'utf8',maxBuffer:1024*1024,timeout:5*60*1000});
const last=(result.stdout||'').trim().split('\n').at(-1);
if(result.status===0 && last==='CLOUD_BACKUP_VERIFIED') console.log('Synthetic cloud artifact upload/download/decryption passed. No database credential or connection used.');
else {
  let reply;try {reply=JSON.parse(last);} catch {}
  const stages=['prepare','upload','download','verify','cleanup'];const codes=['MISSING_RUNTIME_TOKEN','MISSING_RESULTS_URL','SDK_FORBIDDEN','SDK_NOT_FOUND','SDK_RESPONSE','InvalidResponseError','NetworkError','UsageError','ArtifactNotFoundError','FAILED'];
  if(stages.includes(reply?.stage)&&codes.includes(reply?.code))console.log(`[cloud-test/${reply.stage}/${reply.code}] Synthetic cloud backup verification failed.`);
  else console.log('Synthetic cloud backup verification failed. Raw output withheld.');process.exitCode=1;
}
