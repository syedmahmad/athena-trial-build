"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronLeft, Headphones, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  PodcastPlayer,
  type PodcastScript,
} from "@/components/podcast/podcast-player";

type CachedResponse =
  | null
  | { status: "stale" }
  | (PodcastScript & { status: "ready" | "generating" | "failed" });

async function fetchCached(subtopicId: string): Promise<CachedResponse> {
  const res = await fetch(`/api/podcast/${subtopicId}`);
  if (!res.ok) throw new Error(`Failed to load podcast (${res.status})`);
  return (await res.json()) as CachedResponse;
}

async function generatePodcast(subtopicId: string): Promise<PodcastScript> {
  const res = await fetch(`/api/podcast/${subtopicId}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(body.error || `Generation failed (${res.status})`);
  }
  return (await res.json()) as PodcastScript;
}

export default function PodcastPage() {
  const router = useRouter();
  const params = useParams<{ subtopicId: string }>();
  const subtopicId = params.subtopicId;

  const { data: cached, isLoading: isLoadingCache } = useQuery({
    queryKey: ["podcast", subtopicId, "cached"],
    queryFn: () => fetchCached(subtopicId),
    staleTime: 10 * 60_000,
    retry: 0,
  });

  const generate = useMutation({
    mutationFn: () => generatePodcast(subtopicId),
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message);
    },
  });

  // Kick off generation if there is no ready cached script.
  useEffect(() => {
    if (isLoadingCache) return;
    if (cached === undefined) return;
    if (generate.isPending || generate.data) return;
    const hasReady =
      cached !== null && "status" in cached && cached.status === "ready";
    if (!hasReady) {
      generate.mutate();
    }
    // generate.mutate is stable from react-query, no need to depend on it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cached, isLoadingCache]);

  const script: PodcastScript | null =
    generate.data ??
    (cached && "status" in cached && cached.status === "ready"
      ? (cached as PodcastScript)
      : null);

  return (
    <div className="relative min-h-screen">
      <div className="px-6 pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          <ChevronLeft className="h-4 w-4" />
          BACK
        </button>
      </div>

      {script ? (
        <PodcastPlayer script={script} />
      ) : (
        <LoadingState
          phase={
            isLoadingCache
              ? "loading"
              : generate.isPending
                ? "generating"
                : generate.isError
                  ? "error"
                  : "idle"
          }
          onRetry={() => generate.mutate()}
        />
      )}
    </div>
  );
}

function LoadingState({
  phase,
  onRetry,
}: {
  phase: "loading" | "generating" | "error" | "idle";
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card/40"
      >
        {phase === "error" ? (
          <Headphones className="h-7 w-7 text-red-500" />
        ) : (
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        )}
      </motion.div>

      <div className="flex flex-col gap-2">
        <h2
          className="text-2xl tracking-tight"
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontWeight: 400,
          }}
        >
          {phase === "loading" && "Loading podcast"}
          {phase === "generating" && "Producing your podcast"}
          {phase === "error" && "Something went wrong"}
          {phase === "idle" && "Getting ready"}
        </h2>
        <p
          className="text-sm text-muted-foreground"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          {phase === "loading" && "Checking for a cached episode…"}
          {phase === "generating" &&
            "Writing the script. This takes about 30 seconds on first listen."}
          {phase === "error" && "The producer hit a snag. Try again?"}
          {phase === "idle" && "Setting things up…"}
        </p>
      </div>

      {phase === "error" ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border bg-card px-4 py-2 text-xs uppercase tracking-[0.22em] transition-colors hover:bg-muted"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
