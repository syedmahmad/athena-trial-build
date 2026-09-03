import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedReportPayload } from "@/lib/reports/types";

/**
 * Tests the Supabase-backed payload cache by mocking the
 * `@/lib/supabase/client` module. We verify that:
 *   - put issues an insert with the expected shape + TTL
 *   - take issues a delete with both the id filter and the
 *     not-expired filter, and returns the row's payload
 *   - peek issues a select with the same filters, no delete
 * That's enough to pin the contract; behavioral correctness of
 * TTL + single-use is enforced by Postgres itself (the filters
 * + DELETE…RETURNING semantics).
 */

type InsertedRow = {
  id: string;
  user_id: string;
  payload: CachedReportPayload;
  expires_at: string;
};

type CallLog = {
  insert?: InsertedRow;
  deleteFilters?: Record<string, string>;
  selectFilters?: Record<string, string>;
};

const log: CallLog = {};

function makeMockClient(returnPayload: CachedReportPayload | null) {
  return {
    from: (_table: string) => ({
      insert: async (row: InsertedRow) => {
        log.insert = row;
        return { error: null };
      },
      delete: () => {
        const filters: Record<string, string> = {};
        log.deleteFilters = filters;
        const chain = {
          eq: (k: string, v: string) => {
            filters[`eq:${k}`] = v;
            return {
              gt: (k2: string, v2: string) => {
                filters[`gt:${k2}`] = v2;
                return {
                  select: (_cols: string) => ({
                    maybeSingle: async () => ({
                      data: returnPayload ? { payload: returnPayload } : null,
                      error: null,
                    }),
                  }),
                };
              },
            };
          },
          lt: async (k: string, v: string) => {
            filters[`lt:${k}`] = v;
            return { error: null };
          },
          gte: async (k: string, v: string) => {
            filters[`gte:${k}`] = v;
            return { error: null };
          },
        };
        return chain;
      },
      select: (_cols: string) => {
        const filters: Record<string, string> = {};
        log.selectFilters = filters;
        return {
          eq: (k: string, v: string) => {
            filters[`eq:${k}`] = v;
            return {
              gt: (k2: string, v2: string) => {
                filters[`gt:${k2}`] = v2;
                return {
                  maybeSingle: async () => ({
                    data: returnPayload ? { payload: returnPayload } : null,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    }),
  };
}

let mockReturn: CachedReportPayload | null = null;
vi.mock("@/lib/supabase/client", () => ({
  get supabase() {
    return makeMockClient(mockReturn);
  },
}));

const samplePayload: CachedReportPayload = {
  kind: "quiz",
  userId: "user-1",
  generatedAt: new Date().toISOString(),
  aggregates: {
    sessionId: "sess-1",
    topicName: "T",
    subtopicName: "S",
    score: 1,
    totalQuestions: 1,
    timeElapsedSeconds: 0,
    createdAt: new Date().toISOString(),
    accuracy: 1,
    meanResponseTimeMs: null,
    medianResponseTimeMs: null,
    hintRate: 0,
    tutorRate: 0,
    recoveryRate: 0,
    perQuestion: [],
    events: {
      answerWrong: 0,
      hintShown: 0,
      tutorEntered: 0,
      tutorCorrect: 0,
      practiceStarted: 0,
      practiceCorrect: 0,
      practiceExhausted: 0,
    },
    skill: null,
  },
  analysis: {
    headline: "h",
    scoreContext: "c",
    strengths: [],
    growthAreas: [],
    speedInsight: "s",
    nextStepSuggestion: "n",
  },
};

describe("payload-cache (Supabase-backed)", () => {
  beforeEach(() => {
    log.insert = undefined;
    log.deleteFilters = undefined;
    log.selectFilters = undefined;
    mockReturn = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("put inserts with id, user_id, payload, and a +5min expires_at", async () => {
    const { putCachedReportPayload } = await import("@/lib/reports/payload-cache");
    await putCachedReportPayload("pid-a", samplePayload);
    expect(log.insert).toBeDefined();
    expect(log.insert?.id).toBe("pid-a");
    expect(log.insert?.user_id).toBe("user-1");
    expect(log.insert?.payload.userId).toBe("user-1");
    // TTL is 5 min — expires_at should be exactly +5:00 from "now".
    expect(log.insert?.expires_at).toBe("2026-05-24T12:05:00.000Z");
  });

  it("take filters by id + non-expired and returns the payload", async () => {
    mockReturn = samplePayload;
    const { takeCachedReportPayload } = await import("@/lib/reports/payload-cache");
    const result = await takeCachedReportPayload("pid-b");
    expect(result?.userId).toBe("user-1");
    expect(log.deleteFilters?.["eq:id"]).toBe("pid-b");
    expect(log.deleteFilters?.["gt:expires_at"]).toBe("2026-05-24T12:00:00.000Z");
  });

  it("take returns null when nothing comes back", async () => {
    mockReturn = null;
    const { takeCachedReportPayload } = await import("@/lib/reports/payload-cache");
    expect(await takeCachedReportPayload("pid-c")).toBeNull();
  });

  it("peek filters by id + non-expired and does NOT issue a delete", async () => {
    mockReturn = samplePayload;
    const { peekCachedReportPayload } = await import("@/lib/reports/payload-cache");
    const result = await peekCachedReportPayload("pid-d");
    expect(result?.userId).toBe("user-1");
    expect(log.selectFilters?.["eq:id"]).toBe("pid-d");
    expect(log.selectFilters?.["gt:expires_at"]).toBe("2026-05-24T12:00:00.000Z");
    expect(log.deleteFilters).toBeUndefined();
  });
});
