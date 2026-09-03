import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * Regression test for the mute/unmute serialization fix.
 *
 * vad-web's `MicVAD.pause()` and `.start()` are BOTH async and mutate
 * shared internal state (the `listening` flag + the frame-processor
 * `active` flag) with an `await` in the middle. `pause()` sets `active`
 * false AFTER its await; `start()` sets `active` true BEFORE its await.
 * Firing them un-awaited let an unmute's `start()` interleave with a
 * still-in-flight `pause()`, so pause's trailing `active = false` landed
 * after start's `active = true` — leaving the VAD "listening" but deaf.
 *
 * The fake below mirrors that exact ordering hazard. The hook must
 * serialize the two calls: a queued `start()` may not BEGIN until the
 * preceding `pause()` has fully RESOLVED.
 */

type FakeMic = {
  events: string[];
  listening: boolean;
  active: boolean;
  resolvePause: (() => void) | null;
  resolveStart: (() => void) | null;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  destroy: () => Promise<void>;
  setOptions: (u: Record<string, unknown>) => void;
};

let lastMic: FakeMic | null = null;

function makeFakeMic(): FakeMic {
  const mic: FakeMic = {
    events: [],
    // Mirror startOnLoad: the instance comes back already running.
    listening: true,
    active: true,
    resolvePause: null,
    resolveStart: null,
    start: async () => {
      mic.events.push("start:begin");
      if (mic.listening) {
        mic.events.push("start:noop");
        return;
      }
      // Real start() flips `active` true BEFORE awaiting resumeStream.
      mic.listening = true;
      mic.active = true;
      await new Promise<void>((res) => {
        mic.resolveStart = res;
      });
      mic.events.push("start:end");
    },
    pause: async () => {
      mic.events.push("pause:begin");
      if (!mic.listening) {
        mic.events.push("pause:noop");
        return;
      }
      mic.listening = false;
      // Real pause() flips `active` false AFTER awaiting pauseStream —
      // this trailing write is what used to clobber a concurrent start.
      await new Promise<void>((res) => {
        mic.resolvePause = res;
      });
      mic.active = false;
      mic.events.push("pause:end");
    },
    destroy: async () => {},
    setOptions: () => {},
  };
  return mic;
}

vi.mock("@ricky0123/vad-web", () => ({
  MicVAD: {
    new: vi.fn(async () => {
      lastMic = makeFakeMic();
      return lastMic;
    }),
  },
}));

// Flush queued microtasks (the op-chain `.then` callbacks run as
// microtasks, so a single awaited act tick lets the next chained op run
// up to its first internal await).
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useVoiceActivity mute/unmute serialization", () => {
  beforeEach(() => {
    lastMic = null;
    vi.clearAllMocks();
  });

  it("does not begin start() until an in-flight pause() resolves", async () => {
    const { useVoiceActivity } = await import("@/hooks/use-voice-activity");
    const { result } = renderHook(() => useVoiceActivity());

    // Boot the mic.
    await act(async () => {
      await result.current.start();
    });
    const mic = lastMic;
    expect(mic).not.toBeNull();
    if (!mic) return;
    // Drop the boot-time start() noise so the assertions below read clean.
    mic.events.length = 0;

    // Mute → enqueues pause(). It runs up to its internal await and parks.
    act(() => result.current.mute());
    await flush();
    expect(mic.events).toEqual(["pause:begin"]);
    expect(mic.resolvePause).toBeTypeOf("function");

    // Unmute WHILE pause() is still parked → enqueues start() behind it.
    // The fix means start() must NOT have begun yet.
    act(() => result.current.unmute());
    await flush();
    expect(mic.events).toEqual(["pause:begin"]); // start did NOT interleave

    // Let pause() finish; the chain should then run start().
    act(() => mic.resolvePause?.());
    await flush();
    expect(mic.events).toEqual(["pause:begin", "pause:end", "start:begin"]);

    act(() => mic.resolveStart?.());
    await flush();
    expect(mic.events).toEqual([
      "pause:begin",
      "pause:end",
      "start:begin",
      "start:end",
    ]);

    // Net result: re-enabled cleanly. `active` is true (NOT clobbered by
    // a late pause write), which is the whole bug.
    expect(mic.active).toBe(true);
    expect(mic.listening).toBe(true);
  });
});
