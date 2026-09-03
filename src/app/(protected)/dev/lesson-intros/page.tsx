import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { notFound } from "next/navigation";

/**
 * Preview page for rendered Remotion lesson-intro MP4s. Scans
 * `video-intro-remotion/out/` and renders a `<video>` player for each.
 *
 * Dev-only — `/dev/*` is unlinked from production nav and this page
 * 404s in production builds. Rendering happens via the CLI workflow
 * documented in the docs section at the bottom of the page (the
 * orchestrator generates a manifest + audio, then `npx remotion
 * render` produces the MP4). The preview page just plays whatever
 * has been rendered.
 */

type IntroVideoFile = {
  filename: string;
  sizeBytes: number;
  modifiedAt: string;
  /** Parsed from the sidecar `<basename>.qa.json` written by qa_gate.py
   *  during `python -m video_intro render`. Absent if no QA was run. */
  qa?: {
    verdict: "PASS" | "FAIL";
    durationSeconds: number;
    longestDeadRunSeconds: number;
    deadSecondsCount: number;
    averageBrightness: number;
  };
};

async function resolveOutDir(): Promise<string | null> {
  let here: string;
  try {
    here = dirname(fileURLToPath(import.meta.url));
  } catch {
    here = process.cwd();
  }
  for (let i = 0; i < 10; i++) {
    const candidate = join(here, "video-intro-remotion", "out");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* keep walking */
    }
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  return null;
}

async function listVideos(): Promise<{ outDir: string | null; videos: IntroVideoFile[] }> {
  const outDir = await resolveOutDir();
  if (!outDir) return { outDir: null, videos: [] };

  const entries = await fs.readdir(outDir);
  const mp4s = entries
    .filter((f) => f.toLowerCase().endsWith(".mp4"))
    .sort();

  const videos: IntroVideoFile[] = [];
  for (const filename of mp4s) {
    const stat = await fs.stat(join(outDir, filename));
    const v: IntroVideoFile = {
      filename,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
    // Pair with a sidecar `.qa.json` if present (written by qa_gate.py
    // via `python -m video_intro render`).
    const qaPath = join(outDir, filename.replace(/\.mp4$/i, ".qa.json"));
    try {
      const qaRaw = await fs.readFile(qaPath, "utf8");
      const qa = JSON.parse(qaRaw) as {
        duration_s?: number;
        brightness_per_second?: number[];
        dead_seconds?: number[];
        longest_dead_run_s?: number;
        verdict?: "PASS" | "FAIL";
      };
      const brightness = Array.isArray(qa.brightness_per_second)
        ? qa.brightness_per_second
        : [];
      const avgBrightness =
        brightness.length > 0
          ? brightness.reduce((a, b) => a + b, 0) / brightness.length
          : 0;
      v.qa = {
        verdict: qa.verdict ?? "FAIL",
        durationSeconds: qa.duration_s ?? 0,
        longestDeadRunSeconds: qa.longest_dead_run_s ?? 0,
        deadSecondsCount: Array.isArray(qa.dead_seconds)
          ? qa.dead_seconds.length
          : 0,
        averageBrightness: avgBrightness,
      };
    } catch {
      /* no QA sidecar — `qa` stays undefined and the UI shows a "no QA" badge */
    }
    videos.push(v);
  }
  return { outDir, videos };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

/** Render the QA verdict as a colored pill. Three states: PASS (green),
 *  FAIL (red), or "no QA" (neutral) when the sidecar is missing. */
function QaBadge({ qa }: { qa: IntroVideoFile["qa"] }) {
  if (!qa) {
    return (
      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        no QA
      </span>
    );
  }
  const pass = qa.verdict === "PASS";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
        (pass
          ? "bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30"
          : "bg-destructive/15 text-destructive border border-destructive/40")
      }
    >
      {qa.verdict}
    </span>
  );
}

export default async function LessonIntrosPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const { outDir, videos } = await listVideos();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-bold mb-1">Lesson Intros</h1>
        <p className="text-sm text-muted-foreground">
          Rendered Remotion lesson-intro MP4s from{" "}
          <code className="text-xs font-mono">video-intro-remotion/out/</code>.
          Dev-only — 404s in production. Rendering still happens via the CLI
          workflow documented at the bottom of this page; this surface is
          here so you can watch what&apos;s been rendered without leaving the
          app.
        </p>
      </header>

      {outDir === null ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          <strong>video-intro-remotion/out/</strong> not found. Run a render
          first (see CLI instructions below).
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          No MP4s in <code className="text-xs font-mono">{outDir}</code> yet.
          Run a render via the CLI commands below to see videos here.
        </div>
      ) : (
        <ul className="space-y-6">
          {videos.map((v) => (
            <li
              key={v.filename}
              className="rounded-lg border bg-card overflow-hidden"
            >
              <div className="p-4 flex items-start justify-between gap-3 border-b">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <code className="text-sm font-mono font-semibold">
                      {v.filename}
                    </code>
                    <QaBadge qa={v.qa} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatBytes(v.sizeBytes)} ·{" "}
                    {formatRelativeTime(v.modifiedAt)}
                    {v.qa ? (
                      <>
                        {" "}
                        · {v.qa.durationSeconds.toFixed(0)}s · avg brightness{" "}
                        {v.qa.averageBrightness.toFixed(1)}
                        {v.qa.deadSecondsCount > 0 ? (
                          <>
                            {" "}
                            ·{" "}
                            <span className="text-destructive font-medium">
                              {v.qa.deadSecondsCount} dead s
                              {v.qa.longestDeadRunSeconds > 0
                                ? ` (max run ${v.qa.longestDeadRunSeconds}s)`
                                : ""}
                            </span>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  {v.qa?.verdict === "FAIL" ? (
                    <p className="text-xs text-destructive mt-2 leading-snug">
                      QA failed: this MP4 has{" "}
                      <strong>
                        {v.qa.longestDeadRunSeconds}s of contiguous black frames
                      </strong>{" "}
                      while audio is playing. Common causes: brief author
                      omitted <code className="font-mono">code</code> on a beat
                      with narration, a primitive raised at runtime, or beat
                      boundaries misaligned with the audio. Re-author the brief
                      or fall back to a different primitive.
                    </p>
                  ) : null}
                  {!v.qa ? (
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">
                      No QA report — render via{" "}
                      <code className="font-mono">
                        python -m video_intro render
                      </code>{" "}
                      to generate one.
                    </p>
                  ) : null}
                </div>
              </div>
              <video
                controls
                preload="metadata"
                src={`/api/dev/lesson-intros/${encodeURIComponent(v.filename)}`}
                className="w-full bg-black"
                style={{ aspectRatio: "16 / 9" }}
              />
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-lg border bg-muted/20 px-5 py-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          How to render
        </h2>
        <div className="text-sm space-y-3">
          <div>
            <p className="text-muted-foreground mb-1">
              1. Generate a brief + ElevenLabs audio + manifest:
            </p>
            <pre className="rounded bg-background border px-3 py-2 text-xs font-mono overflow-x-auto">
{`cd agents && python -m video_intro generate \\
  --topic-slug algebra \\
  --subtopic-slug linear-equations-one-variable \\
  --topic-name "Algebra" \\
  --subtopic-name "Linear equations (one variable)" \\
  --out out/algebra_linear \\
  --remotion-root ../video-intro-remotion`}
            </pre>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">
              2. Render the MP4 + run the brightness QA gate (writes the
              <code className="font-mono"> .qa.json </code>sidecar this page
              reads):
            </p>
            <pre className="rounded bg-background border px-3 py-2 text-xs font-mono overflow-x-auto">
{`cd agents && python -m video_intro render \\
  --name algebra_linear \\
  --remotion-root ../video-intro-remotion`}
            </pre>
            <p className="text-xs text-muted-foreground mt-1">
              Exits non-zero if any contiguous dead-frame run exceeds 1s while
              audio is active. Re-run with <code className="font-mono">--allow-qa-fail</code> to
              keep the MP4 anyway (e.g. for visual inspection of the failure).
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">
              <em>Or</em> bare Remotion (no QA):
            </p>
            <pre className="rounded bg-background border px-3 py-2 text-xs font-mono overflow-x-auto">
{`cd video-intro-remotion && npx remotion render \\
  src/index.ts IntroVideo \\
  --props=manifests/algebra_linear.json \\
  out/algebra_linear.mp4`}
            </pre>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">
              3. Refresh this page — the new MP4 will appear in the list with
              its QA badge (PASS / FAIL / no-QA).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
