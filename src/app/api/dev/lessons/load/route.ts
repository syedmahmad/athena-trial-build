import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "fs";
import { join, normalize, sep } from "path";

// Dev-only: returns the JSON of one specific eval lesson by relPath.
// Path is constrained to live under <repo>/.local/evals/ to prevent
// arbitrary filesystem reads. 404s in production.

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev only" }, { status: 404 });
  }
  const relPath = new URL(req.url).searchParams.get("path") ?? "";
  if (!relPath) {
    return NextResponse.json({ error: "missing path" }, { status: 400 });
  }
  const root = process.cwd();
  const evalsRoot = join(root, ".local", "evals");
  const idealsRoot = join(root, "src", "lib", "evals", "ideal-lessons");
  const abs = normalize(join(root, relPath));
  // Accept paths under either eval results or hand-authored ideals.
  // Both directories are inert (no code execution); this read-only
  // surface is gated behind NODE_ENV anyway.
  const inEvals = abs.startsWith(evalsRoot + sep);
  const inIdeals = abs.startsWith(idealsRoot + sep);
  if (!inEvals && !inIdeals) {
    return NextResponse.json(
      { error: "path outside evals or ideal-lessons root" },
      { status: 400 },
    );
  }
  // Eval iter dirs are constrained to lesson.json / report.json so
  // an attacker can't ask the endpoint to read other files inside the
  // tree (e.g., a future stash file). Ideal-lesson files have
  // descriptive names — accept any *.json under that dir.
  const okSuffix = inIdeals
    ? abs.endsWith(".json")
    : abs.endsWith("lesson.json") || abs.endsWith("report.json");
  if (!okSuffix) {
    return NextResponse.json(
      { error: "must be lesson.json, report.json, or *.json under ideal-lessons/" },
      { status: 400 },
    );
  }
  try {
    const txt = await fs.readFile(abs, "utf8");
    const parsed = JSON.parse(txt);
    // Lesson files are arrays of steps; report.json is a single object.
    // Both wrap into `steps` for a single response shape — the caller
    // distinguishes by Array.isArray.
    return NextResponse.json({ steps: parsed });
  } catch (err) {
    return NextResponse.json(
      { error: `read failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
