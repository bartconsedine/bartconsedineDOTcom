#!/bin/bash
set +x +v
set +o history
trap - DEBUG RETURN
unset HISTFILE BASH_ENV ENV NODE_OPTIONS NODE_EXTRA_CA_CERTS NODE_TLS_REJECT_UNAUTHORIZED
unset DATABASE_URL RESTORE_DATABASE_URL CONFIRM_HOSTED_MIGRATION
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
trap 'stty "$tty_state"; unset DATABASE_URL BACKUP_DIR; printf "\nCredential cleared from this process.\n"' EXIT
trap 'exit 130' INT TERM HUP
printf '\033]0;Private database connection — bartconsedine.com\007'
printf '%s\n' 'PRIVATE DATABASE CONNECTION — bartconsedine.com' \
  'Paste the full PostgreSQL URL at the hidden prompt below, then press Return.' \
  'Input will not appear. Do not paste into chat.' \
  'Use the existing project vgsmfbupgydafvotkold, port 5432, with its existing password.' \
  'Paste only the URL: no quotes, DATABASE_URL= prefix, or shell command.' \
  'This launcher can check the connection or create a backup. It cannot migrate or enroll anyone.'
stty -echo || exit 1
IFS= read -r -s -p 'Database URL (hidden): ' DATABASE_URL || exit 1
stty "$tty_state" || exit 1
printf '\n'
export DATABASE_URL
if ! "$node_bin" "$script_dir/private-database-check.mjs" validate-target; then
  unset DATABASE_URL
  read -r -p 'Share only the bracketed stage/code if needed. Press Return to close. ' ignored
  exit 1
fi
while true; do
  printf '\n%s\n' '1 — Check connection and existing baseline (read-only)' \
    '2 — Create a logical backup in a protected directory you select' \
    'q — Clear the credential and exit'
  read -r -p 'Choose 1, 2, or q: ' choice || exit 0
  case "$choice" in
    1) "$node_bin" "$script_dir/private-database-check.mjs" baseline-check ;;
    2)
      printf '%s\n' 'Use an existing private directory outside Git and temporary folders, permissions 0700.'
      IFS= read -r -p 'Absolute backup directory: ' BACKUP_DIR || exit 0
      export BACKUP_DIR
      "$node_bin" "$script_dir/private-database-check.mjs" backup
      unset BACKUP_DIR
      ;;
    q|Q) exit 0 ;;
    *) printf 'Choose 1, 2, or q.\n' ;;
  esac
done
