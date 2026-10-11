import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { connection, bundledCaPath, prismaEnvironment } from '../database-connection.mjs';
import { reviewedMigrations } from '../reviewed-migrations.mjs';
import { prismaFailure } from '../prisma-diagnostics.mjs';

export function validateRequest(request) {
  const operations = { check: ['db','execute','--stdin'], adopt: ['migrate','resolve','--applied','0_private_workspace'], deploy: ['migrate','deploy'], status: ['migrate','status'] };
  if (!Object.hasOwn(operations, request.operation)) throw new Error('invalid operation');
  const c = connection(request.url, { caCert: bundledCaPath });
  if (c.host !== 'aws-0-us-east-2.pooler.supabase.com' || c.port !== '5432' || c.database !== 'postgres' || c.user !== 'postgres.vgsmfbupgydafvotkold') throw new Error('invalid target');
  const expected = ['migration_lock.toml', ...Object.keys(reviewedMigrations).map(n => `${n}/migration.sql`)].sort();
  if (JSON.stringify(Object.keys(request.files).sort()) !== JSON.stringify(expected)) throw new Error('invalid files');
  if (request.files['migration_lock.toml'] !== 'provider = "postgresql"\n') throw new Error('invalid lock');
  for (const [name, hash] of Object.entries(reviewedMigrations)) {
    if (createHash('sha256').update(request.files[`${name}/migration.sql`]).digest('hex') !== hash) throw new Error('invalid SQL');
  }
  return { c, args: operations[request.operation] };
}

export async function executeRequest(request, spawn = spawnSync) {
  const { c, args } = validateRequest(request);
  // Only verified SQL/config is written to container tmpfs. The credential is
  // received on stdin and lives only in these processes, never Docker Config.Env.
  const staging = '/tmp/reviewed';
  await mkdir(staging, { mode: 0o700 });
  try {
    await mkdir(`${staging}/migrations`, { mode: 0o700 });
    for (const name of Object.keys(reviewedMigrations)) await mkdir(`${staging}/migrations/${name}`, { mode: 0o700 });
    for (const [name, bytes] of Object.entries(request.files)) await writeFile(`${staging}/migrations/${name}`, bytes, {mode:0o400,flag:'wx'});
    await writeFile(`${staging}/prisma.config.ts`, 'export default {schema:"/runner/prisma/schema.prisma",migrations:{path:"/tmp/reviewed/migrations"},datasource:{url:process.env.DATABASE_URL}};\n', {mode:0o400,flag:'wx'});
    const result = spawn(process.execPath, ['/runner/node_modules/prisma/build/index.js', ...args, '--config', `${staging}/prisma.config.ts`], {
      cwd:'/runner',env:prismaEnvironment(c, {PATH:process.env.PATH,HOME:'/tmp'}),encoding:'utf8',maxBuffer:20*1024*1024,
      ...(request.operation === 'check' ? {input:'select 1;\n'} : {}),
    });
    return result.status === 0 ? {ok:true} : {ok:false,code:prismaFailure(result).diagnosticCode};
  } finally { await rm(staging,{recursive:true,force:true}); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  try { let input=''; for await (const chunk of process.stdin) { input+=chunk; if(input.length>1024*1024) throw new Error('input limit'); } result = await executeRequest(JSON.parse(input)); }
  catch { result = {ok:false,code:'PRISMA_CONFIG'}; }
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode=1;
}
