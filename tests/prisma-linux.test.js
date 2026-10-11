import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, copyFile, appendFile, rm } from 'node:fs/promises';
import { connection, bundledCaPath } from '../scripts/database-connection.mjs';
import { connectionFromPassword } from '../scripts/private-database-password.mjs';
import { verifyReviewedMigrations } from '../scripts/reviewed-migrations.mjs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { linuxInvocation, runtimeFiles, runtimeFingerprint, verifyRuntimeSource } from '../scripts/prisma-linux-runtime.mjs';
import { validateRequest, executeRequest } from '../scripts/prisma-linux/entry.mjs';
const secret='SYNTHETIC-linux-password-%#& spaces';
const request=async()=>({operation:'check',url:connectionFromPassword(secret,'session'),files:Object.fromEntries(Object.entries(await verifyReviewedMigrations()).map(([name,data])=>[name,data.toString()]))});

test('Linux runner carries credentials only on stdin, not Docker arguments or configuration environment', async()=>{
  const req=await request();const c=connection(req.url);
  const {args,options}=linuxInvocation('check',c,req.files,{image:'sha256:'+'a'.repeat(64)});
  assert.ok(!JSON.stringify(args).includes(secret));
  assert.ok(!JSON.stringify(options.env).includes(secret));
  assert.equal(options.env.DATABASE_URL,undefined);
  assert.equal(options.env.DATABASE_PASSWORD,undefined);
  assert.equal(decodeURIComponent(new URL(JSON.parse(options.input).url).password),secret);
  for(const flag of ['--read-only','--rm','--pull=never','--cap-drop=ALL','--security-opt=no-new-privileges']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--log-driver')+1],'none');
  assert.equal(args[args.indexOf('--user')+1],'1000:1000');
  assert.ok(!args.some(a=>a==='--privileged'||a==='-v'||a==='--mount'||a==='--env'||a==='-e'));
});

test('Linux request independently restricts project, username, session port, trust and exact reviewed SQL',async()=>{
  const req=await request();
  const checked=validateRequest(req);
  assert.equal(checked.c.url.searchParams.get('sslaccept'),'strict');
  assert.equal(checked.c.url.searchParams.get('sslmode'),'require');
  assert.equal(checked.c.caCert,bundledCaPath);
  for(const edit of [
    r=>{r.operation='reset';},
    r=>{r.url=r.url.replace('aws-0-us-east-2','aws-1-us-east-2');},
    r=>{r.url=r.url.replace('postgres.vgsmfbupgydafvotkold','postgres.otherproject');},
    r=>{r.url=r.url.replace(':5432',':6543');},
    r=>{r.url+='?sslcert=/wrong/ca';},
    r=>{r.files['extra/migration.sql']='select 1;';},
    r=>{r.files['0_private_workspace/migration.sql']+='\nselect 1;';},
  ]) {const altered=structuredClone(req);edit(altered);assert.throws(()=>validateRequest(altered));}
  assert.throws(()=>connectionFromPassword(secret,'arbitrary-endpoint'));
});

test('Linux entry executes fixed read-only preflight and does not persist or print connection details',async()=>{
  const req=await request();let invoked=false;
  const result=await executeRequest(req,(exe,args,options)=>{
    invoked=true;
    assert.deepEqual(args.slice(1,4),['db','execute','--stdin']);
    assert.equal(options.input,'select 1;\n');
    assert.ok(!JSON.stringify(args).includes(secret));
    assert.equal(decodeURIComponent(new URL(options.env.DATABASE_URL).password),secret);
    return {status:1,stderr:`Error: P1011: ${req.url}`,stdout:secret};
  });
  assert.equal(invoked,true);assert.deepEqual(result,{ok:false,code:'PRISMA_TLS'});
  await assert.rejects(readFile('/tmp/reviewed/prisma.config.ts'),{code:'ENOENT'});
});


test('runtime certification rejects copied-source or checkout changes during image preparation', async()=>{
  const context=await mkdtemp(join(tmpdir(),'prisma-source-race-'));
  try {
    const expected=runtimeFingerprint();
    for(const file of runtimeFiles){await mkdir(dirname(join(context,file)),{recursive:true});await copyFile(new URL('../'+file,import.meta.url),join(context,file));}
    verifyRuntimeSource(expected,context);
    await appendFile(join(context,'scripts/prisma-linux/entry.mjs'),'\n// changed during build\n');
    assert.throws(()=>verifyRuntimeSource(expected,context),error=>error.diagnosticCode==='PRISMA_RUNTIME');
    assert.throws(()=>verifyRuntimeSource(runtimeFingerprint(context)),error=>error.diagnosticCode==='PRISMA_RUNTIME');
  }finally{await rm(context,{recursive:true,force:true});}
});
