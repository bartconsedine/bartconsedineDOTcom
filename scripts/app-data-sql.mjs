// Generates reviewed, owner-scoped SQL for the trusted Supabase connector.
// It never connects to a database, loads secrets, or stores authoritative app data.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { appDataContract } from '../src/lib/app-data-contracts.js';
import { validateRevision } from '../src/lib/record-revision.js';

export const PROJECT_ID = 'vgsmfbupgydafvotkold';
const owners = new Set(['bartconsedine@gmail.com', 'mjshah8@gmail.com']);
const literal = value => `'${value.replaceAll("'", "''")}'`;
export function appDataSql({ operation, slug, email, value, expectedAt }) {
  const contract = appDataContract(slug);
  if (!owners.has(email)) throw new Error('Specify an approved owner email');
  const owner = `owner as (
  select a.user_id from private.site_admin a join auth.users u on u.id=a.user_id
  where a.email=${literal(email)} and lower(u.email)=a.email
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and exists(select 1 from auth.identities i where i.user_id=u.id
      and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb
      and lower(i.identity_data->>'email')=a.email)
)`;
  const scope = `d.owner_id=o.user_id and d.app_slug=${literal(slug)} and d.key=${literal(contract.key)}`;
  if (operation === 'read') return `with ${owner}
select o.user_id as owner_id, d.value, to_char(d.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at from owner o
left join public.app_data d on ${scope};`;
  if (operation !== 'write') throw new Error('Use read or write');
  validateRevision(expectedAt);
  contract.validate(value);
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > contract.maxBytes) throw new Error('App data is too large');
  const change = expectedAt === null
    ? `insert into public.app_data(owner_id,app_slug,key,value,updated_at)
  select user_id,${literal(slug)},${literal(contract.key)},${literal(json)}::jsonb,clock_timestamp() from owner
  on conflict(owner_id,app_slug,key) do nothing returning updated_at`
    : `update public.app_data d set value=${literal(json)}::jsonb,
    updated_at=greatest(clock_timestamp(),d.updated_at + interval '1 microsecond')
  from owner o where ${scope} and d.updated_at=${literal(expectedAt)}::timestamptz returning d.updated_at`;
  return `with ${owner}, changed as (${change})
select exists(select 1 from owner) as authorized,
  exists(select 1 from changed) as saved, (select to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from changed) as updated_at;`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [operation, slug, email, file] = process.argv.slice(2);
    if ((operation === 'read' && process.argv.length !== 5) || (operation === 'write' && process.argv.length !== 6)) throw new Error('Usage: node scripts/app-data-sql.mjs read <slug> <owner-email> | write <slug> <owner-email> <change.json>');
    let change = {};
    if (operation === 'write') {
      const bytes = await readFile(file);
      if (bytes.length > appDataContract(slug).maxBytes + 1000) throw new Error('Change file is too large');
      change = JSON.parse(bytes.toString('utf8'));
      if (!change || Object.keys(change).length !== 2 || !Object.hasOwn(change, 'value') || !Object.hasOwn(change, 'expectedAt')) throw new Error('Change requires only value and expectedAt');
    }
    console.log(JSON.stringify({ project_id: PROJECT_ID, query: appDataSql({ operation, slug, email, ...change }) }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
