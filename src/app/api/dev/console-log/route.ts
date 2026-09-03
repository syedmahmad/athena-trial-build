import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dev-only sink: browser-side `console.*` lines from the
 *  DevConsoleBridge component land here and get appended as NDJSON to
 *  `.claude/dev-console.log` inside the repo. A watching Claude session
 *  (or any `tail -F`) can stream the file to monitor what the user is
 *  seeing in real time without owning a browser.
 *
 *  Returns 404 in production so this surface doesn't ship to users.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 });
  }
  const entries = Array.isArray((payload as { entries?: unknown[] })?.entries)
    ? (payload as { entries: unknown[] }).entries
    : null;
  if (!entries || entries.length === 0) {
    return NextResponse.json({ ok: true, written: 0 });
  }
  const logDir = path.resolve(process.cwd(), ".claude");
  const logPath = path.join(logDir, "dev-console.log");
  try {
    await mkdir(logDir, { recursive: true });
    const lines = entries
      .map((e) => {
        try {
          return JSON.stringify(e);
        } catch {
          return JSON.stringify({ ts: Date.now(), level: "error", args: ["[bridge] unserializable entry"] });
        }
      })
      .join("\n") + "\n";
    await appendFile(logPath, lines, "utf8");
    return NextResponse.json({ ok: true, written: entries.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "write-failed" },
      { status: 500 },
    );
  }
}
