import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { evaluateAdherence, evaluateMath, acceptLesson } from "@/lib/evals";
import type { WhiteboardStep } from "@/types/whiteboard";

// Dev-only: lists eval-generated lessons under .local/evals/<variant>/<topic>/<subtopic>/iter-N/
// AND hand-authored ideal-lesson references under src/lib/evals/ideal-lessons/.
// Returns metadata pulled from each iter's report.json (adherence/math/accept)
// or computed on demand for ideals (no report.json sitting next to them).
// Returns 404 in production builds so this surface doesn't ship.

type IterMeta = {
  variant: string;
  topicSlug: string;
  subtopicSlug: string;
  iter: number;
  pass: boolean;
  adherenceScore: number;
  mathScore: number | null;
  tripletCount: number;
  expectedTripletCount: number;
  stepCount: number;
  reasons: string[];
  lessonRelPath: string;
};

async function safeReadJson<T>(path: string): Promise<T | null> {
  try {
    const txt = await fs.readFile(path, "utf8");
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function safeReaddir(path: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev only" }, { status: 404 });
  }
  const root = join(process.cwd(), ".local", "evals");
  const variants = (await safeReaddir(root)).filter((v) => v !== "compare");
  const out: IterMeta[] = [];
  for (const variant of variants) {
    const variantDir = join(root, variant);
    const topics = (await safeReaddir(variantDir)).filter((t) => t !== "best");
    for (const topic of topics) {
      const topicDir = join(variantDir, topic);
      const subtopics = await safeReaddir(topicDir);
      for (const subtopic of subtopics) {
        const subDir = join(topicDir, subtopic);
        const iters = (await safeReaddir(subDir))
          .filter((d) => d.startsWith("iter-"))
          .sort();
        for (const iterDir of iters) {
          const iterNum = Number(iterDir.slice("iter-".length));
          if (!Number.isFinite(iterNum)) continue;
          const reportPath = join(subDir, iterDir, "report.json");
          const lessonPath = join(subDir, iterDir, "lesson.json");
          const report = await safeReadJson<{
            adherence?: { score?: number; stepCount?: number; tripletCount?: number; expectedTripletCount?: number };
            math?: { score?: number } | null;
            accept?: { pass?: boolean; reasons?: string[] };
          }>(reportPath);
          // If no report yet (e.g. lesson written but eval didn't run),
          // still include the entry so the UI can flag it.
          out.push({
            variant,
            topicSlug: topic,
            subtopicSlug: subtopic,
            iter: iterNum,
            pass: report?.accept?.pass ?? false,
            adherenceScore: report?.adherence?.score ?? 0,
            mathScore: report?.math?.score ?? null,
            tripletCount: report?.adherence?.tripletCount ?? 0,
            expectedTripletCount: report?.adherence?.expectedTripletCount ?? 0,
            stepCount: report?.adherence?.stepCount ?? 0,
            reasons: report?.accept?.reasons ?? [],
            // Relative to project root so the load endpoint can resolve it
            // without trusting an arbitrary client-supplied path.
            lessonRelPath: join(".local", "evals", variant, topic, subtopic, iterDir, "lesson.json"),
          });
        }
      }
    }
  }
  // Hand-authored ideal-lesson references. These live outside .local/
  // and don't have report.json siblings, so we run the evaluator on
  // each one inline. Cheap (3 files; one math-shim subprocess each).
  // Variant label is "ideal" so they sort/filter cleanly alongside
  // generated iters.
  const idealsDir = join(process.cwd(), "src", "lib", "evals", "ideal-lessons");
  let idealFiles: string[] = [];
  try {
    idealFiles = (await fs.readdir(idealsDir))
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    /* no ideal-lessons directory; skip */
  }
  for (const file of idealFiles) {
    const lessonRelPath = join("src", "lib", "evals", "ideal-lessons", file);
    const steps = await safeReadJson<WhiteboardStep[]>(join(idealsDir, file));
    if (!steps || !Array.isArray(steps)) continue;
    // Filename convention: <topic>-<subtopic>.json. The topic prefixes
    // are "algebra" (single word) or "advanced-math" (hyphenated). Try
    // the longer prefix first so we don't slice "advanced" + the rest.
    const stem = file.replace(/\.json$/, "");
    let topicSlug = "ideal";
    let subtopicSlug = stem;
    for (const prefix of ["advanced-math-", "algebra-"]) {
      if (stem.startsWith(prefix)) {
        topicSlug = prefix.slice(0, -1);
        subtopicSlug = stem.slice(prefix.length);
        break;
      }
    }
    try {
      const adherence = evaluateAdherence(steps);
      const math = await evaluateMath(steps);
      const accept = acceptLesson(adherence, math);
      out.push({
        variant: "ideal",
        topicSlug,
        subtopicSlug,
        iter: 0,
        pass: accept.pass,
        adherenceScore: adherence.score,
        mathScore: math.score,
        tripletCount: adherence.tripletCount,
        expectedTripletCount: adherence.expectedTripletCount,
        stepCount: adherence.stepCount,
        reasons: accept.reasons,
        lessonRelPath,
      });
    } catch {
      // Eval failure shouldn't break the list — skip this entry.
    }
  }

  out.sort((a, b) =>
    a.variant.localeCompare(b.variant) ||
    a.topicSlug.localeCompare(b.topicSlug) ||
    a.subtopicSlug.localeCompare(b.subtopicSlug) ||
    a.iter - b.iter,
  );
  return NextResponse.json({ iters: out });
}
