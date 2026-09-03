import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ElevenLabs not configured" },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as Blob | null;
    if (!audio) {
      return NextResponse.json(
        { error: "No audio provided" },
        { status: 400 }
      );
    }

    const body = new FormData();
    body.append("file", audio, "recording.webm");
    body.append("model_id", "scribe_v1");
    // Force English. Short utterances (single letters / words) are
    // ambiguous enough that Scribe's language detection can flip to
    // Spanish / Italian / etc., e.g., a quick "B" came back as
    // `(serious) Si`. Pinning to English keeps short answers reliable.
    // TODO: make this user-configurable when we add a non-English
    // student cohort.
    body.append("language_code", "eng");

    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error(`ElevenLabs STT error ${res.status}:`, body);
      const detail = body?.detail ?? {};
      return NextResponse.json(
        { error: "Speech-to-text failed", detail },
        { status: 503 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text });
  } catch (err) {
    console.error("STT route error:", err);
    return NextResponse.json(
      { error: "Speech-to-text failed" },
      { status: 503 }
    );
  }
}
