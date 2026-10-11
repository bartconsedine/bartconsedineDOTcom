import test from 'node:test';
import assert from 'node:assert/strict';
import { prismaFailure } from '../scripts/prisma-diagnostics.mjs';
import { safeDiagnostic } from '../scripts/private-database-check.mjs';

test('Prisma failures retain only fixed diagnostic categories, never raw details', () => {
  const secret = 'postgresql://private-user:synthetic-secret@example.invalid/db';
  for (const [source, expected] of [
    ['P1011', 'PRISMA_TLS'], ['P1000', 'PRISMA_AUTH'], ['P1001', 'PRISMA_CONNECTIVITY'],
    ['P1012', 'PRISMA_CONFIG'], ['P3009', 'PRISMA_HISTORY'], ['P9999', 'PRISMA_TOOL'],
  ]) {
    const error = prismaFailure({ status: 1, stderr: `Loaded configuration\nError: ${source}: ${secret}`, stdout: secret });
    assert.equal(error.diagnosticCode, expected);
    assert.ok(safeDiagnostic(error, 'startup').includes(expected));
    assert.ok(!JSON.stringify(error).includes(secret));
    assert.ok(!error.stack.includes(secret));
    assert.ok(!safeDiagnostic(error, 'startup').includes(secret));
  }
});

test('spawn failures and signals are classified without printing arbitrary strings', () => {
  for (const [result, expected] of [
    [{ error: { code: 'ENOENT' } }, 'PRISMA_MISSING'],
    [{ error: { code: 'EACCES' } }, 'PRISMA_PERMISSION'],
    [{ error: { code: 'ENOBUFS' } }, 'PRISMA_OUTPUT_LIMIT'],
    [{ signal: 'SYNTHETIC_SECRET' }, 'PRISMA_INTERRUPTED'],
    [{ error: { code: 'SYNTHETIC_SECRET' } }, 'PRISMA_TOOL'],
  ]) {
    const error = prismaFailure(result);
    assert.equal(error.diagnosticCode, expected);
    assert.ok(!safeDiagnostic(error, 'startup').includes('SYNTHETIC_SECRET'));
  }
  assert.match(safeDiagnostic({diagnosticCode: 'SYNTHETIC_SECRET'}, 'startup'), /UNKNOWN/);
});
