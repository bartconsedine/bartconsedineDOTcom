// CI only: no Supabase connection, credential, or production backup.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { DefaultArtifactClient } from '@actions/artifact';
import { retainCloudBackup } from './cloud-backup.mjs';
const directory=await mkdtemp(join(tmpdir(),'cloud-backup-smoke-'));const key=randomBytes(32);
const name=`synthetic-backup-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;const artifact=new DefaultArtifactClient();let uploaded=false;
try {
  const archive=join(directory,'synthetic.dump');const data=Buffer.from('Synthetic backup roundtrip fixture; contains no real rows.');
  await writeFile(archive,data,{mode:0o600});await writeFile(archive+'.json',JSON.stringify({formatVersion:1,sha256:createHash('sha256').update(data).digest('hex')}),{mode:0o600});
  await retainCloudBackup(archive,directory,key,artifact,name);uploaded=true;
  console.log('CLOUD_BACKUP_VERIFIED');
} finally {key.fill(0);await rm(directory,{recursive:true,force:true});if(uploaded)await artifact.deleteArtifact(name);}
