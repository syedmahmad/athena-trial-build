import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useQuestionNarration } from "@/hooks/use-question-narration";

/**
 * Regression guard for the SAT-quiz cutoff bug:
 *
 *   1. The student presses "Got it" in a takeover.
 *   2. The page plays an encouragement phrase with `interruptible: false`.
 *   3. ~800ms later quiz.goNext() advances to the next problem.
 *   4. The new problem mounts and its question-narration effect calls
 *      play() for the new question.
 *
 * Before the fix, step 4's play() unconditionally cancelled the
 * in-flight encouragement, cutting it mid-sentence. The fix is in
 * useQuestionNarration: play() now honors `interruptible: false` on the
 * in-flight narration by queuing the new request instead of cancelling.
 * On natural end, the queued request drains.
 *
 * The tests mock global.fetch + Audio + SpeechSynthesis so we can
 * advance time deterministically and assert against the orbState
 * machine without burning a real TTS request.
 */

// ── Test environment: a fake Audio that plays for a fixed duration ───
class FakeAudio {
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = true;
  _endTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(src: string) {
    this.src = src;
  }
  play(): Promise<void> {
    this.paused = false;
    // Simulate a 100ms audio clip — anything > 0 is fine, the tests
    // advance fake timers to drive completion.
    this._endTimer = setTimeout(() => {
      if (!this.paused) this.onended?.();
    }, 100);
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    if (this._endTimer) {
      clearTimeout(this._endTimer);
      this._endTimer = null;
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  // Stub fetch to immediately return an empty blob (success path).
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(new Blob(["x"], { type: "audio/wav" })),
  } as unknown as Response);
  // Stub Audio + createObjectURL so play() actually completes.
  // @ts-expect-error — overriding the global for tests.
  globalThis.Audio = FakeAudio;
  globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
  globalThis.URL.revokeObjectURL = vi.fn();
  // Pretend we're not a webdriver so play() proceeds.
  Object.defineProperty(globalThis.navigator, "webdriver", {
    value: false,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Drive the hook's async fetch + audio.play() to completion. */
async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useQuestionNarration", () => {
  it("plays a single narration through to natural end", async () => {
    const { result } = renderHook(() => useQuestionNarration());
    expect(result.current.orbState).toBe("idle");
    act(() => result.current.play("hello", { interruptible: true }));
    expect(result.current.orbState).toBe("thinking");
    await flushAsync();
    // Audio started; orbState transitioned to "speaking".
    expect(result.current.orbState).toBe("speaking");
    // Advance past the fake 100ms audio.
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });
    expect(result.current.orbState).toBe("idle");
  });

  it("play() interrupts an in-flight INTERRUPTIBLE narration", async () => {
    const { result } = renderHook(() => useQuestionNarration());
    act(() => result.current.play("first", { interruptible: true }));
    await flushAsync();
    expect(result.current.orbState).toBe("speaking");
    // Second play arrives — should cancel the first and start.
    act(() => result.current.play("second", { interruptible: true }));
    expect(result.current.orbState).toBe("thinking");
    await flushAsync();
    expect(result.current.orbState).toBe("speaking");
  });

  // ── THE regression this test exists for ──
  it("play() does NOT interrupt an in-flight NON-INTERRUPTIBLE narration", async () => {
    const { result } = renderHook(() => useQuestionNarration());
    // Encouragement plays with interruptible: false (the SAT quiz's
    // "Got it" path).
    act(() => result.current.play("encouragement", { interruptible: false }));
    await flushAsync();
    expect(result.current.orbState).toBe("speaking");
    // Next problem mounts, its question-narration effect calls play()
    // for the new question. Before the fix this would cut the
    // encouragement mid-sentence.
    act(() => result.current.play("next question", { interruptible: true }));
    // Encouragement is still playing — orbState stays "speaking".
    // The new play was queued internally.
    expect(result.current.orbState).toBe("speaking");
  });

  it("drains the queued play() when the non-interruptible narration ends naturally", async () => {
    const { result } = renderHook(() => useQuestionNarration());
    act(() => result.current.play("encouragement", { interruptible: false }));
    await flushAsync();
    act(() => result.current.play("next question", { interruptible: true }));
    expect(result.current.orbState).toBe("speaking");
    // Encouragement audio ends naturally. The drain inside audio.onended
    // fires play() for the queued "next question". act()'s
    // implicit microtask flush carries the new play through fetch + blob
    // + audio.play, so by the time control returns orbState has reached
    // "speaking" again — the key signal is that orbState did NOT
    // return to "idle".
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.orbState).toBe("speaking");
    // Letting the queued narration's own audio end returns to idle.
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });
    expect(result.current.orbState).toBe("idle");
  });

  it("manual cancel() clears the queued play()", async () => {
    const { result } = renderHook(() => useQuestionNarration());
    act(() => result.current.play("encouragement", { interruptible: false }));
    await flushAsync();
    act(() => result.current.play("queued question", { interruptible: true }));
    // Cancel WITHOUT onlyInterruptible — meant to be a hard stop.
    act(() => result.current.cancel());
    expect(result.current.orbState).toBe("idle");
    // Even when audio.onended fires for the cancelled encouragement,
    // the queue should NOT drain — manual cancel clears it.
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });
    expect(result.current.orbState).toBe("idle");
  });

  it("cancel({ onlyInterruptible: true }) leaves a non-interruptible in-flight alone", async () => {
    const { result } = renderHook(() => useQuestionNarration());
    act(() => result.current.play("encouragement", { interruptible: false }));
    await flushAsync();
    expect(result.current.orbState).toBe("speaking");
    act(() => result.current.cancel({ onlyInterruptible: true }));
    // Encouragement is non-interruptible — onlyInterruptible cancel is
    // a no-op.
    expect(result.current.orbState).toBe("speaking");
  });

  it("only one queued play is retained — later queues replace earlier ones", async () => {
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useQuestionNarration());
    act(() => result.current.play("encouragement", { interruptible: false }));
    await flushAsync();
    // Three queued plays land while encouragement is mid-sentence; only
    // the LAST one is retained.
    act(() => result.current.play("queue-1", { interruptible: true }));
    act(() => result.current.play("queue-2", { interruptible: true }));
    act(() => result.current.play("queue-3", { interruptible: true }));
    // Reset fetch spy to count only the drained call.
    fetchSpy.mockClear();
    // Drain.
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // Exactly ONE drained narration fired (queue-3, the last queued).
    // Earlier queue-1 / queue-2 were overwritten before the drain.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Verify the body of that single drained call was the LAST queued text.
    const calls = fetchSpy.mock.calls;
    const body = JSON.parse((calls[0][1] as { body: string }).body);
    expect(body.text).toBe("queue-3");
    // And nothing further queues — advance past its natural end.
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });
    expect(result.current.orbState).toBe("idle");
  });
});

// waitFor is unused but imported to keep parity with future test additions
// where the async timing needs a flexible wait. Suppressing the unused
// warning explicitly.
void waitFor;
