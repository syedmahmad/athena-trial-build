"use client";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTutorCharacter } from "@/components/providers/tutor-character-provider";
import {
  CharacterAvatar,
  TutorCharacterPopover,
} from "@/components/tutor/tutor-character-popover";
import { getTutorCharacter } from "@/lib/tutor-characters";

type OrbState = "idle" | "thinking" | "speaking" | "listening";

type Props = {
  state: OrbState;
  amplitude?: number;
  size?: number;
  /** Codex-pet walk direction while roaming; null = play the state gesture. */
  movement?: "left" | "right" | null;
};

const PARALLAX_MAX = 22;       // px — halos/core drift
const HIGHLIGHT_MAX = 18;      // percent — inner highlight travel

export function ObservationOrb({ state, amplitude = 0, size = 260, movement = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const { characterId } = useTutorCharacter();
  const character = getTutorCharacter(characterId);
  const hasCharacter = character.spritesheet !== null;
  const isActive = state === "speaking" || state === "listening";
  const haloScale = isActive ? 1 + amplitude * 0.35 : 1;
  const coreScale = state === "idle"
    ? [1, 1.025, 1]
    : state === "thinking"
      ? [1, 1.05, 1]
      : 1 + amplitude * 0.08;

  // Mouse parallax — track normalized pointer offset in [-1, 1]
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 80, damping: 20, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 80, damping: 20, mass: 0.6 });

  // Hue cycle — restricted to blue tones; a subtle drift from
  // cyan-leaning blue through pure blue to blue-violet and back.
  const hue = useMotionValue(245);
  useEffect(() => {
    const controls = animate(hue, [230, 245, 258, 245, 230], {
      duration: 18,
      repeat: Infinity,
      ease: "easeInOut",
    });
    return () => controls.stop();
  }, [hue]);

  const haloX = useTransform(sx, (v) => v * PARALLAX_MAX);
  const haloY = useTransform(sy, (v) => v * PARALLAX_MAX);
  const midHaloX = useTransform(sx, (v) => v * PARALLAX_MAX * 0.75);
  const midHaloY = useTransform(sy, (v) => v * PARALLAX_MAX * 0.75);
  const coreX = useTransform(sx, (v) => v * PARALLAX_MAX * 0.55);
  const coreY = useTransform(sy, (v) => v * PARALLAX_MAX * 0.55);
  const highlightX = useTransform(sx, (v) => 32 + v * HIGHLIGHT_MAX);
  const highlightY = useTransform(sy, (v) => 30 + v * HIGHLIGHT_MAX);

  // Derived hue-tinted gradients — chroma bumped for a vivid cycle
  const highlightBg = useTransform<number, string>(
    [highlightX, highlightY, hue],
    ([x, y, h]) =>
      `radial-gradient(circle at ${x}% ${y}%, oklch(0.95 0.08 ${h}) 0%, oklch(0.62 0.24 ${h}) 40%, oklch(0.22 0.14 ${h}) 95%)`,
  );
  const outerHaloBg = useTransform(
    hue,
    (h) => `radial-gradient(circle, oklch(0.42 0.22 ${h}), transparent 65%)`,
  );
  const midHaloBg = useTransform(
    hue,
    (h) => `radial-gradient(circle, oklch(0.65 0.26 ${h}), transparent 60%)`,
  );
  const ringBorder = useTransform(hue, (h) => `oklch(0.78 0.20 ${h})`);
  const coreShadow = useTransform(
    hue,
    (h) =>
      `0 0 100px oklch(0.62 0.24 ${h} / 0.6), inset -14px -18px 40px oklch(0.10 0.08 ${h} / 0.7), inset 10px 12px 24px oklch(0.95 0.08 ${h} / 0.3)`,
  );

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Normalize against a reasonable radius (viewport width) so the orb only
      // shifts subtly even when the cursor is in the opposite corner.
      const radiusX = window.innerWidth * 0.6;
      const radiusY = window.innerHeight * 0.6;
      px.set(Math.max(-1, Math.min(1, (e.clientX - cx) / radiusX)));
      py.set(Math.max(-1, Math.min(1, (e.clientY - cy) / radiusY)));
    };
    window.addEventListener("mousemove", handle);
    return () => window.removeEventListener("mousemove", handle);
  }, [px, py]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Concentric faint rings (static — do not parallax) */}
      <div className="absolute inset-0 flex items-center justify-center">
        {[1.0, 1.35, 1.75, 2.2].map((mult, i) => (
          <div
            key={mult}
            className="absolute rounded-full border border-[var(--obs-muted)]"
            style={{
              width: size * 0.55 * mult,
              height: size * 0.55 * mult,
              opacity: 0.12 - i * 0.025,
            }}
          />
        ))}
      </div>

      {/* Thinking orbital ring */}
      {state === "thinking" && (
        <motion.div
          aria-hidden
          className="absolute rounded-full border border-dashed"
          style={{
            width: size * 0.82,
            height: size * 0.82,
            borderColor: ringBorder,
            opacity: 0.3,
            animation: "obs-ring-rotate 8s linear infinite",
          }}
        />
      )}

      {/* Outermost diffuse halo */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.95,
          height: size * 0.95,
          background: outerHaloBg,
          filter: "blur(28px)",
          x: haloX,
          y: haloY,
        }}
        animate={{
          opacity: isActive ? [0.55, 0.85, 0.55] : [0.45, 0.65, 0.45],
          scale: haloScale,
        }}
        transition={{
          duration: isActive ? 1.8 : 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Middle halo */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.7,
          height: size * 0.7,
          background: midHaloBg,
          filter: "blur(18px)",
          x: midHaloX,
          y: midHaloY,
        }}
        animate={{
          opacity: [0.55, 0.85, 0.55],
          scale: state === "thinking" ? [1, 1.06, 1] : 1,
        }}
        transition={{
          duration: state === "thinking" ? 2 : 5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Core sphere — highlight parallaxes inside the gradient. Now a
          button: clicking opens the character + voice picker. The
          character image (if chosen) renders inside the sphere so the
          tutor's face IS the orb. */}
      <motion.button
        ref={triggerRef}
        type="button"
        onClick={() => {
          const rect = triggerRef.current?.getBoundingClientRect() ?? null;
          setAnchorRect(rect);
          setPickerOpen((v) => !v);
        }}
        aria-label="Change tutor character or voice"
        aria-expanded={pickerOpen}
        className="relative flex cursor-pointer items-center justify-center overflow-hidden rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--obs-glow-mid)]"
        style={{
          width: size * 0.42,
          height: size * 0.42,
          background: highlightBg,
          boxShadow: coreShadow,
          x: coreX,
          y: coreY,
        }}
        animate={{ scale: coreScale }}
        transition={{
          duration: state === "thinking" ? 2 : 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {hasCharacter && (
          <span className="pointer-events-none flex items-center justify-center">
            <CharacterAvatar
              character={character}
              size={size * 0.36}
              orbState={state}
              movement={movement}
            />
          </span>
        )}
      </motion.button>

      {/* Listening ripples */}
      {state === "listening" && (
        <>
          <motion.span
            aria-hidden
            className="absolute rounded-full border"
            style={{
              width: size * 0.42,
              height: size * 0.42,
              borderColor: ringBorder,
              animation: "obs-ripple 1.8s ease-out infinite",
            }}
          />
          <motion.span
            aria-hidden
            className="absolute rounded-full border"
            style={{
              width: size * 0.42,
              height: size * 0.42,
              borderColor: ringBorder,
              animation: "obs-ripple 1.8s ease-out 0.6s infinite",
            }}
          />
        </>
      )}

      <TutorCharacterPopover
        open={pickerOpen}
        anchorRect={anchorRect}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
