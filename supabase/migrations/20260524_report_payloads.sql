-- ===========================================================
-- Report payload cache — ephemeral storage for the PDF report
-- generation pipeline.
--
-- Holds the merged aggregates + Claude analysis between the
-- moment the `/api/reports/pdf` orchestrator finishes building
-- them and the moment Playwright fetches them via the signed
-- token at `/reports/print?t=<token>`. Single-use (consumed on
-- lookup via DELETE ... RETURNING), short TTL (~5 min), no
-- historical value.
--
-- UNLOGGED skips WAL writes — faster, with the tradeoff that
-- rows are lost on Postgres crash. That's the right call here:
-- tokens are short-lived (60s sig TTL, 5-min row TTL) and the
-- client can just retry by clicking "Download report" again.
-- ===========================================================

CREATE UNLOGGED TABLE report_payloads (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL,
  payload    jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_payloads_expires_at ON report_payloads (expires_at);

-- Default-deny RLS. Only the service-role server code (which
-- bypasses RLS) can read/write this table — there is no
-- per-user access pattern.
ALTER TABLE report_payloads ENABLE ROW LEVEL SECURITY;
