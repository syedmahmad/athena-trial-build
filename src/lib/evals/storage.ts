/**
 * Evaluator storage — read/write under `.local/evals/`. Kept file-based for
 * v1 so the CLI and (later) a UI share a single source of truth without a
 * database migration.
 *
 * Layout:
 *   .local/evals/<variant>/<topic>/<subtopic>/iter-<N>/
 *     lesson.json          -- raw whiteboard_steps
 *     adherence.json
 *     math.json
 *     report.json          -- combined LessonReport
 *   .local/evals/<variant>/<topic>/<subtopic>/summary.json   -- aggregated stats
 *   .local/evals/<variant>/matrix-summary.json               -- across subtopics
 */

import { promises as fs } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { LessonReport, WhiteboardStep } from "./types";

async function findRepoRoot(): Promise<string> {
  let here: string;
  try {
    here = dirname(fileURLToPath(import.meta.url));
  } catch {
    here = process.cwd();
  }
  for (let i = 0; i < 10; i++) {
    try {
      await fs.access(join(here, "package.json"));
      return here;
    } catch {
      /* keep walking */
    }
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  throw new Error("could not locate repo root (package.json missing)");
}

export async function evalsRoot(): Promise<string> {
  const root = await findRepoRoot();
  return join(root, ".local", "evals");
}

export type IterPaths = {
  dir: string;
  lessonPath: string;
  adherencePath: string;
  mathPath: string;
  reportPath: string;
};

export async function iterPaths(args: {
  variant: string;
  topicSlug: string;
  subtopicSlug: string;
  iter: number;
}): Promise<IterPaths> {
  const base = await evalsRoot();
  const dir = join(
    base,
    args.variant,
    args.topicSlug,
    args.subtopicSlug,
    `iter-${args.iter}`,
  );
  return {
    dir,
    lessonPath: join(dir, "lesson.json"),
    adherencePath: join(dir, "adherence.json"),
    mathPath: join(dir, "math.json"),
    reportPath: join(dir, "report.json"),
  };
}

export async function subtopicSummaryPath(args: {
  variant: string;
  topicSlug: string;
  subtopicSlug: string;
}): Promise<string> {
  const base = await evalsRoot();
  return join(
    base,
    args.variant,
    args.topicSlug,
    args.subtopicSlug,
    "summary.json",
  );
}

export async function variantSummaryPath(variant: string): Promise<string> {
  const base = await evalsRoot();
  return join(base, variant, "matrix-summary.json");
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function readLessonSteps(path: string): Promise<WhiteboardStep[] | null> {
  return readJson<WhiteboardStep[]>(path);
}

export async function writeReport(path: string, report: LessonReport): Promise<void> {
  return writeJson(path, report);
}
