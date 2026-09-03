/**
 * One-shot: remove all `number_line` steps from the algebra ⇒
 * linear-equations-one-variable micro-lesson stored in the `micro_lessons`
 * Supabase table, then mirror the cleaned step array to the local
 * ideal-lesson fixture so the evaluator scores against the same shape.
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/strip-number-lines.ts
 *
 * Idempotent — re-running with no `number_line` rows present is a no-op.
 */
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TOPIC_SLUG = "algebra";
const SUBTOPIC_SLUG = "linear-equations-one-variable";
const IDEAL_PATH = path.resolve(
  process.cwd(),
  "src/lib/evals/ideal-lessons/algebra-linear-equations-one-variable.json",
);

type StepAction = { type: string; targetStepId?: number; [k: string]: unknown };
type Step = {
  id: number;
  action: StepAction;
  [k: string]: unknown;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[strip] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Resolve topic + subtopic ids.
  const { data: topic, error: topicErr } = await supabase
    .from("topics")
    .select("id, slug")
    .eq("slug", TOPIC_SLUG)
    .limit(1)
    .maybeSingle();
  if (topicErr || !topic) {
    console.error("[strip] topic not found:", TOPIC_SLUG, topicErr);
    process.exit(1);
  }
  const { data: subtopic, error: subErr } = await supabase
    .from("subtopics")
    .select("id, slug")
    .eq("topic_id", topic.id)
    .eq("slug", SUBTOPIC_SLUG)
    .limit(1)
    .maybeSingle();
  if (subErr || !subtopic) {
    console.error("[strip] subtopic not found:", SUBTOPIC_SLUG, subErr);
    process.exit(1);
  }
  console.log("[strip] topic=", topic.id, "subtopic=", subtopic.id);

  // Fetch the cached lesson.
  const { data: lesson, error: lessonErr } = await supabase
    .from("micro_lessons")
    .select("id, status, whiteboard_steps, lesson_content, updated_at")
    .eq("subtopic_id", subtopic.id)
    .limit(1)
    .maybeSingle();
  if (lessonErr) {
    console.error("[strip] lesson fetch error:", lessonErr);
    process.exit(1);
  }
  if (!lesson) {
    console.error(
      "[strip] no micro_lesson row exists for this subtopic — nothing to strip.",
    );
    process.exit(1);
  }
  if (lesson.status !== "ready") {
    console.warn("[strip] lesson status is", lesson.status, "— continuing anyway.");
  }

  const before: Step[] = Array.isArray(lesson.whiteboard_steps)
    ? (lesson.whiteboard_steps as Step[])
    : [];
  const droppedIds = new Set<number>(
    before.filter((s) => s.action?.type === "number_line").map((s) => s.id),
  );
  if (droppedIds.size === 0) {
    console.log("[strip] no number_line steps in DB lesson — DB unchanged.");
  } else {
    console.log("[strip] dropping", droppedIds.size, "number_line step(s):", [...droppedIds]);
  }

  // Drop number_line + any highlight that targets one of them.
  const orphanedHighlights = new Set<number>();
  const after = before.filter((s) => {
    if (s.action?.type === "number_line") return false;
    if (
      s.action?.type === "highlight" &&
      typeof s.action.targetStepId === "number" &&
      droppedIds.has(s.action.targetStepId)
    ) {
      orphanedHighlights.add(s.id);
      return false;
    }
    return true;
  });
  if (orphanedHighlights.size > 0) {
    console.log(
      "[strip] also dropping orphaned highlight step(s):",
      [...orphanedHighlights],
    );
  }
  console.log("[strip] step count:", before.length, "→", after.length);

  // Update DB row only if something changed.
  if (after.length !== before.length) {
    const { error: updErr } = await supabase
      .from("micro_lessons")
      .update({
        whiteboard_steps: after,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lesson.id);
    if (updErr) {
      console.error("[strip] DB update failed:", updErr);
      process.exit(1);
    }
    console.log("[strip] DB row", lesson.id, "updated.");
  }

  // Mirror cleaned steps to the ideal-lesson fixture.
  const json = JSON.stringify(after, null, 2) + "\n";
  await writeFile(IDEAL_PATH, json, "utf8");
  console.log("[strip] wrote ideal fixture:", IDEAL_PATH);

  // Sanity report on the new ideal: count by action type.
  const counts: Record<string, number> = {};
  for (const s of after) {
    const t = s.action?.type ?? "unknown";
    counts[t] = (counts[t] ?? 0) + 1;
  }
  console.log("[strip] new ideal action-type counts:", counts);
}

main().catch((err) => {
  console.error("[strip] unhandled error:", err);
  process.exit(1);
});

// Used to silence the "unused import" lint until I add a parsing helper.
void readFile;
