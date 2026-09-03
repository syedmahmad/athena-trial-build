import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { buildRequestMetadata } from "@/lib/agent/request-metadata";

/**
 * Proxy to the agents service `/handwriting-ocr` endpoint. Backs the
 * in-canvas "Draw on the board" input — the client captures the
 * student's ink as a black-on-white PNG and sends it here; we return
 * the typeset LaTeX that morphs in on the board.
 *
 * Failure is recoverable: on any non-2xx, timeout, or network error we
 * return `{ latex: "" }`. The client treats an empty string as
 * "couldn't read it" and offers redraw / send-as-image rather than
 * surfacing an error toast.
 */

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

type HandwritingOcrBody = {
  imageBase64: string;
  imageMediaType?: string;
  topic?: string;
  subtopic?: string;
};

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: HandwritingOcrBody;
  try {
    body = (await req.json()) as HandwritingOcrBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.imageBase64 !== "string" || !body.imageBase64) {
    return NextResponse.json(
      { error: "Body must include imageBase64" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/handwriting-ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: body.imageBase64,
        image_media_type: body.imageMediaType || "image/png",
        request_metadata: buildRequestMetadata({
          userId,
          topic: body.topic,
          subtopic: body.subtopic,
        }),
      }),
      // Vision is slower than the sympy checks — give it room. On
      // timeout the client falls back to redraw / send-as-image.
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(
        `[handwriting-ocr] Agent returned ${res.status}:`,
        await res.text().catch(() => "no body"),
      );
      return NextResponse.json({ latex: "" }, { status: 200 });
    }

    const data = (await res.json()) as { latex?: string };
    return NextResponse.json({ latex: data.latex ?? "" });
  } catch (err) {
    console.error("[handwriting-ocr] Error:", err);
    // Soft failure — status 200 with empty latex so the client doesn't
    // surface this as an error toast; it offers redraw instead.
    return NextResponse.json({ latex: "" }, { status: 200 });
  }
}
