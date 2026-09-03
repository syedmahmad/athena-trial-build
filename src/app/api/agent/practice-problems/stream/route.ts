import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import {
  getSeenProblemIds,
  getUnseenSeededProblems,
  getWriteThroughBaseOrderIndex,
  persistGeneratedProblem,
  type ProblemLinkage,
} from "@/lib/db/queries/problem-stream";
import { buildRequestMetadata } from "@/lib/agent/request-metadata";
import { stemTokens, tooSimilar } from "@/lib/stem-similarity";
import type { Problem, SolutionStep } from "@/components/quiz/types";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

type PriorAnswer = { isCorrect: boolean; difficulty?: string };

/** The camelCase problem shape the agents /practice-problems/stream emits. */
type GeneratedProblem = {
  id: string;
  difficulty: string;
  questionText: string;
  questionPhonetic?: string | null;
  options: string[];
  correctOption: number;
  explanation: string;
  solutionSteps: SolutionStep[];
  hint: string;
  detailedHint?: string;
  timeRecommendationSeconds?: number;
};

const enc = new TextEncoder();
const sse = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

/**
 * Orchestrates a hybrid problem stream: serve the user's unseen seeded
 * problems first (instant, free), then generate the deficit — deduping by
 * stem and writing each generated problem through to the pool so it gets a
 * real UUID and is never repeated for this user.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    topic,
    subtopic,
    subject,
    count,
    priorAnswers,
    subtopicId,
    customTopicId,
    topicSlug,
    subtopicSlug,
    lessonId,
  } = body as {
    topic: string;
    subtopic: string;
    subject?: string;
    count?: number;
    priorAnswers?: PriorAnswer[];
    subtopicId?: string;
    customTopicId?: string;
    topicSlug?: string;
    subtopicSlug?: string;
    lessonId?: string;
  };

  if (!topic || !subtopic) {
    return NextResponse.json(
      { error: "Topic and subtopic are required" },
      { status: 400 }
    );
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const target = Math.max(1, Math.min(count ?? 6, 12));
  const linkage: ProblemLinkage = {
    subtopicId,
    customTopicId,
    topicSlug,
    subtopicSlug,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const priorStems: Set<string>[] = [];
      let served = 0;

      // Enqueue helper that swallows post-close errors (client disconnected).
      const push = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          /* stream already closed */
        }
      };
      const emit = (p: Problem) => {
        push(sse({ problem: p }));
        served += 1;
      };

      try {
        // 1. Unseen seeded problems — instant, no LLM, satisfies "serve seeded".
        const seenIds = await getSeenProblemIds(user.id);
        const seeded = await getUnseenSeededProblems({
          linkage,
          seenIds,
          limit: target,
        });
        // Raw stems of what the student has already been served this session,
        // fed to generation so the next candidates target different areas.
        const avoidStems: string[] = [];
        for (const p of seeded) {
          priorStems.push(stemTokens(p.questionText));
          avoidStems.push(p.questionText.slice(0, 120));
          emit(p);
        }

        // 2. Generate the deficit, write through, dedupe.
        const deficit = target - served;
        if (deficit > 0) {
          let orderIndex = await getWriteThroughBaseOrderIndex(linkage);
          const res = await fetch(`${AGENT_URL}/practice-problems/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topic,
              subtopic,
              subject: subject ?? "math",
              count: deficit,
              prior_answers: priorAnswers ?? [],
              avoid_stems: avoidStems.slice(0, 12),
              request_metadata: buildRequestMetadata({
                userId: clerkId,
                topic: topicSlug ?? null,
                subtopic: subtopicSlug ?? null,
                lessonId: lessonId ?? null,
              }),
            }),
          });

          if (res.ok && res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            outer: while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6);
                if (data === "[DONE]") continue;

                let parsed: { problem?: GeneratedProblem; error?: string };
                try {
                  parsed = JSON.parse(data);
                } catch {
                  continue;
                }
                if (!parsed.problem) continue;

                const g = parsed.problem;
                const stem = stemTokens(g.questionText);
                if (tooSimilar(stem, priorStems)) continue;
                priorStems.push(stem);

                // Write through so the problem has a real UUID and is tracked
                // for no-repeat. Fall back to the ephemeral id if the insert
                // fails, so a write hiccup doesn't drop it from the stream.
                const realId = await persistGeneratedProblem({
                  problem: {
                    questionText: g.questionText,
                    questionPhonetic: g.questionPhonetic ?? null,
                    options: g.options,
                    correctOption: g.correctOption,
                    explanation: g.explanation,
                    solutionSteps: g.solutionSteps,
                    hint: g.hint,
                    detailedHint: g.detailedHint ?? null,
                    difficulty: g.difficulty,
                    timeRecommendationSeconds: g.timeRecommendationSeconds,
                  },
                  linkage,
                  orderIndex: orderIndex++,
                });

                emit({
                  id: realId ?? g.id,
                  orderIndex: served,
                  difficulty: g.difficulty,
                  questionText: g.questionText,
                  questionPhonetic: g.questionPhonetic ?? undefined,
                  options: g.options,
                  correctOption: g.correctOption,
                  explanation: g.explanation,
                  solutionSteps: g.solutionSteps,
                  hint: g.hint,
                  detailedHint: g.detailedHint ?? undefined,
                  timeRecommendationSeconds: g.timeRecommendationSeconds ?? 90,
                });

                if (served >= target) break outer;
              }
            }
            try {
              await reader.cancel();
            } catch {
              /* already done */
            }
          }
        }

        push(sse({ done: true }));
        push(enc.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("[agent/practice-problems/stream] orchestration error:", err);
        push(sse({ error: "generation_failed" }));
        push(enc.encode("data: [DONE]\n\n"));
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
