import { supabase } from "@/lib/supabase/client";
import type { CachedReportPayload } from "./types";

const TTL_MS = 5 * 60 * 1000;

/**
 * Supabase-backed payload cache for the PDF report pipeline.
 *
 * Why Postgres instead of an in-memory Map: the writer (API
 * route) and the reader (server component) end up in separate
 * module evaluations in Next.js dev with Turbopack, fragmenting
 * a top-level Map into multiple independent maps. A Postgres
 * unlogged table is process-independent and also survives the
 * move to multi-replica deployments.
 *
 * The table is UNLOGGED (no WAL writes) per the migration — we
 * accept loss on Postgres crash because tokens are short-lived
 * and a failed report just needs to be re-clicked.
 *
 * The Supabase generated types don't yet include this table, so
 * we cast the client through `unknown` once per call site —
 * matching the established pattern in `src/lib/db/queries/`
 * (see e.g. `tracking.ts`) until the types are regenerated.
 */

type ReportPayloadsClient = {
  from: (t: "report_payloads") => {
    insert: (r: {
      id: string;
      user_id: string;
      payload: CachedReportPayload;
      expires_at: string;
    }) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (k: "id", v: string) => {
        gt: (k: "expires_at", v: string) => {
          select: (cols: "payload") => {
            maybeSingle: () => Promise<{
              data: { payload: CachedReportPayload } | null;
              error: unknown;
            }>;
          };
        };
      };
      lt: (k: "expires_at", v: string) => Promise<{ error: unknown }>;
      gte: (k: "expires_at", v: string) => Promise<{ error: unknown }>;
    };
    select: (cols: "payload") => {
      eq: (k: "id", v: string) => {
        gt: (k: "expires_at", v: string) => {
          maybeSingle: () => Promise<{
            data: { payload: CachedReportPayload } | null;
            error: unknown;
          }>;
        };
      };
    };
  };
};

function client(): ReportPayloadsClient {
  return supabase as unknown as ReportPayloadsClient;
}

export async function putCachedReportPayload(
  payloadId: string,
  payload: CachedReportPayload
): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const { error } = await client().from("report_payloads").insert({
    id: payloadId,
    user_id: payload.userId,
    payload,
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  // Best-effort cleanup of expired rows — keeps the table tiny
  // without needing a pg_cron job. Non-fatal.
  void cleanupExpired();
}

/** Single-use: atomic DELETE ... RETURNING so a second lookup
 * with the same id misses. */
export async function takeCachedReportPayload(
  payloadId: string
): Promise<CachedReportPayload | null> {
  const nowIso = new Date().toISOString();
  const { data } = await client()
    .from("report_payloads")
    .delete()
    .eq("id", payloadId)
    .gt("expires_at", nowIso)
    .select("payload")
    .maybeSingle();
  return data?.payload ?? null;
}

/** Non-consuming — for tests + the `?demo=` path. */
export async function peekCachedReportPayload(
  payloadId: string
): Promise<CachedReportPayload | null> {
  const nowIso = new Date().toISOString();
  const { data } = await client()
    .from("report_payloads")
    .select("payload")
    .eq("id", payloadId)
    .gt("expires_at", nowIso)
    .maybeSingle();
  return data?.payload ?? null;
}

/** Test-only: drain the table. Guarded against accidental
 * production calls. */
export async function _resetPayloadCache(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("_resetPayloadCache is forbidden in production");
  }
  await client()
    .from("report_payloads")
    .delete()
    .gte("expires_at", "1970-01-01T00:00:00.000Z");
}

async function cleanupExpired(): Promise<void> {
  try {
    await client()
      .from("report_payloads")
      .delete()
      .lt("expires_at", new Date().toISOString());
  } catch {
    // best effort — surface no error
  }
}
