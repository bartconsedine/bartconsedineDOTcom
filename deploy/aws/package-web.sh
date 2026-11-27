#!/usr/bin/env bash
# Package a standalone production build from a clean, secret-free ARM64 checkout.
set -euo pipefail
source_dir=$(realpath "${1:?Expected a built checkout}")
archive=$(realpath -m "${2:?Expected a new output zip}")
test ! -e "$archive"
test -f "$source_dir/.next/standalone/server.js"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -RL "$source_dir/.next/standalone/." "$stage/"
cp -R "$source_dir/public" "$stage/public"
cp -R "$source_dir/.next/static" "$stage/.next/static"
if find "$stage" \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \) -print -quit | grep -q .; then
  echo 'Release contains an environment or private key file' >&2
  exit 1
fi
cat > "$stage/run.sh" <<'SH'
#!/bin/sh
export HOSTNAME=0.0.0.0
exec node server.js
SH
chmod 755 "$stage/run.sh"
cd "$stage"
zip -q -r "$archive" .
