-- Run with psql -XqAt -v ON_ERROR_STOP=1 on a quiescent source and target.
-- Outputs metadata and hashes only. Keep both manifests private.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL timezone = 'UTC';
SET LOCAL search_path = pg_catalog;
SELECT format(
  'SELECT %L, count(*), encode(sha256(convert_to(coalesce(string_agg(row_hash, '''' ORDER BY row_hash COLLATE "C"), ''''), ''UTF8'')), ''hex'')
   FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text, ''UTF8'')), ''hex'') row_hash FROM %I.%I t) rows',
  n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('auth', 'private', 'public', 'supabase_migrations') AND c.relkind IN ('r','p')
  AND (n.nspname, c.relname) <> ('auth','schema_migrations')
ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C"
\gexec
SELECT 'table', n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('private','public') AND c.relkind IN ('r','p') ORDER BY 2,3;
SELECT 'policy', schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname IN ('private','public') ORDER BY 2,3,4;
SELECT 'function', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_userbyid(p.proowner),
  encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('private','public') AND p.prokind IN ('f','p') ORDER BY 2,3,4;
SELECT 'grant', table_schema, table_name, grantee, privilege_type, is_grantable
FROM information_schema.table_privileges WHERE table_schema IN ('public','private') ORDER BY 2,3,4,5,6;
SELECT format('SELECT %L, last_value, is_called FROM %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='S' AND n.nspname IN ('auth','public','private','supabase_migrations')
ORDER BY n.nspname COLLATE "C", c.relname COLLATE "C"
\gexec
SELECT 'execute', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
  CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type, a.is_grantable
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
WHERE n.nspname IN ('private','public') ORDER BY 2,3,4,5,6,7;
SELECT 'default-grant', n.nspname, pg_get_userbyid(d.defaclrole), d.defaclobjtype,
  CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type, a.is_grantable
FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE n.nspname IN ('private','public') ORDER BY 2,3,4,5,6,7;
COMMIT;
