# `agents/app/utils/`

Shared utilities for the agents service. Two modules today:

- `db.py` — Supabase client constructor (`client()`).
- `llm_client.py` — the **only** sanctioned place to construct LLM clients.

## `secrets.py` — the secret-resolution rule

Athena's secrets live in **super{vault}** (sibling repo at `~/secrets/`, hosted dashboard at <https://secrets.sset.dev>, CLI binary `vault`). The agents service uses the `athena-agent` collection. They're pulled into `agents/.env` on demand via:

```bash
vault sync athena-agent -e development -f agents/.env
```

That writes the collection's key/value pairs into `agents/.env`. Then `dotenv` (called by `_bootstrap_env` in `video_intro/__main__.py` and by `main.py` on FastAPI startup) loads them into `os.environ`. Code reads them via `secrets.resolve("ENV_NAME")`.

> One collection for all envs for now — `-e development` is the canonical env. We'll split into staging / prod envs inside the same collection when we need them; the code paths already work the same way.

### Why a thin wrapper instead of `os.environ.get()`

1. **Empty-string protection.** Some sandboxes (Claude Code's bash tool) wipe sensitive env vars to `""` rather than removing them. `resolve()` treats `""` as unset.
2. **Helpful error messages.** `require("MAJORDOMO_API_KEY")` raises with a message that points the operator at the exact `vault sync` command — better than `None` crashing 5 frames deep.
3. **Future provider switching.** If we replace super{vault} with something else (Doppler, AWS Secrets Manager), the change stays in `secrets.py`.

### Two functions

```python
from app.utils.secrets import resolve, require

# Returns None if unset
key = resolve("MAJORDOMO_API_KEY")

# Raises with a "run vault sync ..." hint if unset
key = require("MAJORDOMO_API_KEY")
```

### Verify a secret resolved

```bash
cd agents && ./.venv/bin/python -m app.utils.secrets MAJORDOMO_API_KEY
# → "MAJORDOMO_API_KEY: set (len=50)"   or "unset"
```

Add `--value` to print the actual value (use with care; bypasses the masking).

### Production override

In prod (Northflank / Render), env vars set in the runtime secret store win — no `vault sync` step needed. The same code paths work in both worlds; vault is the dev-side ergonomics layer.

### Why we don't put secrets in `agents/.env` by hand

The `.env` file is gitignored, but plaintext on disk. `vault sync` is idempotent + lets us rotate keys centrally + lets us share secrets across the team with role-based access (member / admin / owner — see the secrets repo's CLAUDE.md). Hand-editing `.env` works but bypasses all of that.

---

## `llm_client.py` — the LLM client rule

Every LLM call in this codebase flows through Majordomo (`gomajordomo.com`) for cost attribution, replay, and evals. The integration is opt-in at the SDK level: each client is constructed with a gateway `base_url` and an `X-Majordomo-Key` header. To keep that wiring uniform — and to make sure no future code path quietly skips it — **all client construction goes through this module**.

### The rule

```
No file outside agents/app/utils/llm_client.py may
   import `agno.models.anthropic.Claude`,
   import `agno.models.openai.OpenAIChat`,
   call  `anthropic.Anthropic(...)`,
or  call  `anthropic.AsyncAnthropic(...)`.
```

You can grep this any time:

```bash
grep -rn 'from agno.models\|anthropic\.Anthropic\|anthropic\.AsyncAnthropic' agents/app/
# Should print exactly one file:
#   agents/app/utils/llm_client.py
```

### Four factories

| Caller type | Use this | Returns |
|---|---|---|
| Agno agent with a Claude model | `claude(id=..., feature=...)` | `agno.models.anthropic.Claude` |
| Agno agent with an OpenAI model | `openai_chat(id=..., feature=...)` | `agno.models.openai.OpenAIChat` |
| Raw Anthropic SDK, sync | `anthropic_client(feature=...)` | `anthropic.Anthropic` |
| Raw Anthropic SDK, async | `anthropic_async_client(feature=...)` | `anthropic.AsyncAnthropic` |

The `feature=` kwarg is required and tags the request in the Majordomo dashboard. Use the canonical tags from `context/project/majordomo-integration.md` §4.

### Per-request metadata (User-Id, Topic, etc.)

Pass it via `metadata={...}` — the helper prefixes each key with `X-Majordomo-` and merges into `default_headers`:

```python
ai = anthropic_async_client(
    feature="studio-quiz",
    metadata={
        "User-Id": clerk_user_id,   # opaque, no PII
        "Topic": topic_slug,
    },
)
```

### Kill switch

Set `MAJORDOMO_ENABLED=0` to bypass the gateway entirely — each factory returns a vanilla client wired to the provider directly. Production keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) stay the source of truth; the gateway only proxies. Use this for incident response, not as a routine bypass.

### See also

- `context/project/majordomo-integration.md` — the full integration plan (rollout phases, dashboard config, env vars).
- [Majordomo docs — Request Headers](https://docs.gomajordomo.com/reference/headers).
