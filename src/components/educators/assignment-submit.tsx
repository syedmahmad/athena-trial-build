"use client";

import { useMutation } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { useAuthUser } from "@/components/auth/auth-context";

/** Shared submit plumbing for the public student-facing assignment surfaces
 *  (text turn-in form + the quiz-style problem flow). Lifted out of
 *  `assignment-view.tsx` so both can use it without a circular import. */

export type SubmitResult = {
  ok: boolean;
  studentName: string;
  graded?: { grade: number | null; correctCount: number; total: number };
};

export type WorkPhoto = {
  /** base64 without the data: prefix */
  data: string;
  mediaType: string;
  /** object URL for the preview thumbnail */
  previewUrl: string;
};

export const MAX_PHOTOS = 3;

/** Downscale a camera photo to ≤1600px JPEG so submissions stay small.
 *  Falls back to the original file when decoding fails. */
export async function fileToWorkPhoto(file: File): Promise<WorkPhoto> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const [, data] = dataUrl.split(",");
    return {
      data,
      mediaType: "image/jpeg",
      previewUrl: dataUrl,
    };
  } catch {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const [meta, data] = dataUrl.split(",");
    return {
      data,
      mediaType: meta.match(/data:(.*?);/)?.[1] ?? "image/jpeg",
      previewUrl: dataUrl,
    };
  }
}

export function useSubmitWork(assignmentId: string) {
  return useMutation({
    mutationFn: async (payload: {
      response?: string;
      answers?: number[];
      images?: { data: string; mediaType: string }[];
    }): Promise<SubmitResult> => {
      const r = await fetch(`/api/educators/assignments/${assignmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await r.json().catch(() => null)) as
        | (SubmitResult & { error?: string })
        | null;
      if (!r.ok) throw new Error(body?.error ?? "Could not submit. Try again.");
      return body as SubmitResult;
    },
  });
}

/** Shown above the doing UI when signed in — who the work turns in as. */
export const SubmitterBanner = () => {
  const { user } = useAuthUser();
  const email = user?.email;
  if (!email) return null;
  return (
    <div className="font-mono-hud hud-dim mb-4 flex items-center gap-2 text-[11px] tracking-[0.15em]">
      <GraduationCap size={12} />
      TURNING IN AS {email.toUpperCase()}
    </div>
  );
};
