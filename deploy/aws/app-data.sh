#!/usr/bin/env bash
# Trusted operator client for an activated AWS production site.
set -euo pipefail
cd "$(dirname "$0")/../.."
case "${1:-}" in
  app) generator=scripts/app-data-sql.mjs ;;
  board) generator=scripts/project-board-sql.mjs ;;
  *) echo 'Choose app or board followed by the reviewed generator arguments.' >&2; exit 2 ;;
esac
shift
# Only locally validated contract inputs can produce SQL. Never accept SQL on stdin.
query=$(node "$generator" "$@" | jq -er 'select(.project_id == "vgsmfbupgydafvotkold") | .query')
{
  cat <<'SQL'
BEGIN;
SET LOCAL standard_conforming_strings = on;
DO $guard$ BEGIN
  IF current_setting('bartsite.restore_target', true) IS DISTINCT FROM 'aws-lightsail'
     OR current_setting('bartsite.operator_active', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'AWS production operator access has not been activated';
  END IF;
END $guard$;
SQL
  printf '%s\n' "$query" 'COMMIT;'
} | ssh -o BatchMode=yes -o StrictHostKeyChecking=yes bart-site-production \
  'sudo -n docker compose -f /opt/bart-site/compose.yaml --env-file /etc/bart-site/database.env --env-file /etc/bart-site/site.env exec -T db psql -Xq --csv -v ON_ERROR_STOP=1 -U postgres -d postgres'
