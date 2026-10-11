import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseToolError, subprocessEnvironment, bundledCaPath } from './database-connection.mjs';
import { prismaMessages } from './prisma-diagnostics.mjs';
const root = fileURLToPath(new URL('../',import.meta.url));
export const runtimeFiles = ['package.json','package-lock.json','prisma/schema.prisma','certs/supabase-prod-ca-2021.crt','scripts/database-connection.mjs','scripts/reviewed-migrations.mjs','scripts/prisma-diagnostics.mjs','scripts/prisma-linux/entry.mjs','scripts/prisma-linux/Dockerfile'];
export function runtimeFingerprint(directory = root) {
  const hash=createHash('sha256');
  for(const path of runtimeFiles) hash.update(path+'\0').update(readFileSync(join(directory,path)));
  return hash.digest('hex');
}
const fail = code => {const error=new DatabaseToolError('Private Linux Prisma runtime unavailable or failed.');error.diagnosticCode=code;throw error;};
export function verifyRuntimeSource(expected, directory = root) {
  if (runtimeFingerprint(directory) !== expected) fail('PRISMA_RUNTIME');
}
export function checkedRuntime() {
  try {
    const manifest=JSON.parse(readFileSync(join(root,'.prisma-linux-runtime.json'),'utf8'));
    if(manifest.source!==runtimeFingerprint() || !/^sha256:[a-f0-9]{64}$/.test(manifest.image)) fail('PRISMA_RUNTIME');
    const result=spawnSync('docker',['--context','rancher-desktop','context','inspect','rancher-desktop','--format','{{.Endpoints.docker.Host}}'],{env:subprocessEnvironment(),encoding:'utf8'});
    if(result.status!==0 || !result.stdout.trim().startsWith('unix://')) fail('PRISMA_RUNTIME');
    return manifest;
  } catch {fail('PRISMA_RUNTIME');}
}
export function linuxInvocation(operation,c,files,manifest) {
  if(c.host!=='aws-0-us-east-2.pooler.supabase.com'||c.user!=='postgres.vgsmfbupgydafvotkold'||c.port!=='5432'||c.database!=='postgres'||c.caCert!==bundledCaPath) fail('PRISMA_CONFIG');
  const url=new URL(c.url);url.searchParams.set('sslcert','/runner/certs/supabase-prod-ca-2021.crt');
  const args=['--context','rancher-desktop','run','--rm','--pull=never','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user','1000:1000','--network','bridge','--pids-limit','128','--memory','512m','--ulimit','core=0','--log-driver','none','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=64m','-i',manifest.image];
  return {args,options:{cwd:root,env:subprocessEnvironment(),input:JSON.stringify({operation,url:url.href,files}),encoding:'utf8',maxBuffer:1024*1024}};
}
export function runLinuxPrisma(operation,c,files) {
  const {args,options}=linuxInvocation(operation,c,files,checkedRuntime());
  const result=spawnSync('docker',args,options);
  let reply;
  try{reply=JSON.parse(result.stdout);}catch{fail('PRISMA_CONTAINER');}
  if(result.status===0 && reply.ok===true) return '';
  fail(Object.hasOwn(prismaMessages,reply.code)?reply.code:'PRISMA_CONTAINER');
}
