"use client";

import { useRef, useEffect, useLayoutEffect, useState, useMemo } from "react";
import katex from "katex";
import type { MathAnnotation, TextStyle } from "@/types/whiteboard";
import { adaptWbColor, useIsDarkMode } from "../wb-color";

const FONT_SIZES: Record<string, string> = {
  sm: "16px",
  md: "22px",
  lg: "28px",
  xl: "34px",
};

type WbMathProps = {
  latex: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: TextStyle;
  progress: number;
  isAnimating: boolean;
  onMeasure?: (height: number) => void;
  /** Step-level operation + phase metadata, used by globals.css rules
   *  to drive per-role animations on op-new / op-cancel / op-result
   *  spans. Set as data-wb-op / data-wb-phase on the rendered container. */
  operation?: string;
  phase?: string;
  /** When set (only on COLLAPSE steps), wb-math swaps the displayed
   *  LaTeX to this simplified form after the op-cancel fade completes
   *  so the viewer sees the equation transform in place rather than
   *  just watching the cancelled terms disappear. */
  simplifiedLatex?: string;
  /** Sequenced cross-fade configuration for substitute apply steps that
   *  plug 3+ variables. The renderer paints fromLatex into the ghost
   *  layer (only the var spans visible) and action.latex into the main
   *  container (val spans initially hidden), then sequentially fades
   *  each var→value pair so the student watches one variable get
   *  replaced at a time. */
  substitutionAnimation?: import("@/types/whiteboard").SubstitutionAnimation;
  /** Fly-in substitution for substitute apply steps. Sets up the same
   *  ghost-layer + hidden val-span state machine as substitutionAnimation
   *  but does NOT fire the staggered cross-fade timer. Instead, the
   *  whiteboard canvas drives per-pair "arrival" events imperatively
   *  by toggling the val span's opacity to 1 (and the corresponding
   *  ghost var span's to 0) when a flying value lands. */
  flyInSubstitution?: import("@/types/whiteboard").FlyInSubstitution;
  /** Pair indices whose flying value has already landed. Lets the
   *  main render effect skip re-hiding their val spans on subsequent
   *  re-renders (e.g. when measureSpanIds reference changes mid-step).
   *  Without this, parent re-renders that occur AFTER a pair has
   *  arrived cause katex.render to recreate the val span fresh and
   *  the substitution effect's hide-pass runs again, snapping the
   *  visible value back to opacity 0. */
  arrivedPairs?: ReadonlySet<number>;
  /** Pair indices whose variable name has begun fading out (at 75%
   *  of its flight). Re-renders should keep these vars at opacity 0
   *  rather than snapping them back to 1 — same direction-protection
   *  as `arrivedPairs` but for the var (ghost) side. */
  fadedVarPairs?: ReadonlySet<number>;
  /** True once ALL pairs in this step have arrived plus a short dwell.
   *  Triggers val spans to animate `padding-right` back to 0, contracting
   *  the destination layout from ghost-width to natural width in a single
   *  smooth motion at the end of the morph. */
  settled?: boolean;
  /** Callouts that label specific spans inside the rendered equation.
   *  Each annotation.id must match an htmlClass applied to a span in
   *  the latex. */
  annotations?: MathAnnotation[];
  /** Reports the horizontal center (in container pixels) of the first
   *  equality operator rendered inside the equation, or null if none.
   *  Used by whiteboard-canvas to compute per-group = alignment. */
  onEqMeasure?: (centerX: number | null) => void;
  /** Reports the rendered equation's content bounding box (centerX,
   *  width) in container pixels — measured AFTER any morph/animation
   *  on the FINAL displayed LaTeX. Used by whiteboard-canvas to size
   *  highlight rects to the actual visible equation rather than the
   *  full row. Null when the .katex content hasn't rendered yet. */
  onEqBBoxMeasure?: (bbox: { centerX: number; width: number } | null) => void;
  /** Pixel amount to shift this equation's rendering left/right so its
   *  `=` sign lines up with other equations in the same operationGroupId.
   *  Applied as a CSS translateX on top of the existing scale. */
  alignOffsetX?: number;
  /** Reports the horizontal center (in container pixels) of the first
   *  op-new span rendered inside the equation, or null if none. Used by
   *  whiteboard-canvas to aim the step-to-step arrow at the newly
   *  introduced operand. */
  onOpNewMeasure?: (centerX: number | null) => void;
  /** Span htmlClass ids to measure in the post-katex DOM. Their
   *  bounding rects (centerX + top + bottom + height) are reported via
   *  onSpanRects once per render. Lets whiteboard-canvas compute
   *  cross-step arrows that anchor on specific spans. */
  measureSpanIds?: readonly string[];
  onSpanRects?: (rects: Record<string, { centerX: number; top: number; bottom: number }>) => void;
};

export function WbMath({
  latex, x, y, width, height, style, progress, isAnimating, onMeasure,
  operation, phase, simplifiedLatex, substitutionAnimation, flyInSubstitution, arrivedPairs, fadedVarPairs, settled, annotations,
  onEqMeasure, onEqBBoxMeasure, alignOffsetX, onOpNewMeasure,
  measureSpanIds, onSpanRects,
}: WbMathProps) {
  // Pre-render the substitution `fromLatex` to HTML so it can be
  // injected into the ghost via dangerouslySetInnerHTML — survives
  // remounts that empty the imperative ghost-render approach.
  const fromLatex = substitutionAnimation?.fromLatex ?? flyInSubstitution?.fromLatex ?? "";
  const ghostHtml = useMemo(() => {
    if (!fromLatex) return "";
    if (typeof document === "undefined") return "";
    try {
      const tmp = document.createElement("div");
      katex.render(fromLatex, tmp, {
        throwOnError: false,
        displayMode: true,
        trust: true,
        strict: "ignore",
      });
      return tmp.innerHTML;
    } catch {
      return "";
    }
  }, [fromLatex]);
  const isDark = useIsDarkMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Ghost overlay used during the simplify-morph cross-fade. A clone of
  // the pre-morph katex DOM is dropped here, then cross-faded against
  // the containerRef which gets the newly-rendered simplified latex —
  // so the outgoing and incoming equations overlap visually instead of
  // blinking through a fully-invisible intermediate state.
  const ghostRef = useRef<HTMLDivElement>(null);
  // Populate the ghost imperatively (once per mount, and again only
  // if ghostHtml itself changes). Setting innerHTML here — instead of
  // via dangerouslySetInnerHTML — avoids React re-applying the same
  // HTML on every render and clobbering inline styles that the
  // substitution effect sets on var spans (the var-fade-out).
  useLayoutEffect(() => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    if (ghostHtml && ghost.innerHTML !== ghostHtml) {
      ghost.innerHTML = ghostHtml;
    }
  }, [ghostHtml]);
  const [contentHeight, setContentHeight] = useState(height);
  const [scale, setScale] = useState(1);
  type AnnRect = {
    ann: MathAnnotation;
    centerX: number;
    top: number;
    bottom: number;
  };
  const [annRects, setAnnRects] = useState<AnnRect[]>([]);
  const fontSize = FONT_SIZES[style?.fontSize ?? "md"];
  const color = adaptWbColor(style?.color ?? "var(--foreground)", isDark);
  const effectiveWidth = Math.max(width, 200);

  // Latest onMeasure callback in a ref so the render effect below can
  // call it without listing onMeasure as a dep (which would re-run
  // katex.render and replay the op-* animations every time the parent
  // hands us a new callback identity).
  const onMeasureRef = useRef(onMeasure);
  const onEqMeasureRef = useRef(onEqMeasure);
  const onEqBBoxMeasureRef = useRef(onEqBBoxMeasure);
  const onOpNewMeasureRef = useRef(onOpNewMeasure);
  const onSpanRectsRef = useRef(onSpanRects);
  // alignOffsetX / scale via refs so the morph setTimeout closure
  // sees the live (pre-morph) chain-aligned values when snapshotting
  // the ghost — which must keep its `=` horizontally aligned with
  // where the pre-morph equation displayed, not where the post-morph
  // equation will display.
  const alignOffsetXRef = useRef(alignOffsetX);
  const scaleRef = useRef(scale);
  useEffect(() => {
    onMeasureRef.current = onMeasure;
    onEqMeasureRef.current = onEqMeasure;
    onEqBBoxMeasureRef.current = onEqBBoxMeasure;
    onOpNewMeasureRef.current = onOpNewMeasure;
    onSpanRectsRef.current = onSpanRects;
    alignOffsetXRef.current = alignOffsetX;
    scaleRef.current = scale;
  });

  // Click-to-replay: bumps on user click; included in the render
  // effect's deps so re-running it triggers katex to re-render and
  // animateTaggedSpans to fire again. Scoped to steps that actually
  // animate — triplet APPLY / COLLAPSE and the conclude pulse —
  // so plain setup / identify / plot rows don't show the replay
  // affordance for steps that have nothing to replay.
  const [replayCounter, setReplayCounter] = useState(0);
  const replayable =
    phase === "apply" || phase === "collapse" || operation === "conclude";

  // Render katex + fire per-span animations. Only re-runs when the
  // content itself changes, never when layout props shift. That's what
  // makes past steps hold their post-animation state once a new step
  // is added — they keep their already-animated DOM nodes instead of
  // having katex replace them.
  useEffect(() => {
    if (!containerRef.current) return;
    let swapTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    try {
      // Reset any inline styles the previous playthrough may have
      // left behind (opacity 0 during the mid-morph fade, a leftover
      // transition string, etc.) so a replay starts clean.
      const el = containerRef.current;
      el.style.opacity = "1";
      el.style.transition = "";
      // Reset any vertical offset from a prior morph's `=` alignment
      // — replay should start with the natural pre-morph layout.
      el.style.top = "";
      // Clear any ghost content from a prior morph — replays start
      // with a fresh ghost that gets populated at snapshot time.
      // BUT skip the clear when we have a substitution fromLatex —
      // React-managed dangerouslySetInnerHTML populates the ghost on
      // mount and clearing it imperatively right after would empty it
      // before the substitution effect can find the var spans.
      if (ghostRef.current && !fromLatex) {
        ghostRef.current.innerHTML = "";
        ghostRef.current.style.opacity = "0";
        ghostRef.current.style.top = "";
      }
      katex.render(latex, el, {
        throwOnError: false,
        displayMode: true,
        trust: true,
        strict: "ignore",
      });
      // Propagate \textcolor from src-X spans to any dst-X spans that
      // share the suffix. Lets the author color a "let x = 0" once and
      // have the substituted 0 in the next step pick up the same hue
      // without re-authoring it. Runs in both directions so order of
      // step rendering (and replays) doesn't matter.
      propagateConnectedColors(containerRef.current);
      // Substitution chain (cross-fade or fly-in) takes over the
      // var→val animation, so strip op-new from val spans BEFORE
      // animateTaggedSpans fires — otherwise the default WAAPI op-new
      // fade-in would race the staggered sequence/flight and pop all
      // values in immediately.
      // Width-pad val spans so destination parens / operators sit at
      // the ghost-width footprint (see `applySubPadding` below). Done
      // here, atomically with katex.render, because the render effect
      // is the only thing that replaces innerHTML — applying padding
      // here means it's set on the SAME spans katex just produced and
      // survives until the next render. Doing it from the substitution
      // setup effect alone is fragile: if React re-renders before that
      // effect lands, katex.render wipes the padding we'd just set.
      const subPairs = substitutionAnimation?.sequence ?? flyInSubstitution?.pairs ?? null;
      if (subPairs && ghostRef.current) {
        applySubPadding(containerRef.current, ghostRef.current, subPairs, {
          settled,
        });
      }
      if (substitutionAnimation) {
        for (const pair of substitutionAnimation.sequence) {
          const valEl = containerRef.current.querySelector<HTMLElement>(`.${pair.toSpan}`);
          if (valEl) valEl.classList.remove("op-new");
        }
      }
      if (flyInSubstitution) {
        flyInSubstitution.pairs.forEach((pair, pairIdx) => {
          const valEl = containerRef.current!.querySelector<HTMLElement>(`.${pair.toSpan}`);
          if (!valEl) return;
          valEl.classList.remove("op-new");
          // Hide val spans synchronously HERE (right after katex
          // re-rendered them) so re-renders triggered while a flight
          // is mid-air keep the val hidden — was the root cause of
          // "destination visible during flight". BUT skip the hide
          // for pairs that have already arrived; otherwise the same
          // re-render snaps an already-revealed value back to 0.
          if (arrivedPairs?.has(pairIdx)) {
            valEl.style.opacity = "1";
          } else {
            valEl.style.transition = "";
            valEl.style.opacity = "0";
          }
        });
      }
      // Drive per-span entry animations directly via the Web Animations
      // API. Applied immediately so the spans settle into their final
      // state before the next render cycle can replace them.
      animateTaggedSpans(containerRef.current, operation, phase);
      requestAnimationFrame(() => {
        if (containerRef.current) {
          const h = containerRef.current.scrollHeight;
          if (h > 0) {
            // Snap up to the next multiple of 8 so chromium's and
            // webkit's per-equation line-height rounding (which can
            // diverge by 1-4px on display-mode KaTeX) both land in
            // the same bucket. Eliminates the per-equation drift
            // that otherwise accumulates across a long lesson.
            const measured = h + 4;
            setContentHeight(measured);
            onMeasureRef.current?.(measured);
          }
          if (annotations && annotations.length && wrapperRef.current) {
            // Annotations are absolutely positioned inside the wrapper
            // in CSS pixels (foreignObject local space). Convert
            // getBoundingClientRect viewport-pixel deltas via the
            // local scale factor so the math matches the consumer's
            // coordinate system.
            const wrapperRect = wrapperRef.current.getBoundingClientRect();
            const s = localScale(wrapperRef.current);
            const rects: AnnRect[] = [];
            for (const ann of annotations) {
              const target = containerRef.current.querySelector<HTMLElement>(`.${ann.id}`);
              if (!target) continue;
              const r = target.getBoundingClientRect();
              const left = (r.left - wrapperRect.left) / s;
              const top = (r.top - wrapperRect.top) / s;
              rects.push({
                ann,
                centerX: left + r.width / s / 2,
                top,
                bottom: top + r.height / s,
              });
            }
            setAnnRects(rects);
          } else {
            setAnnRects([]);
          }
          // Measure = sign center-x for cross-step alignment, using the
          // wrapper as the offset ancestor so the coordinate matches
          // what whiteboard-canvas treats as equation-space. Pass the
          // current translateX/scale so the helper can subtract them
          // and return the equation's NATURAL center — invariant
          // across re-renders so chain alignment converges instead of
          // drifting on every replay.
          const ax = alignOffsetXRef.current ?? 0;
          const sx = scaleRef.current;
          if (onEqMeasureRef.current && wrapperRef.current) {
            const eqCenter = measureEqualsCenterX(containerRef.current, wrapperRef.current, ax, sx);
            onEqMeasureRef.current(eqCenter);
          }
          if (onEqBBoxMeasureRef.current && wrapperRef.current) {
            onEqBBoxMeasureRef.current(measureEquationBBox(containerRef.current, wrapperRef.current));
          }
          // Measure first op-new span so whiteboard-canvas can aim its
          // step-to-step arrow at the newly-introduced operand.
          if (onOpNewMeasureRef.current && wrapperRef.current) {
            const opNewCenter = measureOpNewCenterX(containerRef.current, wrapperRef.current, ax, sx);
            onOpNewMeasureRef.current(opNewCenter);
          }
          // Measure arbitrary named spans (for cross-step arrows).
          if (onSpanRectsRef.current && wrapperRef.current && measureSpanIds?.length) {
            onSpanRectsRef.current(
              collectSpanRects(containerRef.current, wrapperRef.current, measureSpanIds, ax, sx),
            );
          }
        }
      });

      // Simplify morph: on COLLAPSE steps with a known simplified form,
      // schedule a cross-fade content swap after the op-cancel fade
      // resolves. The outgoing equation is cloned into ghostRef and
      // faded out while the simplified latex is rendered into
      // containerRef and faded in, so both equations overlap during the
      // transition instead of blinking through an empty intermediate
      // state.
      if (phase === "collapse" && simplifiedLatex) {
        const HOLD_MS = 1900;   // matches animateTaggedSpans op-cancel timing
        const FADE_MS = 500;
        swapTimer = setTimeout(() => {
          if (cancelled || !containerRef.current || !wrapperRef.current) return;
          const el = containerRef.current;
          const ghost = ghostRef.current;

          // WAAPI animations run on the compositor and don't write to
          // inline style even with `fill: "both"`. An innerHTML clone
          // would therefore miss the animated op-cancel fade-out and
          // the ghost would show the cancelled terms popping back to
          // full opacity. commitStyles() writes the current animated
          // values into inline style so the clone carries them.
          for (const span of Array.from(el.querySelectorAll<HTMLElement>(".op-cancel, .op-new, .op-result"))) {
            for (const anim of span.getAnimations()) {
              try { anim.commitStyles(); } catch { /* ignore */ }
            }
          }

          if (ghost) {
            ghost.innerHTML = el.innerHTML;
            // Lock the ghost to the PRE-morph chain alignment so its
            // `=` stays at the visual x where it was just displayed.
            // The container's React style will update to the post-morph
            // alignOffsetX once eqCenter remeasures flow through; this
            // lock keeps the ghost on the pre-morph axis throughout
            // the fade so horizontal `=` continuity holds.
            const liveAlignOffset = alignOffsetXRef.current ?? 0;
            const liveScale = scaleRef.current;
            ghost.style.transform = liveScale < 1 ? `scale(${liveScale})` : "";
            ghost.style.transformOrigin = "top left";
            ghost.style.position = "relative";
            ghost.style.left = liveAlignOffset && Math.abs(liveAlignOffset) > 0.5
              ? `${liveAlignOffset}px`
              : "";
            // Clear any leftover transition from the previous fade so
            // the imperative opacity:1 set below applies instantly.
            ghost.style.transition = "";
            ghost.style.opacity = "1";
          }

          // Render the simplified equation into the container NOW.
          // Set inline opacity to 0 BEFORE rendering so the first paint
          // of the new content is invisible; the CSS transition then
          // fades it in on the next frame.
          try {
            el.style.transition = "";
            el.style.opacity = "0";
            katex.render(simplifiedLatex, el, {
              throwOnError: false,
              displayMode: true,
              trust: true,
              strict: "ignore",
            });
          } catch {
            el.style.opacity = "1";
            return;
          }

          requestAnimationFrame(() => {
            if (cancelled || !containerRef.current || !wrapperRef.current) return;

            // Vertical `=` alignment for the cross-fade. Pre-morph
            // (ghost) and post-morph (container) equations may have
            // different visual heights — e.g. a fraction \frac{2y}{2}
            // puts the `=` near the middle of its tall box while a
            // single line `y = 6` puts the `=` near the top of its
            // short box. Without this, the `=` appears to JUMP
            // vertically across the morph. Measure both and shift
            // whichever has the higher `=` (closer to top) DOWN so
            // both `=`s sit at the same y throughout the fade.
            if (ghost) {
              const ghostEq = Array.from(
                ghost.querySelectorAll<HTMLElement>(".katex-html .mrel"),
              ).find((el) => el.textContent?.trim() === "=");
              const containerEq = Array.from(
                containerRef.current.querySelectorAll<HTMLElement>(".katex-html .mrel"),
              ).find((el) => el.textContent?.trim() === "=");
              if (ghostEq && containerEq) {
                const gY = ghostEq.getBoundingClientRect().top;
                const cY = containerEq.getBoundingClientRect().top;
                const ls = localScale(wrapperRef.current);
                const deltaPx = (cY - gY) / ls;
                if (Math.abs(deltaPx) > 0.5) {
                  if (deltaPx > 0) {
                    // container `=` is BELOW ghost `=` — push ghost
                    // down by deltaPx so they align.
                    const existingTop = parseFloat(ghost.style.top || "0") || 0;
                    ghost.style.top = `${existingTop + deltaPx}px`;
                  } else {
                    // ghost `=` is BELOW container `=` — push
                    // container down by |deltaPx|.
                    containerRef.current.style.top = `${-deltaPx}px`;
                  }
                }
              }
            }

            // Cross-fade via inline CSS transitions instead of WAAPI.
            // WAAPI inside SVG <foreignObject> is the documented
            // Safari weak spot — animations register but don't paint.
            // CSS transitions on opacity work reliably in both
            // engines. Same effect either way: container fades 0→1,
            // ghost fades 1→0 simultaneously.
            const transitionStr = `opacity ${FADE_MS}ms ease-in-out`;
            containerRef.current.style.transition = transitionStr;
            containerRef.current.style.opacity = "1";
            if (ghost) {
              ghost.style.transition = transitionStr;
              ghost.style.opacity = "0";
            }

            // Re-measure the wrapper's height (which now reflects the
            // grid stack — taller of container vs ghost) so the
            // foreignObject / layout slot grows to fit. Ghost is
            // intentionally left in place post-fade (opacity 0 via
            // WAAPI fill:both) so the grid row keeps the pre-morph
            // height — that holds the post-morph equation's baseline
            // at the same Y as the pre-morph equation's baseline.
            const h = wrapperRef.current.scrollHeight;
            if (h > 0) {
              const measured = h + 4;
              setContentHeight(measured);
              onMeasureRef.current?.(measured);
            }
            const ax2 = alignOffsetXRef.current ?? 0;
            const sx2 = scaleRef.current;
            if (onEqMeasureRef.current) {
              onEqMeasureRef.current(
                measureEqualsCenterX(containerRef.current, wrapperRef.current, ax2, sx2),
              );
            }
            if (onEqBBoxMeasureRef.current) {
              onEqBBoxMeasureRef.current(
                measureEquationBBox(containerRef.current, wrapperRef.current),
              );
            }
            if (onOpNewMeasureRef.current) {
              onOpNewMeasureRef.current(
                measureOpNewCenterX(containerRef.current, wrapperRef.current, ax2, sx2),
              );
            }
            if (onSpanRectsRef.current && measureSpanIds?.length) {
              onSpanRectsRef.current(
                collectSpanRects(containerRef.current, wrapperRef.current, measureSpanIds, ax2, sx2),
              );
            }
          });
        }, HOLD_MS);
      }
    } catch {
      if (containerRef.current) {
        containerRef.current.textContent = latex;
      }
    }
    return () => {
      cancelled = true;
      if (swapTimer) clearTimeout(swapTimer);
    };
  }, [latex, operation, phase, simplifiedLatex, substitutionAnimation, flyInSubstitution, annotations, measureSpanIds, replayCounter, settled]);

  // Fit-to-width scale: recomputes on width change without touching katex.
  useEffect(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.scrollWidth;
    if (w === 0) return;
    if (w > effectiveWidth) {
      setScale(effectiveWidth / w);
    } else {
      setScale(1);
    }
  }, [effectiveWidth, contentHeight]);

  // Substitution chain: for substitute apply steps with 3+ variables,
  // render fromLatex into the ghost layer and animate each variable→value
  // cross-fade in sequence. The container already holds the FINAL form
  // (action.latex) — we just hide each val span until its turn comes up.
  //
  // Also handles `flyInSubstitution` (the newer dramatic variant): the
  // setup is identical (ghost rendered, val spans hidden) but the
  // staggered cross-fade timer is SKIPPED — the whiteboard-canvas drives
  // per-pair var-fade-out / val-fade-in imperatively as flying values
  // land on their targets.
  useEffect(() => {
    const subst = substitutionAnimation;
    const flyIn = flyInSubstitution;
    if (!subst && !flyIn) return;
    // Apply phase OR compact single-step substitution. A collapse / state
    // member of a triplet wouldn't have a substitutionAnimation in the
    // first place, but guard explicitly so the effect mirrors the eval.
    if (phase && phase !== "apply") return;
    if (!containerRef.current || !ghostRef.current) return;
    const container = containerRef.current;
    const ghost = ghostRef.current;
    const fromLatex = (subst?.fromLatex ?? flyIn?.fromLatex) ?? "";
    // Normalize: substitutionAnimation uses `sequence`, flyInSubstitution
    // uses `pairs`. Both are {fromSpan, toSpan} arrays for our purposes.
    const sequence: Array<{ fromSpan: string; toSpan: string }> =
      subst?.sequence ?? flyIn?.pairs.map((p) => ({ fromSpan: p.fromSpan, toSpan: p.toSpan })) ?? [];
    const fadeMs = subst?.fadeMs ?? 700;
    const gapMs = subst?.gapMs ?? 600;
    const isFlyIn = !!flyIn && !subst;
    if (!sequence.length) return;

    // Render fromLatex into the ghost SYNCHRONOUSLY (no RAF). The
    // main render effect has already run by the time this effect
    // fires (effects run in declaration order, post-commit), so the
    // container is populated with action.latex. Going synchronous
    // eliminates the RAF cancellation race that was killing ghost
    // rendering in autoplay (parent re-renders cancel pending RAFs
    // faster than they can fire — confirmed empirically: 42 effect
    // runs producing only 1 successful RAF render).
    const cancelled = { value: false };
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Ghost HTML is populated by the useLayoutEffect that mirrors
    // ghostHtml into ghost.innerHTML. If somehow the ghost is empty
    // (pre-render failed or fromLatex unset), skip — there's nothing
    // to apply var/val styles to.
    if (ghost.children.length === 0) return;
    ghost.dataset.flyFromLatex = fromLatex;
    // Hide everything in the ghost via visibility (doesn't cascade into
    // descendants that explicitly set visibility: visible). Then expose
    // only the var spans so the static skeleton from action.latex
    // (already in the container) is the one the student sees.
    ghost.style.visibility = "hidden";
    ghost.style.opacity = "1";
    ghost.style.position = "relative";
    const liveAlignOffset = alignOffsetXRef.current ?? 0;
    const liveScale = scaleRef.current;
    ghost.style.transform = liveScale < 1 ? `scale(${liveScale})` : "";
    ghost.style.transformOrigin = "top left";
    ghost.style.left = liveAlignOffset && Math.abs(liveAlignOffset) > 0.5
      ? `${liveAlignOffset}px`
      : "";

    const varEls: (HTMLElement | null)[] = [];
    const valEls: (HTMLElement | null)[] = [];
    sequence.forEach((pair, pairIdx) => {
      const fromEl = ghost.querySelector<HTMLElement>(`.${pair.fromSpan}`);
      if (fromEl) {
        fromEl.style.visibility = "visible";
        // Honor fadedVarPairs: re-renders during/after var-fade keep
        // the var hidden instead of snapping back to opacity 1.
        if (fadedVarPairs?.has(pairIdx)) {
          fromEl.style.opacity = "0";
        } else {
          fromEl.style.opacity = "1";
        }
        fromEl.style.transition = "";
      }
      varEls.push(fromEl);
      const toEl = container.querySelector<HTMLElement>(`.${pair.toSpan}`);
      if (toEl) {
        for (const a of toEl.getAnimations()) a.cancel();
        for (const child of Array.from(toEl.querySelectorAll<HTMLElement>("*"))) {
          for (const a of child.getAnimations()) a.cancel();
        }
        // Don't reset val opacity to 0 if it's already revealed — the
        // canvas driver set it to 1 on arrive; preserving avoids snap-
        // back. Same direction-protection logic as the var case above.
        const alreadyArrived = arrivedPairs?.has(pairIdx);
        if (!alreadyArrived && (toEl.style.opacity === "" || toEl.style.opacity === "0")) {
          toEl.style.transition = "";
          toEl.style.opacity = "0";
        }
      }
      valEls.push(toEl);
    });

    // Re-apply width-padding on each setup re-fire. The render effect
    // also applies it (atomic with katex.render) but a state-only
    // re-fire here can hit DOM where padding was already set; the
    // helper strips prior padding before measuring so re-runs are
    // idempotent rather than monotonically growing valW.
    applySubPadding(container, ghost, sequence, { settled });

    // For flyInSubstitution: the whiteboard-canvas drives per-pair
    // arrivals imperatively. Skip the auto-staggered cross-fade.
    if (isFlyIn) {
      return () => {
        cancelled.value = true;
      };
    }

    // Schedule the staggered cross-fades for the legacy
    // substitutionAnimation path.
    sequence.forEach((_, i) => {
      const t = setTimeout(() => {
        if (cancelled.value) return;
        const transStr = `opacity ${fadeMs}ms ease-in-out`;
        const varEl = varEls[i];
        const valEl = valEls[i];
        if (varEl) {
          varEl.style.transition = transStr;
          varEl.style.opacity = "0";
        }
        if (valEl) {
          // Padding-right stays where setup put it during the morph;
          // it animates to 0 in a single contraction below once all
          // pairs have faded.
          valEl.style.transition = transStr;
          valEl.style.opacity = "1";
        }
      }, i * gapMs);
      timers.push(t);
    });

    // After the last pair's fade-in completes plus a short dwell,
    // contract padding-right to 0 on every val span — one smooth
    // motion for the whole step instead of per-pair expand/contract.
    const SETTLE_DWELL_MS = 500;
    const SETTLE_DURATION_MS = 450;
    const settleAt = (sequence.length - 1) * gapMs + fadeMs + SETTLE_DWELL_MS;
    const settleTimer = setTimeout(() => {
      if (cancelled.value) return;
      for (const valEl of valEls) {
        if (!valEl) continue;
        valEl.style.transition = `opacity ${fadeMs}ms ease-in-out, padding-right ${SETTLE_DURATION_MS}ms ease-in-out`;
        valEl.style.paddingRight = "0px";
        delete valEl.dataset.subPad;
      }
    }, settleAt);
    timers.push(settleTimer);

    return () => {
      cancelled.value = true;
      for (const t of timers) clearTimeout(t);
    };
  }, [phase, substitutionAnimation, flyInSubstitution, latex, replayCounter, fadedVarPairs, arrivedPairs, settled]);

  // Steps that carry tagged operation metadata drive their own per-span
  // animations via CSS (globals.css @keyframes obs-*). Running the
  // left-to-right clip-path reveal on top hides those animations — the
  // spans finish swiping/fading behind the clip and appear already
  // settled when the clip finishes. Skip the clip for tagged steps so
  // the CSS animations are the entry effect.
  const hasTaggedAnimation = Boolean(operation) || Boolean(phase);
  const clipPath = isAnimating && !hasTaggedAnimation
    ? `inset(0 ${Math.max(0, (1 - progress) * 100)}% 0 0)`
    : "inset(0 0 0 0)";

  const handleReplayClick = (e: React.MouseEvent) => {
    // Don't let the click bubble to the outer <g>, which has selection
    // handling that would treat this as a hit on the math element.
    e.stopPropagation();
    setReplayCounter((n) => n + 1);
  };

  return (
    // Render as a regular HTML <div> instead of an SVG <foreignObject>.
    // Safari has a paint-vs-bcr divergence where foreignObject HTML
    // content paints at a y position that disagrees with what
    // getBoundingClientRect reports — the bug shows up as equations
    // visually overlapping the row above them at wide widths.
    // This component is now positioned by an absolute-positioned
    // wrapper in whiteboard-canvas's overlay layer (sibling to the
    // SVG, in viewport-pixel space). All measurements (heights, span
    // rects, =-center) are still reported in the layout-engine's
    // 1000-unit space so SVG-side consumers (cross-step arrows,
    // highlights) need no changes.
    <div
      ref={wrapperRef}
      className={replayable ? "wb-math-replayable" : undefined}
      title={replayable ? "Click to replay" : undefined}
      onClick={replayable ? handleReplayClick : undefined}
      style={{
        position: "relative",
        width: effectiveWidth,
        cursor: replayable ? "pointer" : undefined,
      }}
    >
        {/* Cross-fade stack: container (current content) and ghost
            (pre-morph snapshot) sit in the same CSS Grid cell with
            align-items: baseline, so KaTeX's natural baselines put
            both equations' `=` at the same Y. */}
        <div className="wb-math-grid">
          <div
            ref={containerRef}
            data-wb-op={operation}
            data-wb-phase={phase}
            style={{
              fontSize,
              color,
              fontWeight: style?.fontWeight ?? "normal",
              clipPath,
              lineHeight: 1.4,
              padding: "4px 0",
              // Normalize font rendering across browsers — webkit
              // and chromium otherwise apply different default
              // kerning / subpixel positioning to KaTeX glyphs,
              // which makes the same equation lay out at slightly
              // different x positions per character (cumulative
              // across the line).
              fontKerning: "none",
              fontVariantLigatures: "none",
              textRendering: "geometricPrecision",
              transformOrigin: "top left",
              transform: scale < 1 ? `scale(${scale})` : undefined,
              // Chain-alignment shift via `position: relative; left`.
              // Tried `marginLeft` first but it reduces the
              // container's effective width (block-level shrink-to-
              // remaining-space), which causes KaTeX to re-center the
              // equation in the narrower box — net visual shift was
              // only ~half the intended amount. `position: relative`
              // with `left` shifts the box's PAINT location without
              // touching its layout box, so the entire equation
              // (including the `=` sign) translates by the requested
              // amount without re-flow.
              position: "relative",
              left: alignOffsetX && Math.abs(alignOffsetX) > 0.5 ? `${alignOffsetX}px` : undefined,
            }}
          />
          {/* Ghost layer. Pre-rendered fromLatex (for fly-in or
              cross-fade substitution) is injected by a
              useLayoutEffect once per mount so it survives
              unmount/remount cycles in autoplay. Avoid
              dangerouslySetInnerHTML — passing a fresh `{__html}`
              object on each render caused React to re-apply
              innerHTML even when the string was unchanged, wiping
              any inline styles (var fade opacity) that the
              substitution effect had set on the ghost's children. */}
          <div
            ref={ghostRef}
            aria-hidden="true"
            style={{
              fontSize,
              color,
              fontWeight: style?.fontWeight ?? "normal",
              lineHeight: 1.4,
              padding: "4px 0",
              pointerEvents: "none",
            }}
          />
        </div>
        {replayable && (
          <span className="wb-math-replay-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </span>
        )}
        {annRects.map(({ ann, centerX, top, bottom }, i) => {
          const side = ann.side ?? "bottom";
          const LINE = 14;
          const LABEL_GAP = 4;
          const labelColor = ann.color ?? "oklch(0.65 0.02 285)";
          const lineTop = side === "bottom" ? bottom + 1 : top - 1 - LINE;
          const labelTop =
            side === "bottom" ? bottom + 1 + LINE + LABEL_GAP : top - 1 - LINE - LABEL_GAP - 14;
          return (
            <div
              key={`ann-${i}-${ann.id}`}
              aria-hidden="true"
              style={{ pointerEvents: "none" }}
            >
              <div
                style={{
                  position: "absolute",
                  left: centerX - 0.5,
                  top: lineTop,
                  width: 1,
                  height: LINE,
                  background: labelColor,
                  opacity: 0.65,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: centerX - 60,
                  top: labelTop,
                  width: 120,
                  textAlign: "center",
                  fontFamily: "var(--font-geist-sans, system-ui)",
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: labelColor,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {ann.label}
              </div>
            </div>
          );
        })}
    </div>
  );
}

/** Local SVG scale factor: viewport pixels per CSS pixel of the
 *  foreignObject content. When the parent SVG renders at a different
 *  pixel size than its viewBox (which is the common case once explicit
 *  pixel sizing is in effect), getBoundingClientRect-derived offsets
 *  are in viewport pixels but the consumer (canvas SVG coords, or
 *  wb-math's own absolute-positioned annotations) needs CSS pixels in
 *  foreignObject-local space — which equals viewBox units 1:1.
 *  Dividing viewport-pixel deltas by this scale yields the correct
 *  CSS-pixel / viewBox-unit measurement. */
/** Walk up from `el` (bounded by `stop`, max 4 ancestors) looking for
 *  the first non-empty next sibling that's on the SAME visual line.
 *
 *  KaTeX wraps content in nested spans; the val span itself often has
 *  no immediate sibling (its parent mord does). The same-line check
 *  prevents grabbing a neighbor on a different equation row when
 *  walking up past the line container — that produces nonsensical
 *  gap math (e.g. -100px when the "neighbor" is the start of the
 *  next equation). */
function findNextVisualNeighbor(
  el: HTMLElement,
  stop: HTMLElement,
): HTMLElement | null {
  const elRect = el.getBoundingClientRect();
  const elMidY = elRect.top + elRect.height / 2;
  const lineSlop = Math.max(elRect.height * 0.6, 8);
  const onSameLine = (r: DOMRect) =>
    Math.abs(r.top + r.height / 2 - elMidY) <= lineSlop;
  let cur: HTMLElement | null = el;
  for (let depth = 0; depth < 4 && cur && cur !== stop; depth++) {
    const sib = cur.nextElementSibling as HTMLElement | null;
    if (sib) {
      const r = sib.getBoundingClientRect();
      if (r.width > 0 && onSameLine(r)) return sib;
    }
    cur = cur.parentElement;
  }
  return null;
}

/** Compute and apply substitute-morph padding only where it's needed.
 *
 *  The "ghost paren clip" symptom: ghost shows wider content (var),
 *  destination is laid out narrower (val). When the ghost var overlays
 *  the container, it can extend past container's neighbor element
 *  (e.g. a closing paren). To prevent that, we pad the val span on
 *  the right so the destination's neighbor sits where ghost expects.
 *
 *  But padding isn't always needed — KaTeX inserts native math-spacing
 *  between elements, and sometimes the val has no neighbor (last in
 *  scope, can overflow harmlessly). The dynamic check:
 *
 *    overshoot = (varW - valW) - existingGap
 *
 *  where `existingGap` is the px between val's right edge and the
 *  next visual neighbor's left edge. We only pad when `overshoot`
 *  exceeds a small threshold, and we pad by exactly the overshoot
 *  plus a tiny buffer for kerning. Cases that skip:
 *    - val has no neighbor (overflow is harmless)
 *    - var ≤ val + buffer (no real overflow)
 *    - native math-spacing already absorbs the delta
 *
 *  After the LAST pair lands plus a short dwell, the canvas flips a
 *  `settled` flag and we tween any applied padding back to 0 in a
 *  single smooth contraction.
 *
 *  Strips any prior padding before measuring so re-runs of the
 *  function (driven by setup-effect re-fire) don't double-count the
 *  previously-applied padding.
 */
function applySubPadding(
  container: HTMLElement,
  ghost: HTMLElement,
  pairs: ReadonlyArray<{ fromSpan: string; toSpan: string }>,
  options: { settled?: boolean } = {},
): void {
  const SUB_PAD_BUFFER_PX = 4;
  const PAD_THRESHOLD_PX = 3;
  const SETTLE_DURATION_MS = 450;
  const { settled = false } = options;
  for (const pair of pairs) {
    const toEl = container.querySelector<HTMLElement>(`.${pair.toSpan}`);
    if (!toEl) continue;
    if (settled) {
      // Settled state: tween any applied padding back to 0 so the
      // destination layout contracts to its natural width. No-op for
      // pairs that never got padded (toEl.dataset.subPad missing).
      if (toEl.dataset.subPad) {
        toEl.style.transition = `padding-right ${SETTLE_DURATION_MS}ms ease-in-out`;
        toEl.style.paddingRight = "0px";
        delete toEl.dataset.subPad;
      }
      continue;
    }
    const fromEl = ghost.querySelector<HTMLElement>(`.${pair.fromSpan}`);
    if (!fromEl) continue;
    // Reset prior padding so valW is the natural width.
    toEl.style.transition = "";
    toEl.style.paddingRight = "";
    // Force layout flush before measuring.
    void toEl.offsetWidth;
    const varW = fromEl.offsetWidth;
    const valW = toEl.offsetWidth;
    const delta = varW - valW;
    if (delta <= PAD_THRESHOLD_PX) {
      // Var is narrower or roughly equal — no overflow risk.
      delete toEl.dataset.subPad;
      continue;
    }
    // Find the visual neighbor and measure the existing gap.
    const neighbor = findNextVisualNeighbor(toEl, container);
    if (!neighbor) {
      // No neighbor — var can extend past harmlessly into trailing
      // whitespace.
      delete toEl.dataset.subPad;
      continue;
    }
    // BCR coords are post-transform but both rects share the same
    // ancestor transform, so the px difference is in the same scale
    // as offsetWidth. Mixing the two is OK for this single pair.
    const valRight = toEl.getBoundingClientRect().right;
    const neighborLeft = neighbor.getBoundingClientRect().left;
    const existingGapPx = neighborLeft - valRight;
    const overshoot = delta - existingGapPx;
    if (overshoot <= PAD_THRESHOLD_PX) {
      // Native math-spacing absorbs the delta.
      delete toEl.dataset.subPad;
      continue;
    }
    const pad = Math.round(overshoot + SUB_PAD_BUFFER_PX);
    toEl.style.paddingRight = `${pad}px`;
    toEl.dataset.subPad = String(pad);
  }
}

function localScale(ancestor: HTMLElement): number {
  const cssWidth = ancestor.offsetWidth;
  if (cssWidth <= 0) return 1;
  const viewportWidth = ancestor.getBoundingClientRect().width;
  if (viewportWidth <= 0) return 1;
  return viewportWidth / cssWidth;
}

/** Return the center of the SINGLE op-new span inside the katex
 *  output, relative to the ancestor, in foreignObject-local CSS
 *  pixels (= viewBox units), with the container's `translateX`
 *  subtracted so the value reflects the equation's NATURAL center
 *  (independent of any chain-alignment shift currently applied).
 *  Stable across re-renders and replays — without this stripping,
 *  every replay would feed back into the chain alignment and drift
 *  the equation horizontally. When there's no op-new or more than
 *  one, returns null. */
function measureOpNewCenterX(
  container: HTMLElement,
  ancestor: HTMLElement,
  _alignOffsetX: number,
  _scale: number,
): number | null {
  const els = container.querySelectorAll<HTMLElement>(".op-new");
  if (els.length !== 1) return null;
  return measureNaturalCenterX(els[0], container, ancestor);
}

function measureEqualsCenterX(
  container: HTMLElement,
  ancestor: HTMLElement,
  _alignOffsetX: number,
  _scale: number,
): number | null {
  const mrels = container.querySelectorAll<HTMLElement>(".katex-html .mrel");
  for (const el of Array.from(mrels)) {
    const text = el.textContent?.trim();
    if (text !== "=") continue;
    return measureNaturalCenterX(el, container, ancestor);
  }
  return null;
}

/** Measures the bounding box of the rendered KaTeX equation (the
 *  .katex-html element) in ancestor-local CSS pixels. Mirrors the
 *  zero-left trick from measureNaturalCenterX so the result is
 *  invariant of the chain-alignment shift. Used to size highlight
 *  rects to the actual visible equation rather than the row width. */
function measureEquationBBox(
  container: HTMLElement,
  ancestor: HTMLElement,
): { centerX: number; width: number } | null {
  // Compute the union of all `.base` rects — KaTeX's `.katex-html`
  // wrapper can stretch wider than the visible math (it's a layout
  // box that includes invisible spacing struts), so measuring the
  // wrapper produces too-wide highlights. The `.base` spans are the
  // actual content rows; their union is the tight visible extent.
  const bases = container.querySelectorAll<HTMLElement>(".katex-html .base");
  if (bases.length === 0) return null;
  const a = ancestor.getBoundingClientRect();
  const s = localScale(ancestor);
  const savedLeft = container.style.left;
  container.style.left = "0px";
  void container.offsetWidth;
  let left = Infinity;
  let right = -Infinity;
  for (const el of Array.from(bases)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.left < left) left = r.left;
    if (r.left + r.width > right) right = r.left + r.width;
  }
  container.style.left = savedLeft;
  if (!isFinite(left) || !isFinite(right) || right <= left) return null;
  const width = right - left;
  return {
    centerX: (left - a.left + width / 2) / s,
    width: width / s,
  };
}

/** Returns the center-x of `el` relative to `ancestor` in
 *  foreignObject-local CSS pixels (= viewBox units), measured with
 *  the container's marginLeft TEMPORARILY ZEROED so the result is
 *  invariant of the current chain-alignment shift. Without this
 *  zero-trick, in-flight WAAPI animations + asynchronous chain-
 *  alignment updates produced reports that mixed natural and aligned
 *  positions, causing the chain to under-shift on each replay. */
function measureNaturalCenterX(
  el: HTMLElement,
  container: HTMLElement,
  ancestor: HTMLElement,
): number | null {
  const a = ancestor.getBoundingClientRect();
  const s = localScale(ancestor);
  const savedLeft = container.style.left;
  container.style.left = "0px";
  // Force layout so the bcr reflects the temporary zero left.
  void container.offsetWidth;
  const r = el.getBoundingClientRect();
  const result = (r.left - a.left + r.width / 2) / s;
  container.style.left = savedLeft;
  return result;
}

/** Collect {centerX, top, bottom} rects for each id, in foreignObject-
 *  local CSS pixels (= viewBox units). centerX is the NATURAL center
 *  (container's translateX subtracted) so consumers can re-add the
 *  alignOffset themselves and not double-count it. */
function collectSpanRects(
  container: HTMLElement,
  ancestor: HTMLElement,
  ids: readonly string[],
  _alignOffsetX: number,
  _scale: number,
): Record<string, { centerX: number; top: number; bottom: number }> {
  const rects: Record<string, { centerX: number; top: number; bottom: number }> = {};
  const a = ancestor.getBoundingClientRect();
  const s = localScale(ancestor);
  // Temporarily zero the container's `left` so the measured rects
  // are invariant of the chain-alignment shift. Single zero-restore
  // pair covers all spans for this batch.
  const savedLeft = container.style.left;
  container.style.left = "0px";
  void container.offsetWidth;
  for (const id of ids) {
    const el = container.querySelector<HTMLElement>(`.${id}`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const left = (r.left - a.left) / s;
    const top = (r.top - a.top) / s;
    rects[id] = {
      centerX: left + r.width / s / 2,
      top,
      bottom: top + r.height / s,
    };
  }
  container.style.left = savedLeft;
  return rects;
}


/** Read the effective color of a `\htmlClass{src-X}{...}` wrapper. The
 *  htmlClass span itself has no inline color — \textcolor renders as a
 *  child span carrying `style="color:..."`. So look for the deepest
 *  inline-colored descendant; fall back to the wrapper's computed color
 *  if nothing inside set an explicit color. Returns null when the
 *  wrapper would inherit the default text color (in which case there's
 *  nothing distinctive to propagate). */
function readConnectedColor(el: HTMLElement): string | null {
  const colored = el.querySelector<HTMLElement>('[style*="color"]');
  if (colored?.style.color) return colored.style.color;
  if (el.style.color) return el.style.color;
  return null;
}

function classKey(el: Element, prefix: string): string | null {
  for (const c of el.classList) {
    if (c.startsWith(prefix)) return c.slice(prefix.length);
  }
  return null;
}

/** Wire `dst-X` spans to the color of their matching `src-X` span so the
 *  author can color a key value once (e.g. `\htmlClass{src-x0}{\textcolor
 *  {#60a5fa}{x = 0}}`) and have its substitutions in later steps inherit
 *  the same hue automatically — no need to repeat \textcolor at every
 *  occurrence. Runs both directions: a fresh src can also push color
 *  back to a dst rendered earlier (relevant on replay). */
function propagateConnectedColors(root: HTMLElement) {
  if (typeof document === "undefined") return;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    const dstKey = classKey(el, "dst-");
    if (dstKey) {
      const src = document.querySelector<HTMLElement>(`.src-${CSS.escape(dstKey)}`);
      if (src) {
        const c = readConnectedColor(src);
        if (c) el.style.color = c;
      }
      continue;
    }
    const srcKey = classKey(el, "src-");
    if (srcKey) {
      const c = readConnectedColor(el);
      if (!c) continue;
      for (const dst of Array.from(
        document.querySelectorAll<HTMLElement>(`.dst-${CSS.escape(srcKey)}`),
      )) {
        dst.style.color = c;
      }
    }
  }
}

/**
 * Animate op-* spans inside a freshly-rendered KaTeX container based on
 * the step's operation and phase. Uses the Web Animations API so we can
 * stagger siblings and pick per-operation motion without CSS-keyframe
 * idiosyncrasies inside SVG foreignObject.
 */
export function animateTaggedSpans(
  root: HTMLElement,
  operation: string | undefined,
  phase: string | undefined,
) {
  if (typeof window === "undefined") return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  const opNew = Array.from(root.querySelectorAll<HTMLElement>(".op-new"));
  const opCancel = Array.from(root.querySelectorAll<HTMLElement>(".op-cancel"));
  const opResult = Array.from(root.querySelectorAll<HTMLElement>(".op-result"));

  const animate = (
    el: HTMLElement,
    frames: Keyframe[],
    timing: EffectTiming,
  ) => {
    try {
      el.style.display = el.style.display || "inline-block";
      // Webkit+foreignObject+WAAPI is the documented weak spot:
      // animations may register but never paint, leaving spans stuck
      // at the first keyframe (typically opacity:0). Apply the FINAL
      // keyframe inline first so the element settles in the correct
      // visible state even if WAAPI fails to paint. The animation
      // then transitions from initial → final on top.
      const finalFrame = frames[frames.length - 1] as Record<string, string | number | undefined>;
      for (const [k, v] of Object.entries(finalFrame)) {
        if (k === "offset" || v == null) continue;
        // Skip transform/filter — those are the properties webkit
        // mis-handles inside foreignObject and would re-trigger the
        // very bug we're working around. Opacity/etc. are safe.
        if (k === "transform" || k === "filter") continue;
        (el.style as unknown as Record<string, string>)[k] = String(v);
      }
      el.animate(frames, { fill: "both", easing: "ease-out", ...timing });
    } catch {
      /* older browsers — silently skip */
    }
  };

  // All tagged spans use a uniform opacity fade. op-new and op-result
  // fade in; op-cancel holds visible for a beat on COLLAPSE then fades
  // out so the cross-fade morph has something to consume.
  opNew.forEach((el, i) => {
    const delay = 150 + i * 80;
    animate(
      el,
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 500, delay },
    );
    // Amber glow that flashes in with the fade-up, holds at peak through
    // the early part of the dwell, then dissolves over the back half.
    // Three stacked text-shadows give a bright core + soft halo +
    // outer bloom. The global [data-wbstep-overlay] .katex * rule forces
    // `color` to var(--obs-fg) (white), but text-shadow is a separate
    // property and shows through. Final keyframe is no-glow so the
    // span settles clean if WAAPI gets interrupted.
    const PEAK_GLOW =
      "0 0 1px rgba(251, 191, 36, 1), 0 0 4px rgba(251, 191, 36, 1), 0 0 12px rgba(251, 191, 36, 1), 0 0 28px rgba(251, 191, 36, 0.85), 0 0 56px rgba(251, 191, 36, 0.5)";
    animate(
      el,
      [
        { textShadow: "0 0 0px rgba(251, 191, 36, 0)" },
        { textShadow: PEAK_GLOW, offset: 0.12 },
        { textShadow: PEAK_GLOW, offset: 0.5 },
        { textShadow: "0 0 0px rgba(251, 191, 36, 0)" },
      ],
      { duration: 3200, delay },
    );
  });

  if (phase === "collapse") {
    opCancel.forEach((el, i) => {
      animate(
        el,
        [{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }],
        { duration: 1500, delay: 400 + i * 80, easing: "ease-in-out" },
      );
      // Strike-through wipe: draws a line through the cancelled term
      // before the opacity fade carries it out. Toggling the class is
      // delayed in lock-step with the per-span opacity stagger so the
      // line lands while the term is still fully visible. On replay,
      // we strip-then-re-add with a forced reflow between so the CSS
      // animation restarts (just adding doesn't trigger a fresh run).
      const strikeDelay = 400 + i * 80;
      el.classList.remove("striking");
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.offsetWidth;
      setTimeout(() => {
        el.classList.add("striking");
      }, strikeDelay);
    });
  }

  opResult.forEach((el, i) => {
    animate(
      el,
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 500, delay: 200 + i * 90 },
    );
  });
}
