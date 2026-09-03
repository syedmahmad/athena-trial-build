/**
 * Generate a lesson via the local agents backend, optionally under a named
 * prompt variant. Bypasses the full Next.js + Supabase flow used by the
 * browser — straight subprocess call for speed.
 *
 * The caller decides what to do with the returned steps (save to DB, save
 * to .local/evals, or both).
 */

import { spawn } from "child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { WhiteboardStep } from "./types";

export type GenerateArgs = {
  variant: string;
  topicSlug: string;
  subtopicSlug: string;
  /** Default http://localhost:8080 */
  agentUrl?: string;
  onProgress?: (step: WhiteboardStep) => void;
};

export type SubtopicMetadata = {
  topicName: string;
  subtopicName: string;
  description: string;
  learningObjectives: unknown[];
  keyFormulas: unknown[];
  commonMistakes: unknown[];
  tipsAndTricks: unknown[];
  conceptualOverview: unknown;
};

export async function resolveSubtopicMetadata(
  supabase: SupabaseClient,
  topicSlug: string,
  subtopicSlug: string,
): Promise<SubtopicMetadata> {
  const { data: topic, error: te } = await supabase
    .from("topics")
    .select("id,name")
    .eq("slug", topicSlug)
    .maybeSingle();
  if (te || !topic) throw new Error(`topic not found: ${topicSlug}`);

  const { data: subtopic, error: se } = await supabase
    .from("subtopics")
    .select(
      "name,description,learning_objectives,key_formulas,common_mistakes,tips_and_tricks,conceptual_overview",
    )
    .eq("topic_id", topic.id)
    .eq("slug", subtopicSlug)
    .maybeSingle();
  if (se || !subtopic) throw new Error(`subtopic not found: ${topicSlug}/${subtopicSlug}`);

  return {
    topicName: topic.name,
    subtopicName: subtopic.name,
    description: subtopic.description ?? "",
    learningObjectives: Array.isArray(subtopic.learning_objectives) ? subtopic.learning_objectives : [],
    keyFormulas: Array.isArray(subtopic.key_formulas) ? subtopic.key_formulas : [],
    commonMistakes: Array.isArray(subtopic.common_mistakes) ? subtopic.common_mistakes : [],
    tipsAndTricks: Array.isArray(subtopic.tips_and_tricks) ? subtopic.tips_and_tricks : [],
    conceptualOverview:
      subtopic.conceptual_overview && typeof subtopic.conceptual_overview === "object"
        ? subtopic.conceptual_overview
        : null,
  };
}

export function makeSupabaseClient(): SupabaseClient {
  // Frontend usage (Next.js dev/build) supplies the publishable client
  // pair via `.env`; backend tools (eval matrix, regen jobs) typically
  // run against `agents/.env` which carries the service-role pair.
  // Subtopic-metadata reads work against either, so accept both names —
  // service role wins when both are present so a job has full access.
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !key) {
    throw new Error(
      "missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or " +
        "SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
    );
  }
  return createClient(url, key);
}

/**
 * Stream a lesson from the agents backend under a named prompt variant.
 * Does NOT persist to DB — caller decides.
 */
export async function generateLesson(args: GenerateArgs): Promise<WhiteboardStep[]> {
  // agentUrl is accepted for API completeness but unused — we spawn a
  // dedicated Python subprocess rather than hitting the running HTTP server
  // so we can set MICROLESSON_PROMPT_VARIANT per call.
  void args.agentUrl;

  const supabase = makeSupabaseClient();
  const meta = await resolveSubtopicMetadata(supabase, args.topicSlug, args.subtopicSlug);

  const body = {
    topic: meta.topicName,
    subtopic: meta.subtopicName,
    description: meta.description,
    learning_objectives: meta.learningObjectives,
    key_formulas: meta.keyFormulas,
    common_mistakes: meta.commonMistakes,
    tips_and_tricks: meta.tipsAndTricks,
    conceptual_overview: meta.conceptualOverview,
  };

  // Set the variant env var on the agents child. Since the agents backend is
  // an already-running uvicorn process, we can't poke its env. Instead we
  // pass the variant as a request header; the FastAPI side reads the header
  // into os.environ before constructing the agent.
  //
  // BUT the current agents/main.py doesn't read headers for this. To avoid
  // a same-branch FastAPI change, we spawn a fresh Python subprocess that
  // sets MICROLESSON_PROMPT_VARIANT, imports the agent, and streams to
  // stdout. That way one variant per generate call is guaranteed.
  //
  // This is slower than hitting the running HTTP server (cold start ~1-2s)
  // but it's cleaner and doesn't need a server-side change.
  return streamViaSubprocess(body, args.variant, args.onProgress);
}

async function streamViaSubprocess(
  body: Record<string, unknown>,
  variant: string,
  onProgress?: (step: WhiteboardStep) => void,
): Promise<WhiteboardStep[]> {
  const agentsDir = await resolveAgentsDir();
  const python = await resolveAgentPython(agentsDir);

  const child = spawn(python, ["-u", "-m", "app.run_time.sat.stream_once"], {
    cwd: agentsDir,
    env: {
      ...process.env,
      MICROLESSON_PROMPT_VARIANT: variant,
      PYTHONPATH: agentsDir,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end(JSON.stringify(body));

  const steps: WhiteboardStep[] = [];
  let buf = "";
  let nextId = 0;

  child.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.wb_step) {
          const step = { ...obj.wb_step, id: nextId++ } as WhiteboardStep;
          steps.push(step);
          onProgress?.(step);
        }
      } catch {
        /* ignore malformed line */
      }
    }
  });

  const stderrChunks: Buffer[] = [];
  child.stderr.on("data", (c: Buffer) => stderrChunks.push(c));

  const code = await new Promise<number>((resolve) => child.on("close", resolve));
  if (code !== 0) {
    const err = Buffer.concat(stderrChunks).toString("utf8");
    // Keep the TAIL of stderr — the real error is at the end of the
    // traceback, not the call into asyncio.run at the top.
    const tail = err.length > 2000 ? "…" + err.slice(-2000) : err;
    throw new Error(`stream_once exited ${code}:\n${tail}`);
  }
  return steps;
}

async function resolveAgentsDir(): Promise<string> {
  const { dirname, join } = await import("path");
  const { fileURLToPath } = await import("url");
  const { promises: fs } = await import("fs");
  let here: string;
  try {
    here = dirname(fileURLToPath(import.meta.url));
  } catch {
    here = process.cwd();
  }
  for (let i = 0; i < 10; i++) {
    const candidate = join(here, "agents");
    try {
      await fs.access(join(candidate, "main.py"));
      return candidate;
    } catch {
      /* keep walking */
    }
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  throw new Error("could not locate agents/ directory");
}

async function resolveAgentPython(agentsDir: string): Promise<string> {
  const { join } = await import("path");
  const { promises: fs } = await import("fs");
  const venvPy = join(agentsDir, ".venv", "bin", "python3");
  try {
    await fs.access(venvPy);
    return venvPy;
  } catch {
    // Fall back to system python3. The caller will see an import error
    // from agno/agno-backed modules if the system python lacks deps.
    return "python3";
  }
}
