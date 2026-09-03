// Client-only helpers for turning a teacher's file picks (homework setup) into
// base64 payloads for the homework generator.
//
// NOTE: assignment-view.tsx has a near-identical `fileToWorkPhoto` for the
// student photo-submission path. It is deliberately left untouched here to keep
// that working flow stable; if a third caller appears, collapse both onto this.

export type EncodedFile = {
  /** base64 without the `data:` prefix */
  data: string;
  mediaType: string;
  /** data: URL for an inline preview (images only) */
  previewUrl?: string;
};

/** Downscale an image to ≤maxEdge px JPEG so attachments stay small. Falls back
 *  to the original bytes when canvas decoding fails. */
export async function downscaleImageToJpeg(
  file: File,
  maxEdge = 1600,
  quality = 0.85,
): Promise<EncodedFile> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const [, data] = dataUrl.split(",");
    return { data, mediaType: "image/jpeg", previewUrl: dataUrl };
  } catch {
    const dataUrl = await readAsDataUrl(file);
    const [meta, data] = dataUrl.split(",");
    return {
      data,
      mediaType: meta.match(/data:(.*?);/)?.[1] ?? "image/jpeg",
      previewUrl: dataUrl,
    };
  }
}

/** Read any file as raw base64 (no `data:` prefix). */
export async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  return dataUrl.split(",")[1] ?? "";
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
