"""Create fresh database/API credentials in a new private file, outside the checkout."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sys
import time


def jwt_part(value):
    data = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def create(path):
    if path.resolve().is_relative_to(Path(__file__).resolve().parents[2]):
        raise ValueError("Choose a protected destination outside the checkout")
    values = {key: secrets.token_hex(32) for key in (
        "POSTGRES_PASSWORD", "AUTH_DB_PASSWORD", "REST_DB_PASSWORD", "JWT_SECRET"
    )}
    now = int(time.time())
    payload = {"role": "anon", "iss": "bart-site", "iat": now, "exp": now + 5 * 365 * 86400}
    message = jwt_part({"alg": "HS256", "typ": "JWT"}) + b"." + jwt_part(payload)
    signature = hmac.digest(values["JWT_SECRET"].encode(), message, hashlib.sha256)
    values["ANON_KEY"] = (message + b"." + base64.urlsafe_b64encode(signature).rstrip(b"=")).decode()
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as target:
        for name, value in values.items():
            target.write(f"{name}={value}\n")


if __name__ == "__main__":
    create(Path(sys.argv[1]))
