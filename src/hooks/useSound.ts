import { useCallback, useEffect, useRef } from "react";

// ── PCM-rendered SFX, played through <Audio> ────────────────────────────
//
// Web Audio (oscillators + GainNode) was the original implementation, but
// some setups (Safari + privacy extensions, audio-routing oddities) leave
// `audioCtx.destination` connected to nothing audible — `state` reports
// "running" and tones are scheduled, yet no sound reaches the speakers.
// SpeechSynthesis and `<Audio>` element playback work fine on the same
// systems because they go through the browser's media element graph
// rather than the WebAudio output graph.
//
// We sidestep the issue by hand-rendering each tone to PCM, wrapping it
// in a WAV blob, and playing it via `new Audio(url).play()`. Same path
// as ElevenLabs TTS, no AudioContext priming required, no state-machine
// races. PCM rendering happens once at module load and the blob URL is
// cached per sound, so playback is instant.

const SAMPLE_RATE = 44100; // matches the typical Web Audio output rate so
                            // the rendered PCM doesn't sound dull next to
                            // native oscillators on systems where both
                            // paths are audible.

type ToneSpec = {
  /** Hz */
  freq: number;
  /** Start offset (s) from the beginning of the rendered clip. */
  start: number;
  /** Tone duration (s). */
  dur: number;
  /** Peak gain (0–1). */
  vol: number;
  /** Waveform. Sine for chimes, square for "wrong" buzz. */
  wave?: "sine" | "square" | "triangle";
};

/** Render a sequence of tones to a Float32Array (mono PCM). */
function renderTones(tones: ToneSpec[]): Float32Array {
  const totalDur =
    Math.max(...tones.map((t) => t.start + t.dur)) + 0.02; // small tail
  const N = Math.ceil(SAMPLE_RATE * totalDur);
  const out = new Float32Array(N);

  for (const t of tones) {
    const startSamp = Math.floor(t.start * SAMPLE_RATE);
    const durSamp = Math.floor(t.dur * SAMPLE_RATE);
    // Tiny linear attack to avoid a click at the leading edge; the rest
    // of the envelope is a bell-shaped exponential decay from `vol` →
    // `0.001` across the full duration. Mirrors the original Web Audio
    // shape: `setValueAtTime(vol, start)` followed by
    // `exponentialRampToValueAtTime(0.001, start + duration)`.
    const attackSamp = Math.max(1, Math.floor(0.003 * SAMPLE_RATE));
    const wave = t.wave ?? "sine";
    const floor = 0.001;
    const decayBase = floor / Math.max(t.vol, floor);

    for (let i = 0; i < durSamp; i++) {
      // Bell-shaped exp decay throughout the tone.
      const p = i / durSamp;
      let env = t.vol * Math.pow(decayBase, p);
      // Smooth click-free attack on the first ~3 ms.
      if (i < attackSamp) {
        env *= i / attackSamp;
      }
      const phase = (2 * Math.PI * t.freq * i) / SAMPLE_RATE;
      let sample: number;
      switch (wave) {
        case "square":
          sample = Math.sin(phase) >= 0 ? 1 : -1;
          break;
        case "triangle":
          sample = (2 / Math.PI) * Math.asin(Math.sin(phase));
          break;
        default:
          sample = Math.sin(phase);
      }
      // Sum into the output (overlapping tones additively combine).
      out[startSamp + i] += env * sample;
    }
  }

  // Soft clip to ±1 to avoid distortion when tones overlap.
  for (let i = 0; i < N; i++) {
    if (out[i] > 1) out[i] = 1;
    else if (out[i] < -1) out[i] = -1;
  }
  return out;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  writeString(v, 0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  writeString(v, 8, "WAVE");
  writeString(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  writeString(v, 36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Lazy-build & cache one Object URL per sound name. */
const urlCache = new Map<string, string>();
function getSoundUrl(name: string, build: () => ToneSpec[]): string | null {
  if (typeof window === "undefined") return null;
  let url = urlCache.get(name);
  if (!url) {
    const pcm = renderTones(build());
    const blob = encodeWav(pcm, SAMPLE_RATE);
    url = URL.createObjectURL(blob);
    urlCache.set(name, url);
  }
  return url;
}

function play(url: string | null) {
  if (!url) return;
  try {
    const audio = new Audio(url);
    audio.volume = 1.0;
    void audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

// ── Sound definitions ───────────────────────────────────────────────────

const buildCorrect = (): ToneSpec[] => [
  // Ascending major-triad arpeggio, sustained envelope.
  { freq: 523, start: 0.0, dur: 0.18, vol: 0.3, wave: "sine" },
  { freq: 659, start: 0.11, dur: 0.18, vol: 0.3, wave: "sine" },
  { freq: 784, start: 0.22, dur: 0.24, vol: 0.3, wave: "sine" },
];

const buildWrong = (): ToneSpec[] => [
  { freq: 200, start: 0.0, dur: 0.2, vol: 0.18, wave: "square" },
  { freq: 180, start: 0.15, dur: 0.3, vol: 0.18, wave: "square" },
];

const buildClick = (): ToneSpec[] => [
  { freq: 800, start: 0.0, dur: 0.05, vol: 0.18, wave: "sine" },
];

const buildPop = (): ToneSpec[] => [
  { freq: 600, start: 0.0, dur: 0.08, vol: 0.22, wave: "sine" },
];

const buildComplete = (): ToneSpec[] => [
  { freq: 523, start: 0.0, dur: 0.3, vol: 0.25, wave: "sine" },
  { freq: 659, start: 0.12, dur: 0.3, vol: 0.25, wave: "sine" },
  { freq: 784, start: 0.24, dur: 0.3, vol: 0.25, wave: "sine" },
  { freq: 1047, start: 0.36, dur: 0.4, vol: 0.25, wave: "sine" },
];

const buildAchievement = (): ToneSpec[] => [
  { freq: 523, start: 0.0, dur: 0.25, vol: 0.25, wave: "sine" },
  { freq: 659, start: 0.1, dur: 0.25, vol: 0.25, wave: "sine" },
  { freq: 784, start: 0.2, dur: 0.25, vol: 0.25, wave: "sine" },
  { freq: 1047, start: 0.3, dur: 0.25, vol: 0.25, wave: "sine" },
  { freq: 1319, start: 0.4, dur: 0.25, vol: 0.25, wave: "sine" },
  { freq: 1047, start: 0.5, dur: 0.5, vol: 0.2, wave: "triangle" },
];

const buildLevelUp = (): ToneSpec[] => [
  { freq: 262, start: 0.0, dur: 0.2, vol: 0.22, wave: "sine" },
  { freq: 330, start: 0.08, dur: 0.2, vol: 0.22, wave: "sine" },
  { freq: 392, start: 0.16, dur: 0.2, vol: 0.22, wave: "sine" },
  { freq: 523, start: 0.24, dur: 0.2, vol: 0.22, wave: "sine" },
  { freq: 659, start: 0.32, dur: 0.2, vol: 0.22, wave: "sine" },
  { freq: 784, start: 0.4, dur: 0.2, vol: 0.22, wave: "sine" },
];

const buildWhoosh = (): ToneSpec[] => {
  // Approximate the descending sweep with three short overlapping tones.
  const out: ToneSpec[] = [];
  const startFreq = 400;
  const endFreq = 100;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const p = i / (steps - 1);
    const freq = startFreq * Math.pow(endFreq / startFreq, p);
    out.push({
      freq,
      start: i * 0.05,
      dur: 0.08,
      vol: 0.16,
      wave: "sine",
    });
  }
  return out;
};

// ── Hook ────────────────────────────────────────────────────────────────

export function useSound() {
  const lastPlayed = useRef(0);

  // Pre-warm the URL cache on first mount so the first sound playback is
  // instant rather than paying the WAV-rendering cost in the click path.
  useEffect(() => {
    getSoundUrl("correct", buildCorrect);
    getSoundUrl("wrong", buildWrong);
    getSoundUrl("click", buildClick);
    getSoundUrl("pop", buildPop);
  }, []);

  const throttle = useCallback((fn: () => void, ms = 100) => {
    const now = Date.now();
    if (now - lastPlayed.current > ms) {
      lastPlayed.current = now;
      fn();
    }
  }, []);

  const correct = useCallback(() => {
    throttle(() => play(getSoundUrl("correct", buildCorrect)));
  }, [throttle]);

  const wrong = useCallback(() => {
    throttle(() => play(getSoundUrl("wrong", buildWrong)));
  }, [throttle]);

  const click = useCallback(() => {
    throttle(() => play(getSoundUrl("click", buildClick)), 50);
  }, [throttle]);

  const pop = useCallback(() => {
    throttle(() => play(getSoundUrl("pop", buildPop)), 30);
  }, [throttle]);

  const complete = useCallback(() => {
    throttle(() => play(getSoundUrl("complete", buildComplete)));
  }, [throttle]);

  const achievement = useCallback(() => {
    throttle(() => play(getSoundUrl("achievement", buildAchievement)));
  }, [throttle]);

  const levelUp = useCallback(() => {
    throttle(() => play(getSoundUrl("levelUp", buildLevelUp)));
  }, [throttle]);

  const whoosh = useCallback(() => {
    throttle(() => play(getSoundUrl("whoosh", buildWhoosh)));
  }, [throttle]);

  return { correct, wrong, click, complete, pop, whoosh, achievement, levelUp };
}
