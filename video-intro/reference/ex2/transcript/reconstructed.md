# Example 2 — Reconstructed Transcript

> ⚠️ **Reconstructed, not authoritative.** Same caveat as ex1 — re-run Whisper to lock in the real text.

**Topic:** Linear equations with one variable — same as ex1, deeper / equation framing
**Duration:** 28.5s total, but **animation dies at ~15s** (brightness drops to ~3 from 15s onward). Captions and audio continue over essentially black frames. This is the timing-gap problem we want our pipeline to prevent.

## Speech (approximate, single continuous segment per pocketsphinx)

> Look at these two mountain trails taking different paths. One climbs steeply while the other rises more gradually. Each trail can be represented as a linear equation. The steep mountain has a larger slope because its elevation changes fast, while the gentler mountain has a smaller slope because elevation changes more slowly. By writing these trails as equations, we can better understand the relationship and visualize change in the real world.

## Pocketsphinx raw

```
[0.36-28.41] like us at the two mountain trails writing a different floods ralph klein
shop while the other rice is more gradual each trial to be represented as a lenient
equate and cold and just be the mountain has a lot just like his elevation changes
boss while the gentler mountain has a small us because elevation changes more slowly
like rotting these trails equations we can better understand totally new relationships
help as measured and visual exchange in the real world
```

## Key vocabulary preserved
- "two mountain trails" (high confidence)
- "linear equation" → "lenient equate" (high confidence in topic)
- "elevation changes more slowly" (verbatim recovered)
- "real world" (verbatim recovered)
