"""Emit a one-transaction import from this site's verified pg_dump archive.

Only pipe to psql -X -v ON_ERROR_STOP=1 on a fresh destination. Stdout is private.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

SOURCE_PROJECT = "vgsmfbupgydafvotkold"


def archive_list(archive, *filters):
    result = subprocess.run(["pg_restore", "--list", *filters, archive],
                            capture_output=True, text=True, check=True)
    return [line for line in result.stdout.splitlines() if re.match(r"^\d+;", line)]


def restore(archive, fixture):
    manifest = json.loads(Path(str(archive) + ".json").read_text())
    expected = "local-test" if fixture else SOURCE_PROJECT
    with archive.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    if (manifest.get("formatVersion") != 1 or manifest.get("sourceProject") != expected
            or checksum != manifest.get("sha256")):
        raise ValueError("Backup manifest, source project or checksum mismatch")

    # pg_restore -n omits schema creation and schema-level ACLs. Include those
    # archive entries explicitly while reusing the target's built-in public schema.
    app_entries = set(archive_list(archive, "-n", "public", "-n", "private", "-n", "supabase_migrations"))
    selected = []
    for line in archive_list(archive):
        schema = re.search(r" SCHEMA - (private|supabase_migrations) ", line)
        schema_acl = re.search(r" (ACL|COMMENT) - SCHEMA (public|private|supabase_migrations) ", line)
        auth_data = re.search(r" (TABLE DATA|SEQUENCE SET) auth (\S+) ", line)
        if line in app_entries or schema or schema_acl or (auth_data and auth_data[2] != "schema_migrations"):
            selected.append(line)
    required = [" TABLE DATA auth users ", " TABLE DATA auth identities ",
                " TABLE DATA private site_admin ", " TABLE DATA public app_data "]
    if not all(any(entry in line for line in selected) for entry in required):
        raise ValueError("Archive lacks website identities, memberships or app data")

    with tempfile.NamedTemporaryFile(mode="w") as toc:
        toc.writelines(line + "\n" for line in selected)
        toc.flush()
        print("""BEGIN;
DO $guard$
DECLARE
  auth_table regclass;
  occupied boolean;
BEGIN
  IF current_setting('bartsite.restore_target', true) IS DISTINCT FROM 'aws-lightsail'
     OR current_setting('bartsite.operator_active', true) = 'on'
     OR current_database() <> 'postgres'
     OR to_regnamespace('private') IS NOT NULL
     OR to_regnamespace('supabase_migrations') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
    RAISE EXCEPTION 'Requires a fresh initialized AWS website database';
  END IF;
  FOR auth_table IN
    SELECT c.oid::regclass FROM pg_class c
    WHERE c.relnamespace='auth'::regnamespace AND c.relkind IN ('r','p')
      AND c.relname <> 'schema_migrations'
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s)', auth_table) INTO occupied;
    IF occupied THEN RAISE EXCEPTION 'Destination Auth schema already holds records'; END IF;
  END LOOP;
END
$guard$;
SET LOCAL session_replication_role = replica;""", flush=True)
        subprocess.run(["pg_restore", "--use-set-session-authorization", "--use-list", toc.name, "--file=-", archive], check=True)
        # A failed producer closes the psql input with this transaction uncommitted.
        print("COMMIT;")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--fixture", action="store_true", help="require a synthetic local-test manifest")
    args = parser.parse_args()
    if sys.stdout.isatty():
        sys.exit("Pipe the private SQL to the verified target or a protected file")
    restore(args.archive, args.fixture)
