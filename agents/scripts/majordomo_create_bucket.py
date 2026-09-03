#!/usr/bin/env python3
"""
Create the Supabase Storage bucket Majordomo's gateway writes
request/response bodies to.

We use Supabase (S3-compatible) instead of AWS S3 — see
context/project/majordomo-integration.md §2 for the rationale and
trade-offs (lifecycle cleanup is the only thing we lose; §2.1 covers
the cron follow-up).

Usage:
    cd agents
    ./.venv/bin/python scripts/majordomo_create_bucket.py
    # custom name (for prod):
    ./.venv/bin/python scripts/majordomo_create_bucket.py --name majordomo-bodies-prod

Idempotent: if the bucket already exists (409), prints "already exists"
and exits 0. Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
agents/.env (or the parent .env files) via dotenv.

The bucket is created PRIVATE — these objects contain LLM prompts and
completions, often tagged with user IDs. Public access would be a
data leak.

After this script: in the Majordomo dashboard's storage form, use the
bucket name printed at the end + the endpoint URL + S3 access keys you
generate at Supabase → Project Settings → Storage → S3 Access Keys.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Make `app.utils.secrets` importable when this script runs from the
# `agents/` directory directly (without `python -m`).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.utils.secrets import resolve as resolve_secret  # noqa: E402


def _load_env() -> None:
    """Walk up from this file looking for .env at every level. Mirrors
    agents/video_intro/__main__.py:_bootstrap_env so secrets resolve
    the same way the orchestrator does."""
    here = Path(__file__).resolve().parent
    for _ in range(8):
        for candidate in (here / "agents" / ".env", here / ".env"):
            if candidate.is_file():
                load_dotenv(candidate, override=False)
        if here.parent == here:
            break
        here = here.parent


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Create a private Supabase Storage bucket for Majordomo bodies."
    )
    parser.add_argument(
        "--name",
        default="majordomo-bodies-staging",
        help="Bucket name (default: majordomo-bodies-staging). For prod, pass --name majordomo-bodies-prod.",
    )
    parser.add_argument(
        "--public",
        action="store_true",
        help="Create as a public bucket. DEFAULT IS PRIVATE — only use --public if you really know why.",
    )
    args = parser.parse_args(argv)

    _load_env()
    # SUPABASE_URL is a non-secret config string. The service-role key
    # is a true secret. Both come from agents/.env, which is populated
    # by `vault sync` (see agents/app/utils/secrets.py).
    supabase_url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    service_key = resolve_secret("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print(
            "✗ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. "
            "Run `vault sync athena-agent -e development -f agents/.env` "
            "to pull the latest secrets into the local .env file, then retry.",
            file=sys.stderr,
        )
        return 2

    # Use httpx (already a transitive dep via fastapi / anthropic /
    # supabase). Lazy import so the help/dry-path don't pay the cost.
    import httpx

    api = f"{supabase_url}/storage/v1/bucket"
    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": "application/json",
    }
    payload = {
        "id": args.name,
        "name": args.name,
        "public": args.public,
    }

    print(f"→ POST {api}")
    print(f"  bucket: {args.name} (public={args.public})")
    response = httpx.post(api, headers=headers, json=payload, timeout=15.0)

    if response.status_code in (200, 201):
        body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        print(f"✓ created bucket {args.name!r}")
        if body:
            print(f"  response: {json.dumps(body, indent=2)}")
        _print_next_steps(supabase_url, args.name)
        return 0

    # Supabase Storage signals "bucket already exists" as 400 (or
    # occasionally 409) with `error: "Duplicate"` in the body. Both
    # shapes mean we can keep going. (Real 4xx errors — auth, invalid
    # name, etc. — have a different `error` value.)
    try:
        body = response.json()
    except Exception:
        body = None

    if (
        response.status_code == 409
        or (isinstance(body, dict) and body.get("error") == "Duplicate")
    ):
        print(f"✓ bucket {args.name!r} already exists (idempotent run)")
        _print_next_steps(supabase_url, args.name)
        return 0

    print(
        f"✗ unexpected response {response.status_code} from Supabase Storage API",
        file=sys.stderr,
    )
    if body is not None:
        print(f"  body: {json.dumps(body, indent=2)}", file=sys.stderr)
    else:
        print(f"  body: {response.text[:500]!r}", file=sys.stderr)
    return 1


def _print_next_steps(supabase_url: str, bucket: str) -> None:
    """Emit the dashboard config the operator needs to paste into Majordomo."""
    # Extract the project ref so we can build the S3 endpoint URL.
    # SUPABASE_URL is `https://<ref>.supabase.co` — split on `.`.
    project_ref = supabase_url.replace("https://", "").split(".", 1)[0]
    endpoint = f"https://{project_ref}.supabase.co/storage/v1/s3"

    print()
    print("─" * 64)
    print("NEXT STEPS — paste into the Majordomo dashboard")
    print("─" * 64)
    print(f"Provider     : S3")
    print(f"Bucket       : {bucket}")
    print(f"Region       : us-east-1")
    print(f"Endpoint     : {endpoint}")
    print(f"Access Key ID + Secret:")
    print(f"  Generate in Supabase:")
    print(f"    https://supabase.com/dashboard/project/{project_ref}/settings/storage")
    print(f"  → 'S3 Access Keys' → 'New access key'")
    print(f"  Scope it to bucket: {bucket}")
    print(f"  Then paste the generated values into Majordomo's storage form.")
    print()
    print("Plan doc: context/project/majordomo-integration.md §2")


if __name__ == "__main__":
    sys.exit(main())
