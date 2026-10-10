#!/bin/bash
set +x +v
set +o history
trap - DEBUG RETURN
unset HISTFILE BASH_ENV ENV NODE_OPTIONS NODE_EXTRA_CA_CERTS NODE_TLS_REJECT_UNAUTHORIZED
unset DATABASE_PASSWORD DATABASE_URL RESTORE_DATABASE_URL CONFIRM_HOSTED_MIGRATION CONFIRM_MIGRATION_ACTION CONFIRM_RECOVERY_POINT BACKUP_DIR
umask 077
ulimit -c 0

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || exit 1
node_bin="$(command -v node)"
[[ -x "$node_bin" ]] || node_bin="$HOME/.local/bin/node"
if [[ ! -x "$node_bin" ]] || ! "$node_bin" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  printf '[startup/NODE] Node 22 or newer is required. No credential was requested.\n'
  exit 1
fi
export PATH="$(dirname -- "$node_bin"):$PATH"
if [[ -z "${PG_BIN_DIR:-}" && -x /opt/homebrew/opt/libpq@17/bin/pg_dump ]]; then
  export PG_BIN_DIR='/opt/homebrew/opt/libpq@17/bin'
fi
[[ -t 0 && -t 1 ]] || { printf 'Open this file in your own Mac Terminal.\n'; exit 1; }
tty_state="$(stty -g)" || exit 1
trap 'stty "$tty_state"; unset DATABASE_PASSWORD DATABASE_URL BACKUP_DIR CONFIRM_HOSTED_MIGRATION CONFIRM_MIGRATION_ACTION CONFIRM_RECOVERY_POINT; printf "\nCredential cleared from this process.\n"' EXIT
trap 'exit 130' INT TERM HUP
printf '\033]0;Private Prisma migration — bartconsedine.com\007'
printf '%s\n' 'PRIVATE PRISMA MIGRATION — bartconsedine.com' \
  'Paste ONLY your existing database password below, then press Return.' \
  'Input will not appear. Do not paste into chat.' \
  'Destination: the verified Direct endpoint for project vgsmfbupgydafvotkold, port 5432.' \
  'Special characters are encoded internally. Do not add quotes or a URL.' \
  'This separate launcher can adopt the existing baseline and deploy reviewed migrations after confirmation and a fresh backup. It cannot enroll anyone.'
stty -echo || exit 1
IFS= read -r -s -p 'Database password (hidden): ' DATABASE_PASSWORD || exit 1
stty "$tty_state" || exit 1
printf '\n'
export DATABASE_PASSWORD
if ! "$node_bin" "$script_dir/private-database-migrate.mjs" validate-target; then
  unset DATABASE_PASSWORD DATABASE_URL
  read -r -p 'Share only the bracketed stage/code if needed. Press Return to close. ' ignored
  exit 1
fi
while true; do
  printf '\n%s\n' '1 — Inspect migration state (read-only)' \
    '2 — Adopt the verified existing baseline (fresh backup, then history marker only)' \
    '3 — Deploy the reviewed pending migration (fresh backup first)' \
    'q — Clear the credential and exit'
  read -r -p 'Choose 1, 2, 3, or q: ' choice || exit 0
  case "$choice" in
    1) "$node_bin" "$script_dir/private-database-migrate.mjs" state || exit 1 ;;
    2|3)
      if [[ "$choice" == 2 ]]; then action=adopt; phrase='ADOPT vgsmfbupgydafvotkold'; else action=deploy; phrase='DEPLOY vgsmfbupgydafvotkold'; fi
      printf '%s\n' 'This writes only the reviewed Prisma history/schema. It does not grant admin membership.'
      IFS= read -r -p "Type $phrase to continue, or Return to cancel: " confirmed || exit 0
      [[ "$confirmed" == "$phrase" ]] || { printf 'Cancelled; no database command ran.\n'; continue; }
      default_backup="$HOME/.local/share/bartconsedine/database-backups"
      IFS= read -r -p "Protected backup directory [$default_backup]: " BACKUP_DIR || exit 0
      BACKUP_DIR="${BACKUP_DIR:-$default_backup}"
      printf '%s\n' 'Before proceeding, verify the completed backup/recovery point and recovery prerequisites in the database runbook.' \
        'If the backup failed or the recovery point is unavailable, stop here.'
      IFS= read -r -p 'Type READY only after that verification, or Return to cancel: ' recovery || exit 0
      [[ "$recovery" == READY ]] || { unset BACKUP_DIR; printf 'Cancelled; no database command ran.\n'; continue; }
      export BACKUP_DIR CONFIRM_HOSTED_MIGRATION=vgsmfbupgydafvotkold CONFIRM_RECOVERY_POINT=vgsmfbupgydafvotkold
      export CONFIRM_MIGRATION_ACTION="$action"
      "$node_bin" "$script_dir/private-database-migrate.mjs" "$action" || exit 1
      unset BACKUP_DIR CONFIRM_HOSTED_MIGRATION CONFIRM_MIGRATION_ACTION CONFIRM_RECOVERY_POINT
      ;;
    q|Q) exit 0 ;;
    *) printf 'Choose 1, 2, 3, or q.\n' ;;
  esac
done
