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
trap '"${compose[@]}" down -v --remove-orphans >/dev/null; rm -rf "$work"' EXIT
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
