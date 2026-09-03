"""
Secret resolution — env-var only.

Athena's secrets are managed by super{vault} (the CLI lives in the
sibling `secrets/` repo, binary name `vault`). The dev workflow is:

    vault login
    vault sync athena-agent -e development -f agents/.env

That writes the collection's key/value pairs into `agents/.env`. From
there, `dotenv` (called by `_bootstrap_env` in
agents/video_intro/__main__.py and by `agents/main.py` on FastAPI
startup) loads them into `os.environ`. Code reads them via this
module's `resolve()` function.

Why a tiny wrapper instead of direct `os.environ.get()`:

  1. **Single chokepoint to enforce non-empty values.** Some sandboxes
     wipe sensitive vars to "" rather than removing them, which fools
     `dotenv(override=False)` and any code that only checks for `None`.
     `resolve()` treats empty strings as unset.

  2. **Helpful error messages.** If a caller asks for a secret and it
     isn't present, we want to point the operator at `vault sync`
     instead of just returning `None` and crashing 5 frames deep.

  3. **Future provider switching.** If we ever back the secret store
     with a different mechanism (Doppler, AWS Secrets Manager,
     whatever), the change is localized to this file.

Production override: in prod (Northflank / Render), env vars set in
the runtime secret store win. No `vault sync` step needed — the
deploy provisions env vars directly. The exact same code paths work.
"""
from __future__ import annotations

import os
import sys
from typing import Optional


def resolve(env_name: str) -> Optional[str]:
    """Return the secret value or `None`. Empty-string values count as
    unset (sandbox workaround — see module docstring)."""
    val = os.environ.get(env_name)
    return val if val else None


def require(env_name: str, *, hint: Optional[str] = None) -> str:
    """Same as `resolve` but raises if the value isn't set, with a
    message that points the operator at `vault sync`."""
    val = resolve(env_name)
    if val:
        return val
    raise RuntimeError(
        f"Required secret `{env_name}` is not set. "
        f"Run `vault sync athena-agent -e development -f agents/.env` "
        f"to pull the latest secrets into the local .env file, then "
        f"restart the process so dotenv re-reads it."
        + (f"\n\nContext: {hint}" if hint else "")
    )


def main(argv: Optional[list[str]] = None) -> int:
    """CLI: `python -m app.utils.secrets <env_name> [--value]`.

    Prints "set" or "unset" (never the value itself) — useful for sanity-
    checking that a secret resolved as expected after a `vault sync`,
    without echoing the secret.
    """
    import argparse

    parser = argparse.ArgumentParser(
        prog="secrets",
        description="Check whether a secret resolved (env-only).",
    )
    parser.add_argument("env_name", help="environment variable name to look up")
    parser.add_argument(
        "--value",
        action="store_true",
        help="Print the resolved value (DO NOT use in scripts; shows the secret).",
    )
    args = parser.parse_args(argv)

    val = resolve(args.env_name)
    if val is None:
        print(f"{args.env_name}: unset")
        return 1
    if args.value:
        print(val)
    else:
        print(f"{args.env_name}: set (len={len(val)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
