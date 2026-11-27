#!/usr/bin/env bash
# Run only on a disposable CI runner. All credentials and records here are synthetic.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${RUNNER_TEMP:?Requires a disposable runner}"
: "${GITHUB_RUN_ID:?}"
work=$(mktemp -d "$RUNNER_TEMP/site-aws.XXXXXX")
python3 deploy/aws/generate-db-env.py "$work/database.env"
export SITE_HOST=site.localhost WWW_HOST=www.site.localhost
export GOOGLE_CLIENT_ID=ci-only GOOGLE_CLIENT_SECRET=ci-only CRON_SECRET=ci-only
export SITE_IMAGE="bart-site:ci-${GITHUB_RUN_ID}"
compose=(docker compose --project-name "site-ci-${GITHUB_RUN_ID}" --env-file "$work/database.env" -f deploy/aws/compose.yaml)
replica=(docker compose --project-name "restore-ci-${GITHUB_RUN_ID}" --env-file "$work/database.env" -f deploy/aws/compose.yaml)
cleanup() {
  result=$?
  if (( result != 0 )); then
    "${compose[@]}" logs --tail 50 auth rest edge
    rest_id=$("${compose[@]}" ps -q rest)
    if [[ -n "$rest_id" ]]; then docker inspect --format "{{json .State.Health}}" "$rest_id"; fi
  fi
  "${replica[@]}" down -v --remove-orphans >/dev/null
  "${compose[@]}" down -v --remove-orphans >/dev/null
  rm -rf "$work"
}
trap cleanup EXIT
docker build -f deploy/aws/site.Dockerfile -t "$SITE_IMAGE" .
"${compose[@]}" up -d --wait --wait-timeout 240
psql=("${compose[@]}" exec -T db psql -X --set ON_ERROR_STOP=1 -U postgres -d postgres)
for migration in prisma/migrations/*/migration.sql; do
  "${psql[@]}" < "$migration" > /dev/null
done
"${psql[@]}" -c "NOTIFY pgrst, 'reload schema';"
# Trust only this disposable gateway's local CA for TLS verification.
"${compose[@]}" cp edge:/data/caddy/pki/authorities/local/root.crt "$work/ca.pem"
request=(curl --silent --show-error --cacert "$work/ca.pem" --resolve site.localhost:443:127.0.0.1)
base=https://site.localhost
"${request[@]}" --fail --retry 5 "$base/" > "$work/home"
grep -qi bart "$work/home"
"${request[@]}" --fail "$base/login" > "$work/login"
grep -qi google "$work/login"
[[ $("${request[@]}" -o /dev/null -w '%{http_code}' "$base/auth/v1/admin/users") == 403 ]]
[[ $("${request[@]}" -o /dev/null -w '%{http_code}' "$base/rest/v1/app_data") == 403 ]]
anon_key=$(sed -n 's/^ANON_KEY=//p' "$work/database.env")
# PostgREST must accept the anon key, while the app's SQL grants deny private reads.
"${request[@]}" -H "apikey: $anon_key" -H "Authorization: Bearer $anon_key" \
  --fail "$base/rest/v1/" > "$work/catalog"
grep -q swagger "$work/catalog"
status=$("${request[@]}" -H "apikey: $anon_key" -H "Authorization: Bearer $anon_key" \
  -o "$work/denial" -w '%{http_code}' "$base/rest/v1/app_data")
[[ $status == 401 || $status == 403 || $status == 404 ]]
# Check the provider handoff without sending a request to Google.
location=$("${request[@]}" -o /dev/null -w '%{redirect_url}' "$base/auth/v1/authorize?provider=google")
[[ $location == https://accounts.google.com/* ]]
# Restart the database and verify durable schema state in the mounted volume.
"${compose[@]}" restart db
"${compose[@]}" up -d --wait --wait-timeout 120
[[ $("${psql[@]}" -Atc "select relrowsecurity from pg_class where oid='public.app_data'::regclass") == t ]]
# Exercise the verified archive import on a second initialized Postgres/Auth stack.
"${psql[@]}" -c "insert into auth.users (id,email) values ('00000000-0000-4000-8000-000000000001','fixture@example.com')"
"${psql[@]}" -c "insert into public.app_data(owner_id,app_slug,key,value) values ('00000000-0000-4000-8000-000000000001','japan-trip','plan-v1','{}')"
"${compose[@]}" stop edge site auth rest
"${compose[@]}" exec -T db pg_dump -U supabase_admin -Fc postgres > "$work/site.dump"
digest=$(sha256sum "$work/site.dump" | cut -d' ' -f1)
printf '{"sourceProject":"local-test","formatVersion":1,"sha256":"%s"}\n' "$digest" > "$work/site.dump.json"
"${replica[@]}" up -d --wait --wait-timeout 240 db auth
"${replica[@]}" stop auth
# Use the same pg_restore binary as the image's pg_dump, independent of runner packages.
export ARCHIVE_WORK="$work"
export DB_IMAGE
DB_IMAGE=$("${compose[@]}" config --format json | jq -r '.services.db.image')
cat > "$work/pg_restore" <<'SH'
#!/bin/sh
exec docker run --rm -i --user "$(id -u):$(id -g)" -v "$ARCHIVE_WORK:$ARCHIVE_WORK:ro" --entrypoint pg_restore "$DB_IMAGE" "$@"
SH
chmod 700 "$work/pg_restore"
target=("${replica[@]}" exec -T db psql -XqAt -v ON_ERROR_STOP=1 -U supabase_admin -d postgres)
TMPDIR="$work" PATH="$work:$PATH" python3 deploy/aws/restore-sql.py --source fixture "$work/site.dump" | "${target[@]}" >/dev/null
"${target[@]}" < deploy/aws/compare.sql > "$work/after"
"${compose[@]}" exec -T db psql -XqAt -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  < deploy/aws/compare.sql > "$work/before"
diff -u "$work/before" "$work/after"
