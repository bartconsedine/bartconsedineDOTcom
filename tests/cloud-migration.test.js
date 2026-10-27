import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { cloudInputs, runCloudMigration } from '../scripts/cloud-database-migrate.mjs';
import { backupKey, encryptBackup, decryptBackup, retainCloudBackup } from '../scripts/cloud-backup.mjs';
const secret='SYNTHETIC-cloud-password-%#&';
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'bartconsedine/bartconsedineDOTcom',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',RUNNER_TEMP:tmpdir(),SUPABASE_DATABASE_PASSWORD:secret,INPUT_OPERATION:'inspect',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'};

test('cloud operations enforce Linux/manual main/project/action/recovery before loading DB',async()=>{
  const target=cloudInputs(env,'linux').c;assert.equal(target.host,'aws-0-us-east-2.pooler.supabase.com');assert.equal(target.url.searchParams.get('sslaccept'),'strict');
  for(const changes of [{GITHUB_REF:'refs/heads/feature'}, {GITHUB_EVENT_NAME:'pull_request'}, {GITHUB_REPOSITORY:'other/repo'}, {INPUT_OPERATION:'reset'}, {SUPABASE_DATABASE_PASSWORD:''}, {INPUT_OPERATION:'adopt'}, {RUNNER_TEMP:'relative'}]) {
    let loaded=false;const result=await runCloudMigration({...env,...changes},{platform:'linux',loadDatabase:()=>{loaded=true;throw new Error(secret);}});assert.equal(result.ok,false);assert.equal(loaded,false);assert.ok(!JSON.stringify(result).includes(secret));
  }
  assert.throws(()=>cloudInputs(env,'darwin'));
});

test('cloud inspect performs read-only Prisma preflight and never requests artifact access',async()=>{
  const calls=[];
  const result=await runCloudMigration(env,{platform:'linux',loadDatabase:async()=>({prismaConnectionCheck:async()=>calls.push('preflight'),migrationState:async()=>{calls.push('state');return 'unadopted';}}),loadArtifact:()=>assert.fail('read-only must not upload')});
  assert.deepEqual(calls,['preflight','state']);assert.deepEqual(result,{ok:true,operation:'inspect',state:'unadopted',artifactId:null});
});

test('cloud writes await verified backup retention; failed retention blocks write, wrong history blocks dispatch',async()=>{
  for(const operation of ['adopt','deploy']) for(const failure of [false,true]) {
    const calls=[];let state=operation==='adopt'?'unadopted':'baseline';
    const write=async(c,{retainBackup})=>{calls.push('backup');await retainBackup('/synthetic/archive.dump');calls.push('write');state=operation==='adopt'?'baseline':'complete';};
    const result=await runCloudMigration({...env,INPUT_OPERATION:operation,INPUT_CONFIRMATION:`${operation.toUpperCase()} vgsmfbupgydafvotkold`,INPUT_RECOVERY_CONFIRMED:'true',CLOUD_BACKUP_KEY:randomBytes(32).toString('base64')},{platform:'linux',loadDatabase:async()=>({prismaConnectionCheck:async()=>{},migrationState:async()=>state,adoptBaseline:write,deployMigrations:write}),loadArtifact:async()=>({}),retain:async()=>{calls.push('retain');if(failure)throw new Error(secret);return 123;}});
    assert.equal(result.ok,!failure);assert.deepEqual(calls,failure?['backup','retain']:['backup','retain','write']);assert.ok(!JSON.stringify(result).includes(secret));
  }
  const result=await runCloudMigration({...env,INPUT_OPERATION:'adopt',INPUT_CONFIRMATION:'ADOPT vgsmfbupgydafvotkold',INPUT_RECOVERY_CONFIRMED:'true',CLOUD_BACKUP_KEY:randomBytes(32).toString('base64')},{platform:'linux',loadDatabase:async()=>({prismaConnectionCheck:async()=>{},migrationState:async()=>'complete'}),loadArtifact:()=>assert.fail('history must stop before artifact')});assert.equal(result.ok,false);
});

test('encrypted backup roundtrip, download verification, tamper rejection and wrong-key cleanup',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cloud-backup-test-'));const key=backupKey(randomBytes(32).toString('base64'));
  try {
    const archive=join(root,'source.dump');const plaintext=Buffer.from('SYNTHETIC_PRIVATE_DATABASE_CONTENT');
    await writeFile(archive,plaintext);await writeFile(archive+'.json',JSON.stringify({formatVersion:1,sha256:createHash('sha256').update(plaintext).digest('hex')}));
    const encrypted=join(root,'encrypted');await encryptBackup(archive,encrypted,key);
    assert.ok(!(await readFile(join(encrypted,'archive.enc'))).includes(plaintext));
    await decryptBackup(encrypted,join(root,'restored'),key);assert.deepEqual(await readFile(join(root,'restored/backup.dump')),plaintext);
    await assert.rejects(decryptBackup(encrypted,join(root,'wrong-key'),randomBytes(32)));
    await assert.rejects(readFile(join(root,'wrong-key/backup.dump')),{code:'ENOENT'});
    await writeFile(join(encrypted,'archive.enc'),'CORRUPT');await assert.rejects(decryptBackup(encrypted,join(root,'tampered'),key),/checksum/);
    const roundtrip=join(root,'retain');await mkdir(roundtrip);let savedFiles;
    const artifact={uploadArtifact:async(name,files,dir,options)=>{assert.equal(options.retentionDays,30);assert.ok(files.every(file=>!file.endsWith('.dump')&&!file.endsWith('.dump.json')));savedFiles=files;return {id:42};},downloadArtifact:async(id,{path})=>{await mkdir(path);for(const file of savedFiles)await copyFile(file,join(path,file.split('/').at(-1)));}};
    assert.equal(await retainCloudBackup(archive,roundtrip,key,artifact,'synthetic'),42);
    const failed=join(root,'failed');await mkdir(failed);
    await assert.rejects(retainCloudBackup(archive,failed,key,{uploadArtifact:async()=>{throw new Error('offline');}},'synthetic'));
  } finally {await rm(root,{recursive:true,force:true});}
});

test('JavaScript action never forwards raw child stdout/stderr or malformed results', async()=>{
  const {spawnSync}=await import('node:child_process');
  const root=await mkdtemp(join(tmpdir(),'cloud-action-test-'));
  try {
    const bin=join(root,'bin');await mkdir(bin);
    for(const payload of [`console.log('${secret}');console.error('${secret}');process.exit(1)`, `console.log(JSON.stringify({ok:true,operation:'reset',state:'complete',artifactId:null}))`, `console.log('${secret}');console.log(JSON.stringify({ok:true,operation:'inspect',state:'unadopted',artifactId:null}))`]) {
      const fake=join(bin,'node');await writeFile(fake,`#!/bin/sh\nexec '${process.execPath}' -e '${payload.replaceAll("'", "'\\''")}'\n`,{mode:0o700});
      const result=spawnSync(process.execPath,[new URL('../.github/actions/cloud-migrate/index.cjs',import.meta.url).pathname],{encoding:'utf8',env:{PATH:bin}});
      assert.ok(!result.stdout.includes(secret));assert.ok(!result.stderr.includes(secret));
      assert.equal(result.status,payload.includes("operation:'inspect'")?0:1);
    }
  } finally {await rm(root,{recursive:true,force:true});}
});

test('an exact pending prefix can be inspected and deployed only after retained backup', async()=>{
  let state='pending', writes=0;
  const db={prismaConnectionCheck:async()=>{},migrationState:async()=>state,deployMigrations:async(_c,{retainBackup})=>{await retainBackup('/synthetic/archive.dump');writes++;state='complete';}};
  const inspect=await runCloudMigration(env,{platform:'linux',loadDatabase:async()=>db});assert.equal(inspect.state,'pending');assert.equal(writes,0);
  const input={...env,INPUT_OPERATION:'deploy',INPUT_CONFIRMATION:'DEPLOY vgsmfbupgydafvotkold',INPUT_RECOVERY_CONFIRMED:'true',CLOUD_BACKUP_KEY:randomBytes(32).toString('base64')};
  const failed=await runCloudMigration(input,{platform:'linux',loadDatabase:async()=>db,loadArtifact:async()=>({}),retain:async()=>{throw new Error('offline');}});assert.equal(failed.ok,false);assert.equal(writes,0);assert.equal(state,'pending');
  const saved=await runCloudMigration(input,{platform:'linux',loadDatabase:async()=>db,loadArtifact:async()=>({}),retain:async()=>88});assert.equal(saved.ok,true);assert.equal(saved.state,'complete');assert.equal(writes,1);
});

test('scoped Robot Party dispatch passes only the fixed plan, keeps later migrations pending and requires retention', async()=>{
  for (const retained of [false,true]) {
    let wrote=false;
    const input={...env,INPUT_OPERATION:'deploy-robot-party',INPUT_CONFIRMATION:'DEPLOY-ROBOT-PARTY vgsmfbupgydafvotkold',INPUT_RECOVERY_CONFIRMED:'true',CLOUD_BACKUP_KEY:randomBytes(32).toString('base64')};
    const db={prismaConnectionCheck:async()=>{},migrationState:async()=>'pending',deployMigrations:async(_c,{retainBackup,profile})=>{assert.equal(profile,'robot-party');await retainBackup('/synthetic/archive.dump');wrote=true;}};
    const result=await runCloudMigration(input,{platform:'linux',loadDatabase:async()=>db,loadArtifact:async()=>({}),retain:async()=>{if(!retained)throw new Error('offline');return 89;}});
    assert.equal(result.ok,retained);assert.equal(wrote,retained);
    if(retained)assert.equal(result.state,'pending');
    assert.equal((await runCloudMigration({...input,INPUT_CONFIRMATION:'DEPLOY vgsmfbupgydafvotkold'},{platform:'linux',loadDatabase:()=>assert.fail('wrong named confirmation')})).ok,false);
  }
});
