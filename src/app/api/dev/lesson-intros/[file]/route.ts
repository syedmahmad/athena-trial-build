import { NextResponse } from "next/server";
import { promises as fs, createReadStream, statSync } from "node:fs";
import { dirname, join, resolve, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static-serve route for rendered Remotion lesson-intro MP4s living in
 * `video-intro-remotion/out/`. Used by the /dev/lesson-intros preview
 * page — dev-only surface, returns 404 outside dev so we don't expose
 * the local filesystem in production.
 *
 * Supports HTTP Range requests so the browser can scrub the video
 * (Remotion-rendered intros are 30–60s; without Range the entire MP4
 * is buffered up-front).
 *
 * Path traversal is rejected via `basename(file)` extraction and an
 * explicit `.mp4` extension check; anything resolved outside the OUT
 * directory returns 404.
 */

async function resolveOutDir(): Promise<string> {
  // Walk up from this module until we find the `video-intro-remotion`
  // directory sibling of `src/`. Mirrors the same lookup used by
  // src/lib/evals/math.ts for `agents/`.
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
  throw new Error("video-intro-remotion/out not found");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { file } = await params;
  // Strip directory components — only the basename is honored.
  const safeName = basename(file);
  if (extname(safeName).toLowerCase() !== ".mp4") {
    return new NextResponse("Not found", { status: 404 });
  }

  let outDir: string;
  try {
    outDir = await resolveOutDir();
  } catch {
    return new NextResponse("Out directory unavailable", { status: 503 });
  }

  const absolute = resolve(outDir, safeName);
  // Defense-in-depth: even though basename strips ../, double-check
  // the resolved path is inside outDir.
  if (!absolute.startsWith(outDir + "/") && absolute !== outDir) {
    return new NextResponse("Not found", { status: 404 });
  }

  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!stats.isFile()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const total = stats.size;
  const range = req.headers.get("range");

  // No Range header — serve the whole file. Browsers send Range for
  // <video> playback so this is mainly a fallback.
  if (!range) {
    const stream = createReadStream(absolute);
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(total),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
      },
    });
  }

  // Parse `Range: bytes=START-END` (END optional).
  const m = /^bytes=(\d+)-(\d+)?$/.exec(range);
  if (!m) {
    return new NextResponse("Invalid Range", {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
  if (start >= total || end < start) {
    return new NextResponse("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }
  const chunkSize = end - start + 1;
  const stream = createReadStream(absolute, { start, end });
  return new NextResponse(stream as unknown as ReadableStream, {
    status: 206,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunkSize),
      "Cache-Control": "no-cache",
    },
  });
}
