// Seed the three hand-authored ideal lessons into the local Supabase DB
// as topics + subtopics + micro_lessons. Lets you click through
// /learning → topic → subtopic → micro-lesson against a populated local DB
// instead of having to dump prod data.
//
// Usage:
//   tsx --env-file=.env.studio.local scripts/seed-ideal-lessons.ts
//
// Required env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
//
// Idempotent: upserts on the natural unique keys (topics.slug,
// subtopics.(topic_id, slug), micro_lessons.subtopic_id) so re-running
// just refreshes the whiteboard_steps payload.

import { promises as fs } from "fs";
import { join } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/types/supabase";

type Sb = SupabaseClient<Database>;

const FILES: { file: string; topic: string; subtopic: string }[] = [
  {
    file: "algebra-linear-equations-one-variable.json",
    topic: "algebra",
    subtopic: "linear-equations-one-variable",
  },
  {
    file: "algebra-linear-equations-two-variables.json",
    topic: "algebra",
    subtopic: "linear-equations-two-variables",
  },
  {
    file: "advanced-math-polynomial-operations.json",
    topic: "advanced-math",
    subtopic: "polynomial-operations",
  },
];

// Minimal topic rows. Placeholder JSON fields are empty arrays/objects —
// the /learning API only reads name/icon/overview/etc. and uses these
// JSON fields purely for display detail that empty values render fine.
// topics.order_index is UNIQUE so the two values must differ.
const TOPICS: Database["public"]["Tables"]["topics"]["Insert"][] = [
  {
    slug: "algebra",
    name: "Algebra",
    icon: "Variable",
    color_scheme: "purple",
    overview: "Linear equations, expressions, and systems.",
    estimated_total_minutes: 60,
    order_index: 0,
    subject: "math",
    key_concepts: [],
    learning_objectives: [],
    prerequisites: [],
    pro_tips: [],
    sat_relevance: {},
    difficulty_distribution: { easy: 0, medium: 0, hard: 0 },
  },
  {
    slug: "advanced-math",
    name: "Advanced Math",
    icon: "Sigma",
    color_scheme: "amber",
    overview: "Polynomials, exponentials, and more.",
    estimated_total_minutes: 60,
    order_index: 1,
    subject: "math",
    key_concepts: [],
    learning_objectives: [],
    prerequisites: [],
    pro_tips: [],
    sat_relevance: {},
    difficulty_distribution: { easy: 0, medium: 0, hard: 0 },
  },
];

const SUBTOPIC_META: Record<
  string,
  { name: string; description: string; topic: string; difficulty: string; order_index: number }
> = {
  "linear-equations-one-variable": {
    name: "Linear equations (one variable)",
    description: "Solving ax + b = c by isolating x.",
    topic: "algebra",
    difficulty: "easy",
    order_index: 0,
  },
  "linear-equations-two-variables": {
    name: "Linear equations (two variables)",
    description: "Systems, slope-intercept form, and graphing.",
    topic: "algebra",
    difficulty: "medium",
    order_index: 1,
  },
  "polynomial-operations": {
    name: "Polynomial operations",
    description: "Adding, subtracting, and multiplying polynomials.",
    topic: "advanced-math",
    difficulty: "medium",
    order_index: 0,
  },
};

function getClient(): Sb {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
  }
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function seedTopics(sb: Sb): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (const t of TOPICS) {
    const { data, error } = await sb
      .from("topics")
      .upsert(t, { onConflict: "slug" })
      .select("id, slug")
      .single();
    if (error || !data) {
      throw new Error(`upsert topic ${t.slug}: ${error?.message ?? "no row"}`);
    }
    idBySlug.set(data.slug, data.id);
    console.log(`  ✓ topic ${data.slug.padEnd(14)} → ${data.id}`);
  }
  return idBySlug;
}

async function seedSubtopics(
  sb: Sb,
  topicIdBySlug: Map<string, string>,
): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (const [slug, meta] of Object.entries(SUBTOPIC_META)) {
    const topicId = topicIdBySlug.get(meta.topic);
    if (!topicId) throw new Error(`subtopic ${slug}: parent topic ${meta.topic} not seeded`);
    const row: Database["public"]["Tables"]["subtopics"]["Insert"] = {
      slug,
      name: meta.name,
      description: meta.description,
      topic_id: topicId,
      difficulty: meta.difficulty,
      order_index: meta.order_index,
      estimated_minutes: 15,
      common_mistakes: [],
      conceptual_overview: {},
      key_formulas: [],
      learning_objectives: [],
      prerequisite_subtopic_slugs: [],
      tips_and_tricks: [],
    };
    const { data, error } = await sb
      .from("subtopics")
      .upsert(row, { onConflict: "topic_id,slug" })
      .select("id, slug")
      .single();
    if (error || !data) {
      throw new Error(`upsert subtopic ${slug}: ${error?.message ?? "no row"}`);
    }
    idBySlug.set(data.slug, data.id);
    console.log(`  ✓ subtopic ${data.slug.padEnd(34)} → ${data.id}`);
  }
  return idBySlug;
}

async function seedMicroLessons(sb: Sb, subtopicIdBySlug: Map<string, string>) {
  const idealsDir = join(process.cwd(), "src", "lib", "evals", "ideal-lessons");
  for (const f of FILES) {
    const subtopicId = subtopicIdBySlug.get(f.subtopic);
    if (!subtopicId) {
      throw new Error(`micro_lesson ${f.file}: parent subtopic ${f.subtopic} not seeded`);
    }
    const raw = await fs.readFile(join(idealsDir, f.file), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${f.file}: expected JSON array of steps`);
    }
    // The JSON is a WhiteboardStep[] but the DB column is JSONB; narrow to the
    // generated `Json` type the Supabase client accepts. The shape is validated
    // at read-time by the whiteboard renderer, not at write-time here.
    const steps = parsed as Json;
    const { error } = await sb
      .from("micro_lessons")
      .upsert(
        {
          subtopic_id: subtopicId,
          whiteboard_steps: steps,
          lesson_content: "",
          status: "ready",
        },
        { onConflict: "subtopic_id" },
      );
    const stepCount = parsed.length;
    if (error) {
      throw new Error(`upsert micro_lesson for ${f.subtopic}: ${error.message}`);
    }
    console.log(`  ✓ micro_lesson ${f.subtopic.padEnd(34)} (${stepCount} steps)`);
  }
}

async function main() {
  const sb = getClient();
  console.log("Seeding ideal lessons into Supabase...");
  console.log(`  url: ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL}\n`);
  const topicIds = await seedTopics(sb);
  console.log();
  const subtopicIds = await seedSubtopics(sb, topicIds);
  console.log();
  await seedMicroLessons(sb, subtopicIds);
  console.log("\nDone. Try:");
  console.log("  http://localhost:3000/learning");
  console.log("  http://localhost:3000/learning/algebra/linear-equations-one-variable");
  console.log(
    "  http://localhost:3000/learning/algebra/linear-equations-one-variable/micro-lesson",
  );
}

main().catch((err) => {
  console.error("\nseed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
