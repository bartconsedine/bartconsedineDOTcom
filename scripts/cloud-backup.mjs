import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';

export function backupKey(value) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value || '')) throw new Error('Backup key must be 32 random bytes in base64.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) throw new Error('Invalid backup key.');
  return key;
}
export async function fileHash(path) {
  const hash=createHash('sha256');for await(const chunk of createReadStream(path)) hash.update(chunk);return hash.digest('hex');
}
export async function encryptBackup(archive, directory, key) {
  await mkdir(directory,{mode:0o700});
  const envelope={version:1,algorithm:'aes-256-gcm',files:{}};
  for(const [name,source] of [['archive',archive],['manifest',archive+'.json']]) {
    const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from('bart-database-backup-v1:'+name));
    const destination=join(directory,name+'.enc');
    await pipeline(createReadStream(source),cipher,createWriteStream(destination,{mode:0o600,flags:'wx'}));
    envelope.files[name]={iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),sha256:await fileHash(destination)};
  }
  await writeFile(join(directory,'envelope.json'),JSON.stringify(envelope)+'\n',{mode:0o600,flag:'wx'});
  return ['archive.enc','manifest.enc','envelope.json'].map(name=>join(directory,name));
}
// Also used during retention to prove the downloaded artifact is decryptable.
export async function decryptBackup(directory, output, key) {
  const envelope=JSON.parse(await readFile(join(directory,'envelope.json'),'utf8'));
  if(envelope.version!==1 || envelope.algorithm!=='aes-256-gcm') throw new Error('Invalid encrypted backup.');
  await mkdir(output,{mode:0o700});
  try {
    for(const name of ['archive','manifest']) {
      const metadata=envelope.files[name];const source=join(directory,name+'.enc');
      if(await fileHash(source)!==metadata.sha256) throw new Error('Encrypted backup checksum mismatch.');
      const iv=Buffer.from(metadata.iv,'base64');const tag=Buffer.from(metadata.tag,'base64');
      if(iv.length!==12 || tag.length!==16) throw new Error('Invalid encrypted backup.');
      const cipher=createDecipheriv('aes-256-gcm',key,iv);
      cipher.setAAD(Buffer.from('bart-database-backup-v1:'+name));cipher.setAuthTag(tag);
      await pipeline(createReadStream(source),cipher,createWriteStream(join(output,name==='archive'?'backup.dump':'backup.dump.json'),{mode:0o600,flags:'wx'}));
    }
    const manifest=JSON.parse(await readFile(join(output,'backup.dump.json'),'utf8'));
    if(manifest.formatVersion!==1 || manifest.sha256!==await fileHash(join(output,'backup.dump'))) throw new Error('Recovered backup checksum mismatch.');
  } catch(error) {await rm(output,{recursive:true,force:true});throw error;}
}
export async function retainCloudBackup(archive, directory, key, artifact, name) {
  const encrypted=join(directory,'encrypted');
  const files=await encryptBackup(archive,encrypted,key);
  const uploaded=await artifact.uploadArtifact(name,files,encrypted,{retentionDays:30});
  if(!Number.isSafeInteger(uploaded.id) || uploaded.id<=0) throw new Error('No retained artifact.');
  const downloaded=join(directory,'downloaded');
  await artifact.downloadArtifact(uploaded.id,{path:downloaded});
  for(const file of ['archive.enc','manifest.enc','envelope.json']) {
    if(await fileHash(join(encrypted,file))!==await fileHash(join(downloaded,file))) throw new Error('Retained backup differs.');
  }
  const recovered=join(directory,'recovered');
  await decryptBackup(downloaded,recovered,key);
  if(await fileHash(archive)!==await fileHash(join(recovered,'backup.dump')) || await fileHash(archive+'.json')!==await fileHash(join(recovered,'backup.dump.json'))) throw new Error('Recovery verification failed.');
  await rm(recovered,{recursive:true,force:true});
  return uploaded.id;
}
