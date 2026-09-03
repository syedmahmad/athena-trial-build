"""
Centralized LLM model factory.

Every code path that creates an LLM client in the agents/ service must
do it via the helpers in this module — never `Claude(...)` /
`OpenAIChat(...)` / `anthropic.Anthropic(...)` directly. Routes 100% of
LLM traffic through the Majordomo gateway so we get cost attribution,
replay, and evals.

Two factory styles, both pre-wired with the gateway base_url + Majordomo
headers:

  - `claude()` / `openai_chat()` — return Agno model instances. Use these
    in agents that consume the Agno framework (the run-time + pre-gen
    agents under `agents/app/run_time/` and `agents/app/pre_generation/`).

  - `anthropic_client()` / `anthropic_async_client()` — return raw
    Anthropic SDK clients (sync / async). Use these in the studio
    surfaces under `agents/app/studio/` which call the SDK directly.

When MAJORDOMO_ENABLED=0 every factory returns a vanilla client that
hits the provider directly. That kill switch exists for incident
response; do NOT use it as a routine bypass.
"""

from __future__ import annotations

import os
from typing import Any, Optional

import anthropic
import openai
from agno.models.anthropic import Claude
from agno.models.openai import OpenAIChat

from app.utils.secrets import resolve as _resolve_secret

# ── Configuration ────────────────────────────────────────────────────────

MAJORDOMO_ENABLED = os.getenv("MAJORDOMO_ENABLED", "1") != "0"
MAJORDOMO_GATEWAY = os.getenv("MAJORDOMO_GATEWAY_URL", "https://gateway.gomajordomo.com")
SERVICE_NAME = os.getenv("MAJORDOMO_SERVICE", "athena-agents")
ENVIRONMENT = os.getenv("MAJORDOMO_ENVIRONMENT") or os.getenv("ENV", "development")


def _majordomo_headers(feature: str, extra: Optional[dict[str, str]] = None) -> dict[str, str]:
    """Build the X-Majordomo-* header set for a request.

    Resolved per-call (not module-level) so a `vault sync` between
    process startup and now still gets picked up — though it requires
    a process restart to actually re-read the .env file, see
    secrets.py for the full story.
    """
    key = _resolve_secret("MAJORDOMO_API_KEY")
    if not key:
        raise RuntimeError(
            "MAJORDOMO_ENABLED=1 but MAJORDOMO_API_KEY is unset. "
            "Run `vault sync athena-agent -e development -f agents/.env` "
            "to pull the latest secrets, then restart the process. Or "
            "export MAJORDOMO_ENABLED=0 to bypass the gateway."
        )
    headers = {
        "X-Majordomo-Key": key,
        "X-Majordomo-Service": SERVICE_NAME,
        "X-Majordomo-Feature": feature,
        "X-Majordomo-Environment": ENVIRONMENT,
    }
    if extra:
        for k, v in extra.items():
            if not k.startswith("X-Majordomo-"):
                k = f"X-Majordomo-{k}"
            headers[k] = v
    return headers


# ── Public factories ─────────────────────────────────────────────────────

def claude(
    id: str = "claude-sonnet-4-6",
    *,
    feature: str,
    metadata: Optional[dict[str, str]] = None,
    **kwargs: Any,
) -> Claude:
    """
    Build an Agno Claude model pointed at the Majordomo gateway.

    Args:
        id: model id, e.g. "claude-sonnet-4-6"
        feature: required X-Majordomo-Feature tag (e.g. "micro-lesson")
        metadata: extra X-Majordomo-* headers (User-Id, Experiment, ...)
        kwargs: forwarded to Agno's Claude (max_tokens, thinking, ...)
    """
    if not MAJORDOMO_ENABLED:
        return Claude(id=id, **kwargs)

    headers = _majordomo_headers(feature, metadata)
    # Anthropic SDK constructs /v1/messages itself — base_url has no /v1 suffix.
    client_params = {"base_url": MAJORDOMO_GATEWAY, **kwargs.pop("client_params", {})}
    return Claude(
        id=id,
        client_params=client_params,
        default_headers=headers,
        **kwargs,
    )


def openai_chat(
    id: str = "gpt-4o-mini",
    *,
    feature: str,
    metadata: Optional[dict[str, str]] = None,
    **kwargs: Any,
) -> OpenAIChat:
    """
    Build an Agno OpenAIChat model pointed at the Majordomo gateway.

    The OpenAI SDK expects the /v1 prefix in base_url; the Anthropic SDK does not.

    The gateway PROXIES the client's Authorization header to OpenAI — it
    does not substitute a Steward-side OpenAI key. So OPENAI_API_KEY has
    to be present in env the same way ANTHROPIC_API_KEY is (vault sync →
    agents/.env → dotenv → os.environ). See plan §4 of
    context/project/majordomo-integration.md for the design rationale.

    Agno validates the key at construction time, before any request — so
    a missing key fails loud at startup with a vault-sync hint instead of
    a confusing OpenAI 401 later.
    """
    if not MAJORDOMO_ENABLED:
        return OpenAIChat(id=id, **kwargs)

    openai_key = _resolve_secret("OPENAI_API_KEY")
    if not openai_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to the athena-agent vault "
            "collection, then run "
            "`vault sync athena-agent -e development -f agents/.env` "
            "and restart the process. The Majordomo gateway proxies the "
            "client's OpenAI key — there is no Steward-side fallback."
        )

    headers = _majordomo_headers(feature, metadata)
    base = MAJORDOMO_GATEWAY.rstrip("/") + "/v1"
    client_params = {"base_url": base, **kwargs.pop("client_params", {})}
    return OpenAIChat(
        id=id,
        api_key=kwargs.pop("api_key", openai_key),
        client_params=client_params,
        default_headers=headers,
        **kwargs,
    )


def openai_image_client(
    *,
    feature: str,
    metadata: Optional[dict[str, str]] = None,
    **kwargs: Any,
) -> openai.OpenAI:
    """
    Build a raw OpenAI Python SDK client pointed at the Majordomo gateway
    for image generation (`client.images.generate(...)`).

    Agno does not wrap OpenAI's image endpoints, so callers use this raw
    client directly.

    IMPORTANT — the X-Majordomo-Provider header is REQUIRED here. The
    gateway infers the upstream provider from the request PATH for its
    well-known routes (/v1/chat/completions, /v1/messages, ...), but it
    does NOT recognize /v1/images/generations and rejects it with a 400
    ("unrecognized request path") unless the provider is declared
    explicitly. Setting `X-Majordomo-Provider: openai` makes the gateway
    forward the images path straight to OpenAI while still attributing
    cost/usage — so we keep the gateway invariant instead of bypassing it.

    Like `openai_chat()`, the gateway forwards the caller's
    Authorization header — there is no Steward-side OpenAI key.
    """
    if not MAJORDOMO_ENABLED:
        return openai.OpenAI(**kwargs)

    openai_key = _resolve_secret("OPENAI_API_KEY")
    if not openai_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to the athena-agent vault "
            "collection, then run "
            "`vault sync athena-agent -e development -f agents/.env` "
            "and restart the process."
        )

    headers = _majordomo_headers(feature, metadata)
    # Declare the provider so the gateway proxies the (path-unrecognized)
    # images endpoint to OpenAI. Without this the call 400s. See docstring.
    headers["X-Majordomo-Provider"] = "openai"
    base = MAJORDOMO_GATEWAY.rstrip("/") + "/v1"
    return openai.OpenAI(
        api_key=kwargs.pop("api_key", openai_key),
        base_url=base,
        default_headers=headers,
        **kwargs,
    )


def anthropic_client(
    *,
    feature: str,
    metadata: Optional[dict[str, str]] = None,
    **kwargs: Any,
) -> anthropic.Anthropic:
    """
    Build a raw Anthropic SDK (sync) client pointed at the Majordomo
    gateway. Use this in code paths that hit `anthropic.Anthropic()`
    directly — e.g. the studio surfaces that don't go through Agno.

    Args:
        feature: required X-Majordomo-Feature tag (e.g. "studio-pov")
        metadata: extra X-Majordomo-* headers (User-Id, Experiment, ...)
        kwargs: forwarded to anthropic.Anthropic() (timeout, max_retries, ...)
    """
    if not MAJORDOMO_ENABLED:
        return anthropic.Anthropic(**kwargs)

    headers = _majordomo_headers(feature, metadata)
    # Anthropic SDK appends /v1/messages itself — base_url has no /v1.
    return anthropic.Anthropic(
        base_url=MAJORDOMO_GATEWAY,
        default_headers=headers,
        **kwargs,
    )


def anthropic_async_client(
    *,
    feature: str,
    metadata: Optional[dict[str, str]] = None,
    **kwargs: Any,
) -> anthropic.AsyncAnthropic:
    """
    Build a raw Anthropic SDK async client pointed at the Majordomo
    gateway. Same shape as `anthropic_client()`, but returns the async
    flavour used by `anthropic.AsyncAnthropic()` call sites (the
    streaming + tool-use paths under agents/app/studio/).
    """
    if not MAJORDOMO_ENABLED:
        return anthropic.AsyncAnthropic(**kwargs)

    headers = _majordomo_headers(feature, metadata)
    return anthropic.AsyncAnthropic(
        base_url=MAJORDOMO_GATEWAY,
        default_headers=headers,
        **kwargs,
    )
