/**
 * Prompt variant discovery. Variants are .md files under
 * `agents/prompts/micro_lesson/`; each filename (sans extension) is the
 * variant id that gets passed through MICROLESSON_PROMPT_VARIANT.
 */

import { promises as fs } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

async function findRepoRoot(): Promise<string> {
  let here: string;
  try {
    here = dirname(fileURLToPath(import.meta.url));
  } catch {
    here = process.cwd();
  }
  for (let i = 0; i < 10; i++) {
    try {
      await fs.access(join(here, "agents", "prompts", "micro_lesson"));
      return here;
    } catch {
      /* keep walking */
    }
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  throw new Error("could not locate repo root (agents/prompts/micro_lesson missing)");
}

export async function listVariants(): Promise<string[]> {
  const root = await findRepoRoot();
  const dir = join(root, "agents", "prompts", "micro_lesson");
  const entries = await fs.readdir(dir);
  return entries
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();
}

export async function variantExists(name: string): Promise<boolean> {
  const root = await findRepoRoot();
  try {
    await fs.access(join(root, "agents", "prompts", "micro_lesson", `${name}.md`));
    return true;
  } catch {
    return false;
  }
}

export async function readVariant(name: string): Promise<string> {
  const root = await findRepoRoot();
  return fs.readFile(join(root, "agents", "prompts", "micro_lesson", `${name}.md`), "utf8");
}
