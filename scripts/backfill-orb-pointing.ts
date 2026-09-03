/**
 * Backfill `orbFocus` onto cached micro-lessons so the roaming orb (?debug=orb)
 * walks to the part of a diagram each discussion step is about.
 *
 * Deterministic pass (this file): for each discussion step that follows a still-
 * visible diagram (geometry / coordinate_plane / number_line), it extracts
 * candidate part names FROM THE DIAGRAM (vertex letters, sides, measurement
 * labels, plotted-point names / coords / notes, number-line values), keeps only
 * those that literally appear in the step's text AND resolve against the shape
 * via the real runtime resolvers (single source of truth with the frontend),
 * and picks the most specific. Generic-word labels never become candidates, so
 * precision stays high. Steps it can't resolve are left for the LLM pass.
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/backfill-orb-pointing.ts          # dry run
 *   APPLY=1 pnpm tsx --env-file=.env scripts/backfill-orb-pointing.ts  # write
 *
 * Idempotent: re-running recomputes orbFocus from scratch (clears prior
 * deterministic focuses on diagram-discussion steps, then re-adds).
 */
import { createClient } from "@supabase/supabase-js";
import {
  resolveShapePart,
  resolveCoordinatePart,
  resolveNumberLinePart,
  type BoardBox,
} from "@/components/whiteboard/pen-tip";
import type {
  GeometryAction,
  CoordinatePlaneAction,
  NumberLineAction,
} from "@/types/whiteboard";

const APPLY = process.env.APPLY === "1";
const CLEAR = process.env.CLEAR === "1"; // wipe existing focuses before re-adding
const VALIDATE = process.env.VALIDATE === "1"; // scan existing focuses, don't change
// Resolution is box-independent (only the resolved coords scale with the box).
const BOX: BoardBox = { x: 0, y: 0, width: 400, height: 300 };
const POINTABLE = new Set(["geometry", "coordinate_plane", "number_line"]);
const DISCUSSION = new Set(["write_math", "write_text", "callout"]);

type Action = { type: string; [k: string]: unknown };
type Step = { id: number; action?: Action; displayText?: string; orbFocus?: unknown; [k: string]: unknown };

const norm = (s: string) => s.trim().toLowerCase();

/** Strip LaTeX wrappers so part names read as plain tokens. */
function plain(s: string): string {
  return s
    .replace(/\\textcolor\{[^}]*\}/g, "")
    .replace(/\\htmlClass\{[^}]*\}/g, "")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}$]/g, " ");
}

type Candidate = { part: string; specificity: number };

/** All candidate part names a diagram exposes, each with a specificity rank
 *  (higher wins). Only specific identifiers — never prose-word labels. */
function candidatesFor(action: Action): Candidate[] {
  const out: Candidate[] = [];
  const measurementLike = (t: string) => /\d/.test(t) || t.includes("=");

  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  if (action.type === "geometry") {
    const g = action as unknown as GeometryAction;
    const verts: string[] = [];
    for (const f of arr<GeometryAction["figures"][number]>(g.figures)) {
      if (f.type === "polygon" && Array.isArray(f.vertexLabels)) {
        for (const v of f.vertexLabels) if (typeof v === "string") verts.push(v);
      }
    }
    for (const v of verts) if (v?.trim()) out.push({ part: v.trim(), specificity: 1 });
    for (let i = 0; i < verts.length; i++) {
      for (let j = 0; j < verts.length; j++) {
        if (i !== j && verts[i]?.trim() && verts[j]?.trim()) {
          out.push({ part: verts[i].trim() + verts[j].trim(), specificity: 2 });
        }
      }
    }
    for (const l of arr<unknown>(g.labels)) {
      const t = typeof l === "string" ? l : (l as { text?: string })?.text;
      if (t && measurementLike(t)) out.push({ part: t.trim(), specificity: 3 });
    }
  } else if (action.type === "coordinate_plane") {
    const c = action as unknown as CoordinatePlaneAction;
    for (const el of arr<CoordinatePlaneAction["elements"][number]>(c.elements)) {
      if (el.type === "point") {
        if (el.label) {
          out.push({ part: el.label, specificity: 3 });
          const name = el.label.match(/^\s*([A-Za-z][A-Za-z0-9'_]*)/)?.[1];
          if (name) out.push({ part: name, specificity: 2 });
        }
        if (el.note?.text) out.push({ part: el.note.text, specificity: 4 });
        out.push({ part: `(${el.at[0]}, ${el.at[1]})`, specificity: 3 });
      } else if ("label" in el && el.label) {
        out.push({ part: el.label, specificity: 1 });
      }
    }
  } else if (action.type === "number_line") {
    const n = action as unknown as NumberLineAction;
    for (const p of arr<NonNullable<NumberLineAction["points"]>[number]>(n.points)) {
      if (p.label && /[\d=]/.test(p.label)) out.push({ part: p.label, specificity: 3 });
    }
  }
  return out;
}

/** Does `part` appear in `text` as a clean reference (word-bounded)? */
function appears(text: string, part: string): boolean {
  const t = plain(text);
  const p = part.trim();
  if (!p) return false;
  // Multi-char / measurement / tuple labels: substring (case-insensitive).
  if (p.length > 2 || /[\d=(]/.test(p)) return norm(t).includes(norm(p));
  // Short vertex / side / point letters: require letter-boundary so "C" doesn't
  // match inside "BC" and "BC" matches the side, not the word.
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`).test(t);
}

function resolves(action: Action, part: string): boolean {
  if (action.type === "geometry") return !!resolveShapePart(action as unknown as GeometryAction, part);
  if (action.type === "coordinate_plane")
    return !!resolveCoordinatePart(action as unknown as CoordinatePlaneAction, part, BOX, true);
  if (action.type === "number_line")
    return !!resolveNumberLinePart(action as unknown as NumberLineAction, part, BOX);
  return false;
}

/** Best deterministic part for one discussion step against one diagram, or null. */
function bestPart(diagram: Action, text: string): string | null {
  const cands = candidatesFor(diagram)
    .filter((c) => appears(text, c.part) && resolves(diagram, c.part))
    .sort((a, b) => b.specificity - a.specificity || b.part.length - a.part.length);
  return cands.length ? cands[0].part : null;
}

/** Recompute orbFocus for one lesson's steps. Returns the new step array +
 *  per-step decisions for reporting. */
function augment(steps: Step[]): { steps: Step[]; hits: { id: number; part: string; ref: number }[] } {
  const hits: { id: number; part: string; ref: number }[] = [];
  let refId: number | null = null; // most recent visible diagram step id
  let refAction: Action | null = null;
  for (const s of steps) {
    const type = s.action?.type;
    if (type && POINTABLE.has(type)) {
      refId = s.id;
      refAction = s.action!;
      delete s.orbFocus; // a diagram step never points
      continue;
    }
    // A section heading starts a new topic — the prior diagram scrolls away.
    if (type === "section_heading") {
      refId = null;
      refAction = null;
    }
    // CLEAR resets all focuses for a fresh hybrid run; otherwise both passes
    // only fill empty steps so deterministic + LLM compose (don't clobber).
    if (CLEAR) delete s.orbFocus;
    if (!type || !DISCUSSION.has(type) || refAction == null || refId == null) continue;
    if (s.orbFocus) continue; // already set (this run, the LLM pass, or by hand)
    const text = s.displayText || (typeof s.action?.text === "string" ? (s.action.text as string) : "");
    if (!text) continue;
    const part = bestPart(refAction, text);
    if (part) {
      s.orbFocus = { refStepId: refId, part };
      hits.push({ id: s.id, part, ref: refId });
    }
  }
  return { steps, hits };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[orb-backfill] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await supabase
    .from("micro_lessons")
    .select("id, subtopic_id, whiteboard_steps");
  if (error) {
    console.error("[orb-backfill] fetch failed:", error);
    process.exit(1);
  }

  // VALIDATE: scan every existing orbFocus through the real resolver and report
  // any dangling pointer (the eval gate for the augmentation at corpus scale).
  if (VALIDATE) {
    let focuses = 0;
    let dangling = 0;
    const byType: Record<string, number> = {};
    for (const row of rows ?? []) {
      const steps = (Array.isArray(row.whiteboard_steps) ? row.whiteboard_steps : []) as Step[];
      let lastDiagram: Step | null = null;
      for (const s of steps) {
        const t = s.action?.type;
        if (t && POINTABLE.has(t)) lastDiagram = s;
        else if (t === "section_heading") lastDiagram = null;
        const focus = s.orbFocus as { refStepId?: number; part?: string } | undefined;
        if (!focus?.part) continue;
        focuses++;
        const ref =
          focus.refStepId != null
            ? steps.find((x) => x.id === focus.refStepId)
            : lastDiagram;
        const action = ref?.action;
        const ok = action && resolves(action, focus.part);
        byType[action?.type ?? "none"] = (byType[action?.type ?? "none"] ?? 0) + 1;
        if (!ok) {
          dangling++;
          console.log(`  DANGLING ${row.subtopic_id.slice(0, 8)} #${s.id} part="${focus.part}" ref=${focus.refStepId ?? "(latest)"}`);
        }
      }
    }
    console.log(`[orb-validate] orbFocus total: ${focuses}`);
    console.log(`[orb-validate] by diagram type:`, byType);
    console.log(`[orb-validate] dangling (do not resolve): ${dangling}`);
    console.log(dangling === 0 ? "[orb-validate] PASS — every pointer resolves." : "[orb-validate] FAIL — dangling pointers above.");
    return;
  }

  let lessonsWithDiagram = 0;
  let totalHits = 0;
  let lessonsWritten = 0;
  const samples: string[] = [];

  for (const row of rows ?? []) {
    const steps = (Array.isArray(row.whiteboard_steps) ? row.whiteboard_steps : []) as Step[];
    const hasDiagram = steps.some((s) => s.action?.type && POINTABLE.has(s.action.type));
    if (!hasDiagram) continue;
    lessonsWithDiagram++;

    const { steps: next, hits } = augment(steps);
    totalHits += hits.length;
    if (hits.length && samples.length < 18) {
      for (const h of hits.slice(0, 2)) samples.push(`  ${row.subtopic_id.slice(0, 8)} #${h.id} -> "${h.part}" (ref #${h.ref})`);
    }

    if (APPLY) {
      const { error: updErr } = await supabase
        .from("micro_lessons")
        .update({ whiteboard_steps: next, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updErr) {
        console.error(`[orb-backfill] update failed for ${row.id}:`, updErr);
        continue;
      }
      lessonsWritten++;
    }
  }

  console.log(`[orb-backfill] lessons with a diagram: ${lessonsWithDiagram}`);
  console.log(`[orb-backfill] deterministic orbFocus set: ${totalHits} step(s)`);
  console.log("[orb-backfill] sample:");
  for (const s of samples) console.log(s);
  if (APPLY) console.log(`[orb-backfill] WROTE ${lessonsWritten} lesson row(s).`);
  else console.log("[orb-backfill] DRY RUN — re-run with APPLY=1 to write.");
}

main().catch((err) => {
  console.error("[orb-backfill] unhandled error:", err);
  process.exit(1);
});
