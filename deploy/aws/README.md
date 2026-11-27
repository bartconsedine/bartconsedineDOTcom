# Move bartconsedine.com to AWS

The destination runs Next.js, Caddy, PostgreSQL 17, GoTrue and PostgREST on one Lightsail instance. It preserves the existing Google identity UUIDs, SQL functions, RLS, app grants and JSON revision checks. The Supabase client libraries speak to this site's own HTTPS endpoint. AWS operates the infrastructure and the operator patches the host and containers. A host failure takes the site and database offline until recovery.

## Size and cost

Start in US East with the 2 GB Linux IPv4 bundle, 60 GB disk, an attached static address and builds performed off-host. The bundle costs $12/month. Automatic snapshots add $0.05 per stored GB-month. The existing domain publishes CAA records. Use a standard Route 53 hosted zone at $0.50/month plus DNS queries to preserve those records. Domain renewal, taxes, overages and retained backups can add cost. For example, 10 GB of billed snapshots brings the estimate to $13/month before those extras. Measure memory, swapping, disk space, burst capacity and response latency during the rehearsal. Resize only if measured load warrants it. [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/). [Route 53 pricing](https://aws.amazon.com/route53/pricing/).

## Prepare the host and release

1. Verify the AWS profile with `aws sts get-caller-identity`, the intended account and region, and an existing regional Lightsail SSH key. Check the active bundle and blueprint with `aws lightsail get-bundles` and `aws lightsail get-blueprints`. From the repo root, create the stack using the command below. It provisions a billable host and snapshots. DNS is a later step. The template retains the host on stack removal to preserve its database. Retained resources continue billing.
2. Wait for cloud-init to finish on the host. Build the site on an amd64 builder for the Lightsail host using the tested release commit. Load the image over verified SSH and install the matching tracked `deploy/aws` directory in `/opt/bart-site`. Verify the server host key using a trusted account channel before transferring anything private.
3. On the host, run `sudo python3 /opt/bart-site/generate-db-env.py /etc/bart-site/database.env` once. Keep a protected recovery copy. The generator exclusively creates the file, produces independent role passwords and signs an anonymous API key. The app receives only the anonymous key. Schedule renewal of that key before its five-year expiry.
4. Securely create `/etc/bart-site/site.env` with mode 0600 using the settings below. Transfer existing Google OAuth credentials, the cron secret and any enabled personal-chat encryption key over a private channel. Preserve the encryption key byte-for-byte for historical messages. Keep production secrets off the build machine, out of the checkout, and out of CI logs. Preserve existing flag values. Configure the Google client with the AWS callback `https://<SITE_HOST>/auth/v1/callback` while retaining the source callback during rehearsal. Compare provider settings, redirect allowlists and scopes with production.
5. Use the Compose invocation below on the host. Start `db auth rest` first to initialize native schemas. Restore into the isolated instance before exposing the site. Start `edge` for a rehearsal on a dedicated hostname with a trusted certificate. Use new keys for staging and production. Caddy manages certificates for both configured names. Only 80/443 are published by Compose, while AWS permits SSH from the supplied /32.

```sh
aws cloudformation deploy --region us-east-1 --stack-name bart-site \
  --template-file deploy/aws/host.yaml \
  --parameter-overrides OperatorCidr="$OPERATOR_CIDR" KeyPair="$LIGHTSAIL_KEY_PAIR"

release=$(git rev-parse HEAD)
docker buildx build --platform linux/amd64 --load -f deploy/aws/site.Dockerfile -t "bart-site:$release" .
set -o pipefail
docker save "bart-site:$release" | gzip | ssh "$SITE_SSH" 'gunzip | sudo docker load'
git archive "$release" deploy/aws | ssh "$SITE_SSH" \
  'sudo mkdir -p /opt/bart-site && sudo tar -xf - -C /opt/bart-site --strip-components=2'
```

| Runtime setting | Value |
| --- | --- |
| SITE_IMAGE | Exact local image tag, e.g. bart-site followed by a colon and the full tested Git SHA |
| SITE_HOST, WWW_HOST | Rehearsal names initially. For production use bartconsedine.com and www.bartconsedine.com |
| GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | Existing Google web OAuth client |
| CRON_SECRET | Existing shared GitHub Actions bearer credential |
| ADMIN_QR_ENABLED | Current production value |
| ROBOT_PARTY_PERSONAL_ENABLED, ROBOT_PARTY_PERSONAL_KEY | Current flag and matching encryption key for the saved ciphertext |

```sh
# Bash on the verified host
stack=(sudo docker compose -f /opt/bart-site/compose.yaml
  --env-file /etc/bart-site/database.env --env-file /etc/bart-site/site.env)
"${stack[@]}" up -d --wait db auth rest
```

## Rehearse the restore

Keep the source authoritative until the final write freeze. Confirm a completed recovery point and use a private backup directory outside Git. The project migration workflow holds the source credential in a protected GitHub environment. A secret listed there cannot be retrieved through GitHub. Use the original protected credential or a reviewed export job bound to that environment and the verified AWS destination. Never export private rows through chat, public Actions artifacts or PRs.

1. Record source schema, roles, extensions, object counts, publications, scheduled jobs, custom Auth triggers, active provider settings and Edge Functions. Repeat immediately before cutover. If Storage contains files, copy each object's bytes and metadata and compare checksums. If Vault holds secrets, plan for its encryption key. Include newly discovered services in the rehearsal.
2. On the frozen source, run the [existing backup tooling](../../docs/DATABASE_MIGRATIONS_AND_BACKUPS.md) with the protected connection and backup directory. It emits a full custom-format archive and a checksum manifest. Use a matching or newer pg_restore client. Keep both files encrypted in transit and at rest. Compare the hosted Auth table and column definitions against the destination initialized by GoTrue. Inventory custom database roles, extension dependencies, Auth schema customizations and role grants against the prepared target. Resolve differences before restoring. [Provider migration considerations](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
3. Use `restore-sql.py` with the archive **and its adjacent manifest**. It checks the project and SHA-256, preserves application schemas, grants, policies, private Prisma and Supabase migration ledgers, and imports Auth data into the initialized Auth schema. The destination retains its own Auth service migrations and role passwords. The import runs in a single transaction and checks the destination marker and empty app state. Only use a trusted site backup. Incompatible populated tables or missing roles require reconciliation. Test this exact operation against an isolated target before final cutover. The generator requires Python 3.11+ and pg_restore on the private archive machine.

```sh
# On the target, fence access and stop the services that can change rows.
"${stack[@]}" stop edge site auth rest
# On the archive machine with verified SSH access to that target:
set -o pipefail
python3 deploy/aws/restore-sql.py "$ARCHIVE" | ssh "$SITE_SSH" \
  'sudo docker compose -f /opt/bart-site/compose.yaml --env-file /etc/bart-site/database.env --env-file /etc/bart-site/site.env exec -T db psql -Xq -v ON_ERROR_STOP=1 -U supabase_admin -d postgres' \
  > "$PRIVATE_DIR/restore.log" 2>&1
```

4. Run the following comparison on the quiescent source and destination. Differences require explanation and reconciliation before routing traffic. Check cluster role memberships, migration checksums and storage bytes separately. The manifest includes sequence positions and routine grants. Retain a verified backup away from the host and restore it onto a disposable target once before go-live. Record recovery time and the last restorable transaction.

```sh
umask 077
# Source uses a private libpq service file with strict TLS and the project-specific CA.
PGSERVICE=bart-source psql -XqAt -v ON_ERROR_STOP=1 -f deploy/aws/compare.sql > "$PRIVATE_DIR/source.manifest"
# Run on the isolated destination before starting writers.
"${stack[@]}" exec -T db psql -U postgres -d postgres -XqAt -v ON_ERROR_STOP=1 \
  < /opt/bart-site/compare.sql > "$PRIVATE_DIR/destination.manifest"
# Compare on the same protected machine.
cmp "$PRIVATE_DIR/source.manifest" "$PRIVATE_DIR/destination.manifest"
"${stack[@]}" up -d --wait
```

## Cut over and retire the providers

- Move DNS authority separately from the app cutover. At the registrar (Namecheap at inventory time), retain the registration. Reuse the verified Route 53 public hosted zone, or create one if needed, copy the complete Vercel zone, including mail, TXT, CAA, verification and wildcard records, and retain the current site targets initially. Verify all authoritative answers before changing nameservers. Check DNSSEC/DS at the parent before delegation. Confirm delegation and propagation before relying on Route 53 for changes. Keep the old zone serving throughout the transition. Lower web record TTLs ahead of time.
- Exercise both approved identities, an unapproved identity, protected API denial, cross-user and stale-write rejection, save/reload on a second device, Calendar consent, TV/QR pairing, Robot Party OAuth/MCP and the scheduled TLDR endpoint. Check the Google redirect and reauthentication after changing JWT keys. Verify the encryption key can open existing chat records. Test the reviewed operator commands and a backup restore. Verify that deployment and maintenance both target the same database.
- During cutover, fence **all** old writers including sign-ins, source REST callers, cron, chat operators, paired devices and integrations. Verify the freeze actually rejects writes. Take the final export, restore on the isolated final target, compare again, and keep writes fenced while validating. Update the apex and www records to the attached static IPv4, remove any stale AAAA targets, and configure the final HTTPS names. Check TLS, WWW redirect, login/callbacks, public assets, authenticated desktop/mobile flows, database isolation and cron. Restore writes only on AWS.
- If validation fails before AWS accepts writes, switch traffic to the old site and release only the old write fence. If AWS has accepted writes, freeze both sides and reconcile the delta before switching back. DNS reversal alone can lose changes.
- After the rollback window, verify AWS-only reads/writes, nameservers, scheduled jobs, recovery, app secrets and external callbacks. Remove the legacy Git deployment integration and source-bound jobs, stop the old site and cancel the scoped hosted services after verifying the recovery copy and billing. Track completion in the release record. Preserve unrelated Vercel/Supabase projects and the domain registration.

## Operating after cutover

Configure the SSH alias `bart-site-production` to the verified AWS static IP and pin its host key. Once AWS is authoritative and the source write fence is verified, activate the operator path in a fresh database session with `ALTER DATABASE postgres SET bartsite.operator_active = 'on'`. This setting belongs only on the authoritative destination. Disable it on rehearsal and recovered copies before opening access. The operator needs existing trusted SSH/Docker privileges. The web process retains the anonymous API key and end-user JWT path.

Use `bash deploy/aws/app-data.sh app read <slug> <owner-email>` and `bash deploy/aws/app-data.sh app write <slug> <owner-email> <protected-change-file>` from a verified release checkout. For relational Project Board operations use `board read <owner-email>` or `board write <owner-email> <protected-change-file>`. The wrapper uses the repository's existing contract generators, checks the destination marker, and preserves the owner and revision predicates. Inspect the response and read back saved fields using the same wrapper. Keep output and private change files out of CI logs. [Chat maintenance contracts](../../docs/CHAT_APP_DATA.md)

For site releases, transfer the checked image, update SITE_IMAGE and run the same Compose up command. Keep the previous image for rollback. Before future schema changes, take a fresh backup and rehearse the reviewed Prisma prefix with the production ledger on an isolated restore. The existing source-specific GitHub migration job is bound to the old service. Keep that job disabled after cutover. For AWS operations, open a temporary loopback SSH tunnel in a dedicated terminal. Obtain the database container address from the verified host. This keeps PostgreSQL off the public network.

```sh
db_ip=$(ssh -o StrictHostKeyChecking=yes bart-site-production \
  'id=$(sudo docker compose -f /opt/bart-site/compose.yaml --env-file /etc/bart-site/database.env --env-file /etc/bart-site/site.env ps -q db) && sudo docker inspect --format "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" "$id"')
ssh -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -N \
  -L "127.0.0.1:55432:$db_ip:5432" bart-site-production
```

Supply the matching postgres password in the operator's protected DATABASE_URL for 127.0.0.1:55432/postgres and set BACKUP_DIR to a private, encrypted directory outside Git. Use the pinned Node runtime and dependencies. Run `node deploy/aws/database.mjs state` or `node deploy/aws/database.mjs backup`. Take an off-host backup regularly and before schema changes. For an authorized schema change, set `CONFIRM_AWS_DATABASE_DEPLOY=aws-bart-site` and run `node deploy/aws/database.mjs deploy`. This uses the existing reviewed migration checksums, Prisma ledger, pre-write off-host backup and post-deploy checks. Close the tunnel when finished. AWS-origin backup manifests are labelled `aws-bart-site`. Use `restore-sql.py --source aws` on an isolated initialized recovery host and compare against the snapshot before reactivating writes.
