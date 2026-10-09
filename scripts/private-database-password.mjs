import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runHandoff } from './private-database-check.mjs';

// Verified in this project's Supabase Connect → Direct → URI panel on 2026-10-09.
// This is a nonsecret fixed destination, not a hostname inferred from its region.
export const directEndpoint = 'postgresql://postgres@db.vgsmfbupgydafvotkold.supabase.co:5432/postgres';

export function connectionFromPassword(password) {
  if (typeof password !== 'string' || password.length === 0) throw new Error('PASSWORD_EMPTY');
  if (/^\s*(?:postgres(?:ql)?:\/\/|(?:export\s+)?DATABASE_URL\s*=)/.test(password)) throw new Error('PASSWORD_MODE');
  if (/[\u0000-\u001f\u007f]/.test(password)) throw new Error('PASSWORD_LINE');
  const url = new URL(directEndpoint);
  // Preserve the literal password, including spaces and percent signs. No trim,
  // shell interpolation, command-line arguments, clipboard, or persisted secret.
  url.password = encodeURIComponent(password);
  return url.href;
}

export async function runPasswordHandoff(action, env = process.env, load) {
  let url;
  try { url = connectionFromPassword(env.DATABASE_PASSWORD); }
  catch (error) {
    const codes = {
      PASSWORD_EMPTY: 'Enter the existing database password at the hidden password prompt.',
      PASSWORD_MODE: 'This prompt accepts only the password. For a full URL, use private-database.command instead.',
      PASSWORD_LINE: 'Enter a single-line password; control characters are not supported by this prompt.',
    };
    const code = Object.hasOwn(codes, error.message) ? error.message : 'PASSWORD_ENCODING';
    return { ok: false, message: `[input/${code}] ${codes[code] || 'The password could not be encoded. No connection was attempted.'} No schema migration or enrollment was performed.` };
  }
  // The URL remains in this process; children get only the connection data required
  // by the existing reviewed database tools. Never print or write it to a file.
  return runHandoff(action, { ...env, DATABASE_URL: url }, load);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runPasswordHandoff(process.argv[2]);
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}
