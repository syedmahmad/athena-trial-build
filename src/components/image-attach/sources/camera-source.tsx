"use client";

/**
 * Camera capture source.
 *
 * Opens a live <video> via `getUserMedia` and captures a single
 * frame as a PNG Blob when the user clicks Capture. The stream is
 * torn down (`track.stop()`) immediately after capture AND on
 * unmount so the browser indicator goes away promptly.
 *
 * `audio: false` is explicit — we don't want the camera mic
 * accidentally feeding back into the always-listening VAD.
 *
 * `facingMode: "environment"` is a hint preferred for textbook /
 * paper capture but desktops often only have the front-facing
 * webcam; getUserMedia falls back gracefully.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  onFile: (file: File) => void;
  onError?: (message: string) => void;
  /** True while the parent considers this source active. We start
   *  the camera only when `active` is true and stop it whenever it
   *  flips false. Keeps the indicator off when the tab isn't open. */
  active: boolean;
};

export function CameraSource({ onFile, onError, active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<
    "idle" | "starting" | "live" | "denied" | "missing" | "error"
  >("idle");

  useEffect(() => {
    if (!active) {
      // Stop any active stream.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("starting");
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 1280, height: 720 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {
            // autoplay may reject without user gesture in some
            // configurations — the <video> element still binds the
            // stream and the user can tap it.
          });
        }
        setStatus("live");
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (e.name === "NotAllowedError") {
          setStatus("denied");
          onError?.("Camera permission denied.");
        } else if (e.name === "NotFoundError") {
          setStatus("missing");
          onError?.("No camera found on this device.");
        } else {
          setStatus("error");
          onError?.(e.message || "Camera failed to open.");
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, onError]);

  function capture() {
    const video = videoRef.current;
    if (!video || status !== "live") return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onError?.("Canvas 2D context unavailable.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          onError?.("Capture failed.");
          return;
        }
        // Stop the stream now that we have a frame.
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const file = new File([blob], "capture.png", { type: "image/png" });
        onFile(file);
      },
      "image/png",
      0.95,
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-muted/40 relative overflow-hidden rounded-lg border">
        <video
          ref={videoRef}
          playsInline
          muted
          className="mx-auto block max-h-64 w-full object-contain"
        />
        {status !== "live" && (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
            {status === "starting" && "Opening camera…"}
            {status === "denied" && "Camera permission denied."}
            {status === "missing" && "No camera found."}
            {status === "error" && "Couldn't open camera."}
            {status === "idle" && "Camera off."}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button onClick={capture} disabled={status !== "live"}>
          Capture
        </Button>
      </div>
    </div>
  );
}
