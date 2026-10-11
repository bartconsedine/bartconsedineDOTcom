// No database connection or credential is needed to prepare this local runtime.
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeFiles, runtimeFingerprint, verifyRuntimeSource, checkedRuntime } from './prisma-linux-runtime.mjs';
import { subprocessEnvironment } from './database-connection.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv[2]==='check') {try{checkedRuntime();console.log('Private Linux Prisma image verified.');}catch{console.error('Prepare the reviewed Linux Prisma runtime before entering a password.');process.exitCode=1;}}
else if(process.argv[2]==='build') {
  const context=await mkdtemp(join(tmpdir(),'prisma-linux-build-'));
  try {
    const source=runtimeFingerprint();
    for(const file of runtimeFiles){await mkdir(dirname(join(context,file)),{recursive:true});await copyFile(join(root,file),join(context,file));}
    verifyRuntimeSource(source,context);
    const env=subprocessEnvironment();
    const build=spawnSync('docker',['--context','rancher-desktop','build','-f','scripts/prisma-linux/Dockerfile','-t','bart-prisma-private:local',context],{env,stdio:'inherit'});
    if(build.status!==0)throw new Error('build');
    const inspect=spawnSync('docker',['--context','rancher-desktop','image','inspect','bart-prisma-private:local','--format','{{.Id}}'],{env,encoding:'utf8'});
    const image=inspect.stdout.trim();
    if(inspect.status!==0||!/^sha256:[a-f0-9]{64}$/.test(image))throw new Error('image');
    verifyRuntimeSource(source);
    await writeFile(join(root,'.prisma-linux-runtime.json'),JSON.stringify({image,source})+'\n',{mode:0o600});
    console.log('Private Linux Prisma runtime prepared; no database credential or connection used.');
  } catch {console.error('Linux runtime preparation failed. No database operation ran.');process.exitCode=1;}
  finally{await rm(context,{recursive:true,force:true});}
} else {console.error('Use build or check.');process.exitCode=1;}
