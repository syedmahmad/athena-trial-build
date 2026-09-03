"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type InfographicFormula = { label: string; formula: string };
type InfographicGotcha = { title: string; explanation: string };
type InfographicBrief = {
  title: string;
  hook: string;
  formulas: InfographicFormula[];
  gotchas: InfographicGotcha[];
  mnemonic: string | null;
  fun_fact: string;
  color_scheme: string;
};

type InfographicRow = {
  id: string;
  subtopicId: string;
  status: "generating" | "ready" | "failed";
  brief: InfographicBrief | null;
  imageUrl: string | null;
};

type CachedResponse = null | { status: "stale" } | InfographicRow;

async function fetchCached(subtopicId: string): Promise<CachedResponse> {
  const res = await fetch(`/api/infographic/${subtopicId}`);
  if (!res.ok) throw new Error(`Failed to load infographic (${res.status})`);
  return (await res.json()) as CachedResponse;
}

async function generateInfographic(
  subtopicId: string,
  force = false,
): Promise<InfographicRow> {
  const res = await fetch(`/api/infographic/${subtopicId}`, {
    method: "POST",
    ...(force
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        }
      : {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(body.error || `Generation failed (${res.status})`);
  }
  return (await res.json()) as InfographicRow;
}

export default function InfographicPage() {
  const router = useRouter();
  const params = useParams<{ subtopicId: string }>();
  const subtopicId = params.subtopicId;

  const { data: cached, isLoading: isLoadingCache } = useQuery({
    queryKey: ["infographic", subtopicId, "cached"],
    queryFn: () => fetchCached(subtopicId),
    staleTime: 10 * 60_000,
    retry: 0,
  });

  const generate = useMutation({
    mutationFn: (force: boolean) => generateInfographic(subtopicId, force),
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message);
    },
  });

  // Kick off generation if there is no ready cached poster.
  useEffect(() => {
    if (isLoadingCache) return;
    if (cached === undefined) return;
    if (generate.isPending || generate.data) return;
    const hasReady =
      cached !== null &&
      "status" in cached &&
      cached.status === "ready" &&
      "imageUrl" in cached &&
      !!cached.imageUrl;
    if (!hasReady) {
      generate.mutate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cached, isLoadingCache]);

  const row: InfographicRow | null =
    generate.data ??
    (cached &&
    "status" in cached &&
    cached.status === "ready" &&
    "imageUrl" in cached &&
    cached.imageUrl
      ? (cached as InfographicRow)
      : null);

  return (
    <div className="relative min-h-screen">
      <div className="flex items-center justify-between px-6 pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          <ChevronLeft className="h-4 w-4" />
          BACK
        </button>

        {row && row.imageUrl ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => generate.mutate(true)}
              disabled={generate.isPending}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              title="Generate a new variation"
            >
              <RefreshCw className={`h-3 w-3 ${generate.isPending ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Regenerate</span>
            </button>
            <a
              href={row.imageUrl}
              download={`${row.brief?.title ?? "infographic"}.png`}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              title="Download as PNG"
            >
              <Download className="h-3 w-3" />
              <span className="hidden sm:inline">Download</span>
            </a>
          </div>
        ) : null}
      </div>

      {row && row.imageUrl ? (
        <InfographicView row={row} />
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
          onRetry={() => generate.mutate(false)}
        />
      )}
    </div>
  );
}

function InfographicView({ row }: { row: InfographicRow }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 py-8">
      {row.brief ? (
        <div className="flex flex-col items-center gap-1 text-center">
          <h1
            className="text-3xl tracking-tight"
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontWeight: 400,
            }}
          >
            {row.brief.title}
          </h1>
          <p
            className="text-sm text-muted-foreground"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            {row.brief.hook}
          </p>
        </div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: imgLoaded ? 1 : 0, y: imgLoaded ? 0 : 8 }}
        transition={{ duration: 0.4 }}
        className="w-full overflow-hidden rounded-xl border border-border bg-card/20 shadow-2xl"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={row.imageUrl ?? ""}
          alt={row.brief?.title ?? "Infographic"}
          onLoad={() => setImgLoaded(true)}
          className="block h-auto w-full"
        />
      </motion.div>

      {!imgLoaded ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
            Loading image…
          </span>
        </div>
      ) : null}
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
  // gpt-image-2 high-quality is slow; narrate progress so the wait
  // feels intentional rather than broken.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (phase !== "generating") return;
    const id = setInterval(() => setTick((t) => t + 1), 6000);
    return () => clearInterval(id);
  }, [phase]);

  const generatingCopy = [
    "Writing the brief…",
    "Choosing formulas and gotchas…",
    "Painting the poster…",
    "Adding the finishing details…",
    "Almost there…",
  ];
  const generatingLine = generatingCopy[Math.min(tick, generatingCopy.length - 1)];

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card/40"
      >
        {phase === "error" ? (
          <ImageIcon className="h-7 w-7 text-red-500" />
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
          {phase === "loading" && "Loading infographic"}
          {phase === "generating" && "Designing your poster"}
          {phase === "error" && "Something went wrong"}
          {phase === "idle" && "Getting ready"}
        </h2>
        <p
          className="text-sm text-muted-foreground"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          {phase === "loading" && "Checking for a cached poster…"}
          {phase === "generating" &&
            `${generatingLine} This usually takes about a minute.`}
          {phase === "error" && "The designer hit a snag. Try again?"}
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
