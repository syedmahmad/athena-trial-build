"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Headphones,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  voiceIdForSpeaker,
  displayNameForSpeaker,
  stripAudioTags,
  PODCAST_TTS_MODEL,
  type PodcastSpeakerId,
} from "@/lib/podcast-voices";

// ── Types ───────────────────────────────────────────────────────────────

export type PodcastSpeakerData = {
  id: PodcastSpeakerId;
  name: string;
  role: "host" | "guest";
  bio?: string | null;
};

export type PodcastLine = {
  speaker_id: PodcastSpeakerId;
  text: string;
  tone_hint?: string | null;
};

export type PodcastScript = {
  id: string;
  title: string;
  summary: string;
  speakers: PodcastSpeakerData[];
  lines: PodcastLine[];
  hasGuest: boolean;
  estimatedDurationMinutes: number | null;
};

const PLAYBACK_RATES = [1, 1.25, 1.5] as const;
type PlaybackRate = (typeof PLAYBACK_RATES)[number];

// ── Audio buffer ────────────────────────────────────────────────────────

class AudioBuffer {
  private cache = new Map<number, string>();
  private inflight = new Map<number, Promise<string>>();

  async get(
    lineIndex: number,
    fetcher: (i: number) => Promise<string>,
  ): Promise<string> {
    const cached = this.cache.get(lineIndex);
    if (cached) return cached;
    const existing = this.inflight.get(lineIndex);
    if (existing) return existing;
    const promise = fetcher(lineIndex)
      .then((url) => {
        this.cache.set(lineIndex, url);
        this.inflight.delete(lineIndex);
        return url;
      })
      .catch((err) => {
        this.inflight.delete(lineIndex);
        throw err;
      });
    this.inflight.set(lineIndex, promise);
    return promise;
  }

  prefetch(lineIndex: number, fetcher: (i: number) => Promise<string>): void {
    if (this.cache.has(lineIndex) || this.inflight.has(lineIndex)) return;
    void this.get(lineIndex, fetcher).catch(() => {
      // best-effort; ignore prefetch failures
    });
  }

  destroy(): void {
    this.cache.forEach((url) => URL.revokeObjectURL(url));
    this.cache.clear();
    this.inflight.clear();
  }
}

// ── Component ───────────────────────────────────────────────────────────

export function PodcastPlayer({ script }: { script: PodcastScript }) {
  const [currentLine, setCurrentLine] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bufferRef = useRef<AudioBuffer>(new AudioBuffer());
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const resumeKey = `athena.podcastPos.${script.id}`;

  // ── Fetch audio for line ────────────────────────────────────────────
  const fetchAudio = useCallback(
    async (i: number): Promise<string> => {
      const line = script.lines[i];
      if (!line) throw new Error(`No line at index ${i}`);
      const voiceId = voiceIdForSpeaker(line.speaker_id, script.id);
      const res = await fetch("/api/agent/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: line.text,
          voiceId,
          modelId: PODCAST_TTS_MODEL,
        }),
      });
      if (!res.ok) {
        throw new Error(`TTS failed for line ${i}: ${res.status}`);
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    [script.id, script.lines],
  );

  // ── Resume position on mount ────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(resumeKey);
    if (!saved) return;
    const n = parseInt(saved, 10);
    if (Number.isFinite(n) && n > 0 && n < script.lines.length) {
      setCurrentLine(n);
    }
  }, [resumeKey, script.lines.length]);

  // ── Save resume position ────────────────────────────────────────────
  useEffect(() => {
    if (currentLine > 0) {
      localStorage.setItem(resumeKey, String(currentLine));
    } else {
      localStorage.removeItem(resumeKey);
    }
  }, [currentLine, resumeKey]);

  // ── Load audio when currentLine changes ─────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let cancelled = false;
    setIsLoading(true);
    setHasError(null);

    bufferRef.current
      .get(currentLine, fetchAudio)
      .then((url) => {
        if (cancelled) return;
        audio.src = url;
        audio.playbackRate = playbackRate;
        setIsLoading(false);
        if (isPlaying) {
          audio.play().catch((err) => {
            console.error("[podcast] audio.play failed:", err);
            setIsPlaying(false);
          });
        }
        if (currentLine + 1 < script.lines.length) {
          bufferRef.current.prefetch(currentLine + 1, fetchAudio);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error("[podcast] Failed to load line", currentLine, message);
        setIsLoading(false);
        setHasError("Couldn't load this line. Skip or try again.");
        setIsPlaying(false);
      });

    return () => {
      cancelled = true;
    };
    // playbackRate intentionally excluded — it's applied directly on
    // the audio element via the rate-control useEffect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLine, isPlaying, fetchAudio, script.lines.length]);

  // ── Apply playback rate ─────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate]);

  // ── Cleanup blob URLs on unmount ────────────────────────────────────
  useEffect(() => {
    const buffer = bufferRef.current;
    return () => buffer.destroy();
  }, []);

  // ── Auto-scroll transcript ──────────────────────────────────────────
  useEffect(() => {
    const container = transcriptRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLDivElement>(
      `[data-line-index="${currentLine}"]`,
    );
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLine]);

  // ── Audio event handlers ────────────────────────────────────────────
  const handleEnded = useCallback(() => {
    if (currentLine + 1 < script.lines.length) {
      setCurrentLine((i) => i + 1);
    } else {
      setIsPlaying(false);
    }
  }, [currentLine, script.lines.length]);

  // ── Controls ────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch((err) => {
        console.error("[podcast] play failed:", err);
      });
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const skipForward = useCallback(() => {
    if (currentLine + 1 < script.lines.length) {
      setCurrentLine((i) => i + 1);
    }
  }, [currentLine, script.lines.length]);

  const skipBack = useCallback(() => {
    if (currentLine > 0) setCurrentLine((i) => i - 1);
  }, [currentLine]);

  const jumpToLine = useCallback((i: number) => {
    setCurrentLine(i);
  }, []);

  const cycleRate = useCallback(() => {
    setPlaybackRate((r) => {
      const idx = PLAYBACK_RATES.indexOf(r);
      return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length]!;
    });
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        skipForward();
      } else if (e.key === "ArrowLeft") {
        skipBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, skipForward, skipBack]);

  // ── Speaker lookup ──────────────────────────────────────────────────
  const speakerById = useMemo(() => {
    const map = new Map<PodcastSpeakerId, PodcastSpeakerData>();
    for (const s of script.speakers) map.set(s.id, s);
    return map;
  }, [script.speakers]);

  // ── Progress ────────────────────────────────────────────────────────
  const progress = script.lines.length
    ? (currentLine + 1) / script.lines.length
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <div
          className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-muted-foreground"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          <Headphones className="h-3.5 w-3.5" />
          Podcast
          {script.estimatedDurationMinutes ? (
            <span>· {Math.round(script.estimatedDurationMinutes)} min</span>
          ) : null}
        </div>
        <h1
          className="text-3xl leading-tight tracking-tight"
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontWeight: 400,
          }}
        >
          {script.title}
        </h1>
        <p className="text-sm text-muted-foreground">{script.summary}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {script.speakers.map((s) => (
            <SpeakerChip key={s.id} speaker={s} />
          ))}
        </div>
      </header>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onError={() => {
          setHasError("Audio playback error. Skip or try again.");
          setIsPlaying(false);
        }}
        preload="auto"
      />

      {/* Controls */}
      <div
        className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-4"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={skipBack}
            disabled={currentLine === 0}
            aria-label="Previous line"
            className="rounded-full p-2 transition-colors hover:bg-muted disabled:opacity-30"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" />
            )}
          </button>
          <button
            type="button"
            onClick={skipForward}
            disabled={currentLine + 1 >= script.lines.length}
            aria-label="Next line"
            className="rounded-full p-2 transition-colors hover:bg-muted disabled:opacity-30"
          >
            <SkipForward className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={cycleRate}
            aria-label={`Playback speed ${playbackRate}x`}
            className="rounded-md border border-border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors hover:bg-muted"
          >
            {playbackRate}×
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground tabular-nums">
            {currentLine + 1}/{script.lines.length}
          </span>
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="absolute inset-y-0 left-0 bg-foreground"
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
        </div>
        {hasError ? (
          <div className="text-center text-xs text-red-500">{hasError}</div>
        ) : null}
      </div>

      {/* Transcript */}
      <div
        ref={transcriptRef}
        className="flex max-h-[480px] flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-card/30 p-4"
      >
        {script.lines.map((line, i) => {
          const speaker =
            speakerById.get(line.speaker_id) ??
            ({
              id: line.speaker_id,
              name: line.speaker_id,
              role: "host" as const,
            } as PodcastSpeakerData);
          const displayName = displayNameForSpeaker(line.speaker_id, speaker.name);
          const isActive = i === currentLine;
          return (
            <button
              key={i}
              type="button"
              onClick={() => jumpToLine(i)}
              data-line-index={i}
              className={cn(
                "flex flex-col gap-1 rounded-md p-2 text-left transition-colors",
                isActive
                  ? "bg-foreground/10"
                  : "hover:bg-foreground/5 opacity-60 hover:opacity-100",
              )}
            >
              <div
                className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                <span className="font-semibold text-foreground">{displayName}</span>
                <span className="opacity-60">· {speaker.role}</span>
              </div>
              <p className="text-sm leading-relaxed">
                {stripAudioTags(line.text)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Speaker chip ────────────────────────────────────────────────────────

function SpeakerChip({ speaker }: { speaker: PodcastSpeakerData }) {
  const display = displayNameForSpeaker(speaker.id, speaker.name);
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]"
      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
    >
      <span className="font-semibold">{display}</span>
      <span className="text-muted-foreground">· {speaker.role}</span>
      {speaker.bio ? (
        <span className="text-muted-foreground normal-case tracking-normal">
          — {speaker.bio}
        </span>
      ) : null}
    </span>
  );
}
