# Move bartconsedine.com to AWS

The destination runs Next.js, Caddy, PostgreSQL 17, GoTrue and PostgREST on one Lightsail instance. It preserves the existing Google identity UUIDs, SQL functions, RLS, app grants and JSON revision checks. The Supabase client libraries speak to this site's own HTTPS endpoint. AWS operates the infrastructure and the operator patches the host and containers. A host failure takes the site and database offline until recovery.

## Size and cost

Start in US East with the 2 GB Linux IPv4 bundle, 60 GB disk, an attached static address and builds performed off-host. The bundle costs $12/month. Automatic snapshots add $0.05 per stored GB-month. Lightsail DNS zones are included. Domain renewal, taxes, overages and retained backups can add cost. For example, 10 GB of billed snapshots brings the estimate to $12.50/month before those extras. Measure memory, swapping, disk space, burst capacity and response latency during the rehearsal. Resize only if measured load warrants it. [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/)

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
2. Follow the provider's compatible export for roles, schema and data on a frozen source. Include `auth` data, all `public` and `private` data (including Prisma history), and `supabase_migrations` history. Inspect the resulting archive inventory. Export the latter schema and data separately if excluded by the CLI. Take a separate complete logical backup using the [existing backup tooling](../../docs/DATABASE_MIGRATIONS_AND_BACKUPS.md). Keep the files encrypted in transit and at rest. [Provider restore guide](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
3. Review role mappings, extension versions, grants and schema ownership. Preserve target role credentials and the restricted authenticator membership. The destination owns its Auth migration history. Compare source and target Auth columns before loading Auth rows. Keep foreign keys, identities, owner UUIDs, encryption material and sequence positions. Stop the Auth and REST services during import. Restore the reviewed SQL in one transaction with `ON_ERROR_STOP=1` through the container's local socket into a fresh destination. Do not apply an export to a populated production database or silently skip an incompatible populated table. Never replay the app migration chain over the restored schema.
4. Run the following comparison on the quiescent source and destination. Differences require explanation and reconciliation before routing traffic. Check sequence positions, role memberships, routine grants, migration checksums and storage bytes separately. Retain a verified backup away from the host and restore it onto a disposable target once before go-live. Record recovery time and the last restorable transaction.

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

- Move DNS authority separately from the app cutover. At the registrar (Namecheap at inventory time), retain the registration. Create the Lightsail DNS zone, copy the complete Vercel zone, including mail, TXT, CAA, verification and wildcard records, and retain the current site targets initially. Verify all authoritative answers before changing nameservers. Check DNSSEC/DS at the parent before delegation. Confirm delegation and propagation before relying on Lightsail for changes. Keep the old zone serving throughout the transition. Lower web record TTLs ahead of time.
- Exercise both approved identities, an unapproved identity, protected API denial, cross-user and stale-write rejection, save/reload on a second device, Calendar consent, TV/QR pairing, Robot Party OAuth/MCP and the scheduled TLDR endpoint. Check the Google redirect and reauthentication after changing JWT keys. Verify the encryption key can open existing chat records. Repoint trusted operator access for the reviewed chat-data commands to the AWS database using a private admin channel, and replace the source-specific migration/backup workflow before retiring the hosted connector. Test a guarded read/write and a backup restore. Keep project binding, revision validation and restricted SQL generation intact.
- During cutover, fence **all** old writers including sign-ins, source REST callers, cron, chat operators, paired devices and integrations. Verify the freeze actually rejects writes. Take the final export, restore on the isolated final target, compare again, and keep writes fenced while validating. Update the apex and www records to the attached static IPv4, remove any stale AAAA targets, and configure the final HTTPS names. Check TLS, WWW redirect, login/callbacks, public assets, authenticated desktop/mobile flows, database isolation and cron. Restore writes only on AWS.
- If validation fails before AWS accepts writes, switch traffic to the old site and release only the old write fence. If AWS has accepted writes, freeze both sides and reconcile the delta before switching back. DNS reversal alone can lose changes.
- After the rollback window, verify AWS-only reads/writes, nameservers, scheduled jobs, recovery, app secrets and external callbacks. Remove the legacy Git deployment integration and source-bound jobs, stop the old site and cancel the scoped hosted services after verifying the recovery copy and billing. Track completion in the release record. Preserve unrelated Vercel/Supabase projects and the domain registration.
