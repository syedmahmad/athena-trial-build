"use client";

/**
 * File upload source — drag/drop + click-to-upload.
 *
 * Validates `image/*` MIME type and 10 MB max. Errors surface as
 * `onError(message)` callbacks; the parent panel decides how to
 * present them. The parent owns the captured Blob state — this
 * component is purely an input.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

type Props = {
  onFile: (file: File) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
};

export function FileUploadSource({ onFile, onError, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function validate(file: File): boolean {
    if (!file.type.startsWith("image/")) {
      onError?.("Only image files are supported (PNG, JPEG, WebP, etc).");
      return false;
    }
    if (file.size > MAX_BYTES) {
      onError?.(`Image is too large (max 10 MB).`);
      return false;
    }
    return true;
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (validate(file)) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        handleFiles(e.dataTransfer.files);
      }}
      className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
        dragOver ? "border-primary bg-primary/5" : ""
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        Choose image
      </Button>
      <div className="text-muted-foreground mt-3 text-xs">
        or drag and drop. PNG, JPEG, WebP up to 10 MB.
      </div>
    </div>
  );
}
