"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";

export function ProfileNameEditor({
  displayName,
}: {
  displayName: string | null;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayName ?? "");

  const mutation = useMutation({
    mutationFn: (name: string) =>
      fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to update name");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
      toast.success("Name updated");
      setEditing(false);
    },
    onError: () => {
      toast.error("Failed to update name");
    },
  });

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 50) {
      toast.error("Name must be 1-50 characters");
      return;
    }
    mutation.mutate(trimmed);
  };

  const handleCancel = () => {
    setValue(displayName ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          maxLength={50}
          className="h-8 border bg-background px-2 text-base font-semibold outline-none focus:border-foreground"
          disabled={mutation.isPending}
        />
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="text-muted-foreground hover:text-foreground"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          onClick={handleCancel}
          disabled={mutation.isPending}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <p className="text-base font-semibold">{displayName ?? "SAT Quest"}</p>
      <button
        onClick={() => setEditing(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
