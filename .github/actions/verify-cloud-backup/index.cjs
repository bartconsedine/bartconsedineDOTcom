const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync('node',[path.resolve(__dirname,'../../../scripts/verify-cloud-backup.mjs')],{env:process.env,encoding:'utf8',maxBuffer:1024*1024,timeout:5*60*1000});
if(result.status===0 && result.stdout.trim().split('\n').at(-1)==='CLOUD_BACKUP_VERIFIED') console.log('Synthetic cloud artifact upload/download/decryption passed. No database credential or connection used.');
else {console.log('Synthetic cloud backup verification failed. Raw output withheld.');process.exitCode=1;}
