"use client";

/**
 * Image-attach modal — capture an image to send to the tutor.
 *
 * Four capture modalities, all yielding a Blob:
 *   - Upload: drag/drop or click
 *   - Paste: ⌘V from clipboard
 *   - Camera: live webcam, capture a frame
 *   - Draw: pen events on a canvas
 *
 * Click "Use" → `onAttach(blob)` and modal closes. The blob lives in
 * the caller's pending-attachment state, included on the next
 * sendChat call. The tutor (Claude via the agents service) receives
 * the image as multimodal input and responds normally.
 *
 * Voice-suppression cleanup-effect: mentor surface needs it so the
 * always-listening VAD doesn't fire while the user is in here.
 *
 * IMPORTANT: this component is loaded via `next/dynamic({ ssr: false })`
 * from `./index.ts`. Don't import directly from a parent.
 */

import { useEffect, useState } from "react";
import { Camera, ImageUp, PenLine } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileUploadSource } from "./sources/file-upload-source";
import { PasteSource } from "./sources/paste-source";
import { CameraSource } from "./sources/camera-source";
import { DrawSource } from "./sources/draw-source";

export type ImageAttachPanelProps = {
  open: boolean;
  onClose: () => void;
  /** Called with the captured image Blob when the user clicks Use. */
  onAttach: (image: Blob) => void;
  onSuppressVoice?: (suppressed: boolean) => void;
  /** "full" (default) → all four sources behind tabs. "draw" → a
   *  focused draw-your-equation canvas only; "Use drawing" attaches
   *  straight away (the canvas already is the preview). */
  initialMode?: "full" | "draw";
};

type Tab = "upload" | "camera" | "draw";

type PanelState =
  | { kind: "picker" }
  | { kind: "captured"; blob: Blob; previewUrl: string };

export function ImageAttachPanel({
  open,
  onClose,
  onAttach,
  onSuppressVoice,
  initialMode = "full",
}: ImageAttachPanelProps) {
  const drawOnly = initialMode === "draw";
  const [panel, setPanel] = useState<PanelState>({ kind: "picker" });
  const [tab, setTab] = useState<Tab>("upload");

  useEffect(() => {
    if (!onSuppressVoice) return;
    onSuppressVoice(true);
    return () => onSuppressVoice(false);
  }, [onSuppressVoice]);

  useEffect(() => {
    if (panel.kind === "picker") return;
    const url = panel.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [panel]);

  function ingestBlob(blob: Blob) {
    const previewUrl = URL.createObjectURL(blob);
    setPanel({ kind: "captured", blob, previewUrl });
  }

  function handleReset() {
    setPanel({ kind: "picker" });
  }

  function handleUse() {
    if (panel.kind !== "captured") return;
    onAttach(panel.blob);
    handleReset();
  }

  const showPicker = panel.kind === "picker";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{drawOnly ? "Draw your equation" : "Attach an image"}</DialogTitle>
          <DialogDescription>
            {drawOnly
              ? "Sketch the equation or problem you need help with. The tutor will read your drawing and respond."
              : "Upload, paste (⌘V), snap, or sketch. The tutor will see the image with your next message and answer."}
          </DialogDescription>
        </DialogHeader>

        {drawOnly ? (
          <DrawSource onFile={(file) => onAttach(file)} onError={(m) => toast.error(m)} />
        ) : (
          <>
            <PasteSource active={open} onFile={(file) => ingestBlob(file)} />

            {showPicker && (
              <>
                <SourceTabs value={tab} onChange={setTab} />
                <div className="min-h-[180px]">
                  {tab === "upload" && (
                    <FileUploadSource
                      onFile={(file) => ingestBlob(file)}
                      onError={(m) => toast.error(m)}
                    />
                  )}
                  {tab === "camera" && (
                    <CameraSource
                      active={tab === "camera" && showPicker}
                      onFile={(file) => ingestBlob(file)}
                      onError={(m) => toast.error(m)}
                    />
                  )}
                  {tab === "draw" && (
                    <DrawSource
                      onFile={(file) => ingestBlob(file)}
                      onError={(m) => toast.error(m)}
                    />
                  )}
                </div>
              </>
            )}

            {panel.kind === "captured" && (
              <div className="space-y-3">
                <CapturedPreview previewUrl={panel.previewUrl} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={handleReset}>
                    Choose different
                  </Button>
                  <Button onClick={handleUse}>Use</Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

function SourceTabs({
  value,
  onChange,
}: {
  value: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: Array<{ id: Tab; label: string; icon: typeof Camera }> = [
    { id: "upload", label: "Upload", icon: ImageUp },
    { id: "camera", label: "Camera", icon: Camera },
    { id: "draw", label: "Draw", icon: PenLine },
  ];
  return (
    <div className="bg-muted/30 inline-flex gap-1 rounded-md p-1">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function CapturedPreview({ previewUrl }: { previewUrl: string }) {
  return (
    <div className="bg-muted/40 overflow-hidden rounded-lg border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl}
        alt="Attached image preview"
        className="mx-auto max-h-48 object-contain"
      />
    </div>
  );
}
