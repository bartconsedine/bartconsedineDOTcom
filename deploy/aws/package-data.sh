#!/usr/bin/env bash
# Build for a pool whose issuer and signing keys were verified through AWS.
set -euo pipefail
pool=${1:?Cognito pool ID required}
zip_path=$(realpath -m "${2:?Expected new output zip}")
[[ "$pool" =~ ^us-east-1_[[:alnum:]]+$ && ! -e "$zip_path" ]]
folder=$(mktemp -d)
trap 'rm -rf "$folder"' EXIT
cd "$folder"
curl --fail --silent --show-error --location --proto '=https' \
  https://github.com/PostgREST/postgrest/releases/download/v16.6/postgrest-v16.6-linux-static-aarch64.tar.xz -o postgrest.tar.xz
echo 'bceeb740e954da0163d9f05fee4355b24af45522ecf9099aacb396400ea8852d  postgrest.tar.xz' | sha256sum --check
tar -xJf postgrest.tar.xz postgrest
curl --fail --silent --show-error "https://cognito-idp.us-east-1.amazonaws.com/$pool/.well-known/jwks.json" -o pool.keys
jq -e '.keys | length > 0 and all(.[]; .kty == "RSA" and .alg == "RS256" and .use == "sig" and (.kid | length > 0))' pool.keys > /dev/null
curl --fail --silent --show-error https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem -o rds.pem
cat > run.sh <<'SH'
#!/bin/sh
# libpq reads PGHOST, PGDATABASE, PGUSER and PGPASSWORD from Lambda settings.
export PGSSLROOTCERT="$LAMBDA_TASK_ROOT/rds.pem" PGSSLMODE=verify-full
export PGRST_JWT_SECRET="@$LAMBDA_TASK_ROOT/pool.keys"
exec "$LAMBDA_TASK_ROOT/postgrest"
SH
chmod 755 postgrest run.sh
zip -q "$zip_path" run.sh postgrest pool.keys rds.pem
