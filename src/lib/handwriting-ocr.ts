/**
 * Client helper for the in-canvas "Draw on the board" input.
 *
 * Takes the student's ink as a black-on-white PNG Blob, base64-encodes
 * it, and POSTs to `/api/agent/handwriting-ocr` (which proxies the
 * agents service's single-shot Claude-vision transcription). Returns
 * the recognized LaTeX, or an empty string when the model couldn't read
 * it (or the request failed) — callers treat empty as a soft failure.
 */

type RecognizeOpts = {
  topic?: string;
  subtopic?: string;
  signal?: AbortSignal;
};

/** Encode a Blob to raw base64 + media type via FileReader — the
 *  browser's canonical async base64 encoder (same pattern as the chat
 *  image attach path in `use-lesson-chat.ts`). */
async function encodeBlob(
  blob: Blob,
): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [meta, data] = dataUrl.split(",");
      const mediaType = meta.match(/data:(.*?);/)?.[1] || blob.type || "image/png";
      resolve({ data, mediaType });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function recognizeHandwriting(
  blob: Blob,
  opts: RecognizeOpts = {},
): Promise<string> {
  const { data, mediaType } = await encodeBlob(blob);
  const res = await fetch("/api/agent/handwriting-ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: data,
      imageMediaType: mediaType,
      topic: opts.topic,
      subtopic: opts.subtopic,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    // The route soft-fails to 200/{latex:""}; a non-2xx here means an
    // auth/transport problem. Surface as empty → caller offers redraw.
    return "";
  }
  const json = (await res.json()) as { latex?: string };
  return (json.latex ?? "").trim();
}
