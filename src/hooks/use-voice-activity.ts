"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  thresholdsForListeningState,
  type VoiceListeningState,
} from "@/lib/voice/voice-listening-state";

/**
 * Always-listening microphone driven by Silero VAD (`@ricky0123/vad-web`).
 *
 * Opens a single mic stream on mount, runs voice-activity detection on
 * it, and surfaces start/end-of-speech events plus the captured audio
 * blob from each utterance. Consumers wire that blob to STT.
 *
 * Design constraints:
 * - One mic stream per page (shared across surfaces via this hook).
 * - Echo cancellation + noise suppression on by default so we don't
 *   re-trigger on the tutor's own TTS bleeding back through the mic.
 * - The hook NEVER auto-starts on mount; the caller calls `start()`
 *   when the surface is ready (avoids prompting for mic on pages
 *   that don't need it).
 * - A future wake-word gate is a drop-in middleware around
 *   `onSpeech` — the hook itself stays unaware of intent.
 *
 * Status callbacks (in mount order during a normal utterance):
 *   onListenStart  — mic open, VAD warm, waiting for speech
 *   onSpeechStart  — VAD detected the user started talking
 *   onSpeechEnd    — VAD detected speech ended, blob available
 *   onSpeechAbort  — utterance was too short or aborted (no blob)
 */

type Options = {
  /** Fired when the mic + VAD are ready and listening for speech. */
  onListenStart?: () => void;
  /** Fires the moment VAD's speech-probability spikes. Eager —
   *  triggers on short tutor-TTS echo blips too. Generally avoid
   *  using this for barge-in; use `onSpeechRealStart` instead. */
  onSpeechStart?: () => void;
  /** Fires once VAD confirms the speech has lasted past `minSpeechMs`.
   *  Wire barge-in here so short echo blips don't cancel the tutor. */
  onSpeechRealStart?: () => void;
  /** Fired with the captured PCM-wav blob when speech ends. Only
   *  fires for confirmed utterances; misfires go through
   *  `onSpeechAbort` instead. */
  onSpeechEnd?: (audio: Blob) => void;
  /** Fired when an utterance was too short / noisy to count. */
  onSpeechAbort?: () => void;
  /** Fail-soft error sink. */
  onError?: (err: Error) => void;
  /**
   * Current listening phase. The hook maps phase → VAD thresholds
   * via `thresholdsForListeningState`. Caller does NOT pick the
   * threshold directly — they describe the phase and the mapping
   * function reconciles. This is the structural guard against the
   * "tutor TTS triggers VAD" regression: any new state must
   * declare its threshold via an exhaustiveness-checked switch.
   *
   * Defaults to `{ phase: "idle" }` so callers that don't care get
   * the safe (echo-resistant) default. Compute via
   * `deriveVoiceListeningState` for the lesson surface — see
   * `src/lib/voice/voice-listening-state.ts`.
   */
  listeningState?: VoiceListeningState;
  /**
   * Boot in the user-muted (off) state. The mic stream still opens so
   * turning it on later is instant (no mid-session permission prompt),
   * but VAD callbacks stay gated until the user unmutes. Defaults to
   * false (boots listening). Set true when the surface should default
   * to off — e.g. a noisy room where ambient sound would misfire VAD.
   */
  initialMuted?: boolean;
};

export type VoiceActivityState =
  | "off"          // not started
  | "starting"    // permission/setup in flight
  | "listening"  // mic warm, no speech
  | "hearing"    // speech in progress
  | "denied"     // mic permission refused
  | "error";

export function useVoiceActivity(options: Options = {}) {
  const [state, setState] = useState<VoiceActivityState>("off");
  // `muted` is the user-driven off-switch (click the mic chip).
  // `suppressed` is the auto-gate the consumer toggles around tutor
  // TTS playback so the tutor's own voice doesn't feed back into the
  // VAD via speaker → mic bleed. They're orthogonal; VAD pauses if
  // either is true.
  const [muted, setMuted] = useState(options.initialMuted ?? false);
  const [suppressed, setSuppressedState] = useState(false);

  // Hold the active VAD instance + the consumer callbacks via a ref so
  // option-identity churn in the parent doesn't tear down the mic on
  // every re-render. (`useMicVAD` from the lib is a hook itself, so we
  // imperatively construct the lib's `MicVAD` class here.)
  const vadRef = useRef<{
    destroy: () => Promise<void>;
    pause: () => Promise<void>;
    start: () => Promise<void>;
    setOptions: (update: Record<string, unknown>) => void;
  } | null>(null);
  // Synchronous "currently starting" flag. The `vadRef.current` check
  // alone isn't enough because `MicVAD.new(...)` is async — both calls
  // in a React StrictMode double-mount can pass the vadRef guard and
  // race for `getUserMedia`. The browser handles one prompt, the loser
  // lands in the catch block as "Mic Error" until reload. This flag is
  // set synchronously before the first await so the second mount's
  // start() bails before kicking off a duplicate MicVAD.new.
  const startingRef = useRef(false);
  const optsRef = useRef(options);
  optsRef.current = options;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;

  const start = useCallback(async () => {
    if (vadRef.current || startingRef.current) return;
    startingRef.current = true;
    setState("starting");
    try {
      // Dynamic import — the VAD bundle is ~1.5 MB (Silero ONNX), only
      // load it when actually invoked. Avoids dragging it into the
      // critical lesson-load path.
      const { MicVAD } = await import("@ricky0123/vad-web");
      // Capture constraints once — they're reused by BOTH the initial
      // getStream and the resume-after-pause path (see resumeStream
      // below).
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      const mic = await MicVAD.new({
        // ONNX runtime + Silero model assets ship with the npm packages
        // but the lib loads them as runtime fetches. Point at jsdelivr
        // for the demo (no Next.js asset-copy machinery required). For
        // production we'd `cp node_modules/@ricky0123/vad-web/dist/*.onnx
        // node_modules/onnxruntime-web/dist/*.wasm public/` and drop the
        // CDN URLs.
        baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
        onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/",
        // Tuning notes:
        //   positiveSpeechThreshold: confidence to count a frame as
        //     speech (higher = stricter; 0.5 = library default).
        //   negativeSpeechThreshold: confidence below which a frame
        //     ends speech (lower = stricter; 0.35 = library default).
        //   redemptionMs: how long we wait below threshold before
        //     declaring speech ended. Bumped to 800ms so the
        //     student can take a natural thought-pause mid-sentence
        //     ("…so wait, why does it equal five?") without the VAD
        //     firing speech-end prematurely and sending an incomplete
        //     transcript. Cost: ~half-second extra latency before the
        //     tutor responds to a completed utterance — worth it for
        //     letting the student finish their thought.
        //   minSpeechMs: shortest utterance counted as speech.
        //     Tuned high (400ms) so tutor-TTS echo bursts — which
        //     typically last <200ms each — die at the VAD layer as
        //     onVADMisfire instead of producing speech-end events.
        //     Real user utterances are reliably >400ms.
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
        // Initial thresholds from the listening state (defaults to
        // idle → conservative). The effect below reapplies whenever
        // the state changes.
        ...thresholdsForListeningState(
          optsRef.current.listeningState ?? { phase: "idle" },
        ),
        // Browser-level audio sanitization to suppress tutor-TTS
        // bleed-through and ambient noise. The lib accepts a custom
        // getStream hook so we can pass these constraints through.
        getStream: () =>
          navigator.mediaDevices.getUserMedia({ audio: audioConstraints }),
        // `start()` after a `pause()` re-acquires the mic via
        // `resumeStream`, NOT `getStream`. Left unset, the lib falls back
        // to its default constraints — so the resumed mic would silently
        // lose our echoCancellation/noiseSuppression tuning after the
        // first mute/unmute cycle and start feeding tutor-TTS echo back
        // into the VAD. Mirror getStream exactly.
        resumeStream: () =>
          navigator.mediaDevices.getUserMedia({ audio: audioConstraints }),
        onSpeechStart: () => {
          if (mutedRef.current || suppressedRef.current) return;
          setState("hearing");
          optsRef.current.onSpeechStart?.();
        },
        onSpeechRealStart: () => {
          if (mutedRef.current || suppressedRef.current) return;
          optsRef.current.onSpeechRealStart?.();
        },
        onSpeechEnd: (audio: Float32Array) => {
          if (mutedRef.current || suppressedRef.current) return;
          setState("listening");
          const wav = encodeWav(audio, 16_000);
          optsRef.current.onSpeechEnd?.(wav);
        },
        onVADMisfire: () => {
          if (mutedRef.current || suppressedRef.current) return;
          setState("listening");
          optsRef.current.onSpeechAbort?.();
        },
      });
      vadRef.current = mic;
      await mic.start();
      setState("listening");
      optsRef.current.onListenStart?.();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      // DOMException with name "NotAllowedError" = mic permission denied.
      if (e.name === "NotAllowedError" || e.message.includes("Permission")) {
        setState("denied");
      } else {
        setState("error");
      }
      optsRef.current.onError?.(e);
    } finally {
      // Always clear the starting flag so a later retry (e.g. the user
      // hits a "try again" button after a transient failure) isn't
      // permanently blocked.
      startingRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    vadRef.current?.destroy();
    vadRef.current = null;
    setState("off");
  }, []);

  const mute = useCallback(() => {
    setMuted(true);
  }, []);

  const unmute = useCallback(() => {
    setMuted(false);
  }, []);

  /** Auto-gate (orthogonal to user mute). The consumer flips this on
   *  when the tutor is speaking so the tutor's voice bleeding through
   *  the speakers doesn't feed back into VAD as "user speech". */
  const setSuppressed = useCallback((next: boolean) => {
    setSuppressedState(next);
  }, []);

  // Re-tune the VAD whenever the listening state changes. The
  // threshold mapping is the single point of policy — see
  // thresholdsForListeningState. Comparing by phase string so deeply-
  // equal state objects don't trigger redundant setOptions calls.
  const listeningPhase = options.listeningState?.phase ?? "idle";
  useEffect(() => {
    if (!vadRef.current) return;
    const state: VoiceListeningState =
      options.listeningState ?? { phase: "idle" };
    vadRef.current.setOptions(thresholdsForListeningState(state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listeningPhase]);

  // Pause / resume the underlying VAD whenever the effective off-switch
  // changes. Tracking a ref of the LAST applied state so we don't fire
  // pause()/start() on every render — only on real transitions.
  //
  // CRITICAL: pause() and start() are BOTH async in vad-web and mutate
  // the SAME internal state (the `listening` flag, the media-stream
  // source node, and the frame-processor `active` flag) with an `await`
  // in the middle — pause() awaits `pauseStream` (track.stop), start()
  // awaits `resumeStream` (a fresh getUserMedia). Firing them
  // un-awaited let an unmute's start() interleave with a still-in-flight
  // pause(): start()'s `frameProcessor.resume()` (active=true) would run
  // first, then pause()'s trailing `frameProcessor.pause()` (active=
  // false) would land AFTER it. Result: the VAD looks "on" (icon + the
  // hook's own state say listening) but `active` is false, so every
  // frame is dropped and the mic is silently deaf until some unrelated
  // event happened to kick it. We serialize every op onto the previous
  // one's completion so pause()/start() can never interleave.
  const vadOpChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastAppliedPauseRef = useRef(false);
  useEffect(() => {
    if (!vadRef.current) return;
    const shouldPause = muted || suppressed;
    if (shouldPause === lastAppliedPauseRef.current) return;
    lastAppliedPauseRef.current = shouldPause;
    vadOpChainRef.current = vadOpChainRef.current
      // Keep the chain alive even if a prior op rejected (e.g. a resume
      // whose getUserMedia was denied) — otherwise one failure would
      // wedge every later toggle.
      .catch(() => {})
      .then(async () => {
        const vad = vadRef.current;
        if (!vad) return; // torn down (stop()/unmount) while queued
        if (shouldPause) {
          await vad.pause();
          // Don't transition state away from "hearing" if mid-utterance
          // — the next onSpeechEnd / VADMisfire will handle that. Just
          // stop emitting new events.
        } else {
          await vad.start();
          setState((s) => (s === "off" || s === "starting" ? s : "listening"));
        }
      });
  }, [muted, suppressed]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      vadRef.current?.destroy();
      vadRef.current = null;
    };
  }, []);

  return { state, muted, suppressed, start, stop, mute, unmute, setSuppressed };
}

// ── WAV encoder ────────────────────────────────────────────────────────
// Silero VAD emits Float32Array PCM at 16 kHz. Wrap it in a minimal
// 16-bit PCM WAV container so the existing /api/agent/speech-to-text
// route (which expects a Blob with a recognizable container) parses
// cleanly. ElevenLabs / Whisper-compatible.

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                 // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // PCM samples — clamp + convert float [-1, 1] → int16.
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
