"""Connect the site's downloaded Google web OAuth client to its existing Cognito pool."""
import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("google_client", type=Path)
parser.add_argument("--aws", default="aws", help="Authenticated AWS CLI executable")
args = parser.parse_args()
region = "us-east-1"


def aws(*command):
    result = subprocess.run([args.aws, "--region", region, *command, "--output", "json"],
                            check=True, text=True, stdout=subprocess.PIPE)
    return json.loads(result.stdout) if result.stdout.strip() else None


with os.fdopen(os.open(args.google_client, os.O_RDONLY | os.O_NOFOLLOW), "r") as stream:
    info = os.fstat(stream.fileno())
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise SystemExit("Use a private regular file owned by the current user (mode 0600).")
    client = json.load(stream)["web"]

identity = aws("sts", "get-caller-identity")
stack = aws("cloudformation", "describe-stacks", "--stack-name", "bart-site-auth")["Stacks"][0]
outputs = {row["OutputKey"]: row["OutputValue"] for row in stack["Outputs"]}
redirect = f"https://bart-site-{identity['Account']}.auth.{region}.amazoncognito.com/oauth2/idpresponse"
if outputs.get("GoogleRedirect") != redirect or not client["client_id"].endswith(".apps.googleusercontent.com") or not client["client_secret"]:
    raise SystemExit("AWS target or Google web client does not match this site.")
if redirect not in client.get("redirect_uris", []):
    raise SystemExit("Register the Cognito callback and download the updated Google client.")
if "https://bartconsedine.com/auth/calendar/callback" not in client["redirect_uris"]:
    print("Calendar consent still needs its own registered redirect URI.")
name = "bart-site/google-web-client"
existing = aws("secretsmanager", "list-secrets", "--filters", f"Key=name,Values={name}")["SecretList"]
if any(item["Name"] == name for item in existing):
    arn = next(item["ARN"] for item in existing if item["Name"] == name)
    registered = json.loads(aws("secretsmanager", "get-secret-value", "--secret-id", arn)["SecretString"])
    if any(registered.get(key) != client[key] for key in ("client_id", "client_secret")):
        raise SystemExit("An existing Google credential differs. Review the rotation before replacing it.")
else:
    with tempfile.NamedTemporaryFile(mode="w") as secret:
        json.dump({key: client[key] for key in ("client_id", "client_secret")}, secret)
        secret.flush()
        arn = aws("secretsmanager", "create-secret", "--name", name, "--secret-string", "file://" + secret.name)["ARN"]
subprocess.run([args.aws, "--region", region, "cloudformation", "deploy", "--stack-name", "bart-site-auth",
                "--template-file", str(Path(__file__).with_name("cognito.yaml")),
                "--parameter-overrides", "GoogleSecret=" + arn, "--no-fail-on-empty-changeset"], check=True)
providers = aws("cognito-idp", "list-identity-providers", "--user-pool-id", outputs["PoolId"])["Providers"]
if not any(item["ProviderName"] == "Google" for item in providers):
    raise SystemExit("Google provider was not installed.")
print("Google provider is configured. Interactive sign-in still needs verification.")
