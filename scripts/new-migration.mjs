import { mkdir, writeFile } from 'node:fs/promises';
const name = process.argv[2];
if (!/^[a-z][a-z0-9_]{0,70}$/.test(name || '')) throw new Error('Use a lowercase migration_name');
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const dir = new URL(`../prisma/migrations/${stamp}_${name}/`, import.meta.url);
await mkdir(dir);
await writeFile(new URL('migration.sql', dir), '-- Reviewed SQL: preserve Auth foreign keys, RLS, grants and function security.\nbegin;\n\n-- Add migration SQL here; test locally before deployment.\n\ncommit;\n', { flag: 'wx' });
console.log(`Created prisma/migrations/${stamp}_${name}/migration.sql`);
