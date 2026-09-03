"use client";

import { useMutation } from "@tanstack/react-query";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MicroLessonSnapshot, ReportKind } from "@/lib/reports/types";

type Props = {
  kind: ReportKind;
  sessionId: string | null | undefined;
  snapshot?: MicroLessonSnapshot;
  variant?: "default" | "outline";
  label?: string;
};

export function DownloadReportButton({
  kind,
  sessionId,
  snapshot,
  variant = "outline",
  label = "Download report",
}: Props) {
  const m = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("Missing session id");
      const res = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, sessionId, snapshot }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "athena-report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error("Couldn't generate report. Try again."),
  });

  return (
    <Button
      variant={variant}
      onClick={() => m.mutate()}
      disabled={m.isPending || !sessionId}
      className="gap-2"
    >
      {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      {m.isPending ? "Generating…" : label}
    </Button>
  );
}
