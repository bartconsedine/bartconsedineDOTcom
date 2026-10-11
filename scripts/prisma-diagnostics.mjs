import { DatabaseToolError } from './database-connection.mjs';

// Inspect in memory, then discard raw CLI output. Never put it in an exception,
// diagnostic, log or file: even a Prisma error can contain the connection URL.
export function prismaFailure(result) {
  let code = 'PRISMA_TOOL';
  if (result.error?.code === 'ENOENT') code = 'PRISMA_MISSING';
  else if (result.error?.code === 'EACCES') code = 'PRISMA_PERMISSION';
  else if (result.error?.code === 'ENOBUFS') code = 'PRISMA_OUTPUT_LIMIT';
  else if (result.signal) code = 'PRISMA_INTERRUPTED';
  else {
    const output = `${result.stderr || ''}\n${result.stdout || ''}`;
    const allowed = {
      P1000: 'PRISMA_AUTH', P1001: 'PRISMA_CONNECTIVITY', P1002: 'PRISMA_CONNECTIVITY',
      P1003: 'PRISMA_DATABASE', P1008: 'PRISMA_CONNECTIVITY', P1010: 'PRISMA_PERMISSION',
      P1011: 'PRISMA_TLS', P1012: 'PRISMA_CONFIG', P1013: 'PRISMA_CONFIG',
      P3014: 'PRISMA_PERMISSION', P3005: 'PRISMA_HISTORY', P3008: 'PRISMA_HISTORY',
      P3009: 'PRISMA_HISTORY', P3018: 'PRISMA_HISTORY', P3019: 'PRISMA_CONFIG',
    };
    const match = output.match(/(?:^|\n)\s*(?:Error:\s*)?(P\d{4})(?=[:\s]|$)/);
    if (match && Object.hasOwn(allowed, match[1])) code = allowed[match[1]];
  }
  const error = new DatabaseToolError('Prisma command failed. Inspect the safe diagnostic category and migration state before retrying.');
  error.diagnosticCode = code;
  return error;
}

export const prismaMessages = Object.freeze({
  PRISMA_RUNTIME: 'The reviewed private Linux runtime is missing, changed, or unavailable. Prepare it before another attempt; do not fall back to weaker TLS.',
  PRISMA_CONTAINER: 'The private Linux Prisma process failed without a valid safe result. Inspect runtime and migration state before retrying.',
  PRISMA_TLS: 'Prisma could not verify the database TLS connection. Do not disable certificate or hostname verification. Inspect the approved certificate and runtime compatibility.',
  PRISMA_AUTH: 'Prisma rejected database authentication. Check the existing credential privately; do not reset it automatically.',
  PRISMA_CONNECTIVITY: 'Prisma could not reach the database or timed out. Check the approved endpoint and network.',
  PRISMA_DATABASE: 'Prisma could not find the selected database. Check the approved target.',
  PRISMA_PERMISSION: 'Prisma lacks a required filesystem or database permission. Inspect the runtime and role before retrying.',
  PRISMA_CONFIG: 'Prisma rejected its schema or connection configuration. Stop for tooling review.',
  PRISMA_HISTORY: 'Prisma reported a migration history or execution error. Inspect actual history and schema; do not reset or blindly resolve.',
  PRISMA_MISSING: 'The Prisma runtime executable could not start. Check the reviewed Node and dependency installation.',
  PRISMA_OUTPUT_LIMIT: 'Prisma exceeded the captured-output limit. Stop for tooling review; raw output was discarded.',
  PRISMA_INTERRUPTED: 'Prisma was interrupted. Inspect actual migration state before retrying.',
  PRISMA_TOOL: 'Prisma failed without a recognized safe category. Raw output was discarded. Stop for tooling review and inspect migration state.',
});
