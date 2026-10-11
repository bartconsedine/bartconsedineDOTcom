// CI only: no Supabase connection, credential, or production backup.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { DefaultArtifactClient } from '@actions/artifact';
import { retainCloudBackup } from './cloud-backup.mjs';
const directory=await mkdtemp(join(tmpdir(),'cloud-backup-smoke-'));const key=randomBytes(32);
const name=`synthetic-backup-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;const artifact=new DefaultArtifactClient();let uploaded=false;let stage='prepare';
try {
  const archive=join(directory,'synthetic.dump');const data=Buffer.from('Synthetic backup roundtrip fixture; contains no real rows.');
  await writeFile(archive,data,{mode:0o600});await writeFile(archive+'.json',JSON.stringify({formatVersion:1,sha256:createHash('sha256').update(data).digest('hex')}),{mode:0o600});
  const transport={uploadArtifact:async(...args)=>{stage='upload';const result=await artifact.uploadArtifact(...args);uploaded=true;return result;},downloadArtifact:async(...args)=>{stage='download';const result=await artifact.downloadArtifact(...args);stage='verify';return result;}};
  await retainCloudBackup(archive,directory,key,transport,name);
  stage='cleanup';await artifact.deleteArtifact(name);uploaded=false;
  console.log('CLOUD_BACKUP_VERIFIED');
} catch(error) {
  const message=String(error.message || '');
  const code=message.includes('ACTIONS_RUNTIME_TOKEN')?'MISSING_RUNTIME_TOKEN':message.includes('ACTIONS_RESULTS_URL')?'MISSING_RESULTS_URL':message.includes('403')?'SDK_FORBIDDEN':message.includes('404')?'SDK_NOT_FOUND':message.includes('response from backend')?'SDK_RESPONSE':['InvalidResponseError','NetworkError','UsageError','ArtifactNotFoundError'].includes(error.name)?error.name:'FAILED';
  console.log(JSON.stringify({ok:false,stage,code}));process.exitCode=1;
} finally {key.fill(0);await rm(directory,{recursive:true,force:true});if(uploaded)try {await artifact.deleteArtifact(name);} catch {}}
