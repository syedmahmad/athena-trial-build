"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mic, Settings2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTutorCharacter } from "@/components/providers/tutor-character-provider";
import {
  CharacterAvatar,
  TutorCharacterPopover,
} from "@/components/tutor/tutor-character-popover";
import { getTutorCharacter } from "@/lib/tutor-characters";

type VoiceOrbState = "idle" | "listening" | "processing" | "speaking";

type VoiceOrbProps = {
  state: VoiceOrbState;
  amplitude: number;
  onTap: () => void;
  disabled?: boolean;
};

const stateConfig = {
  idle: {
    color: "var(--athena-navy)",
    glowColor: "var(--athena-navy-light)",
  },
  listening: {
    color: "var(--athena-amber)",
    glowColor: "var(--athena-amber-light)",
  },
  processing: {
    color: "var(--athena-navy)",
    glowColor: "var(--athena-navy-light)",
  },
  speaking: {
    color: "var(--athena-success)",
    glowColor: "var(--athena-success-light)",
  },
};

export function VoiceOrb({ state, amplitude, onTap, disabled }: VoiceOrbProps) {
  const config = stateConfig[state];
  const isActive = state === "listening" || state === "speaking";
  const scale = isActive ? 1 + amplitude * 0.3 : 1;
  const { characterId } = useTutorCharacter();
  const character = getTutorCharacter(characterId);
  const hasCharacter = character.spritesheet !== null;

  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer glow ring */}
      <motion.div
        className="absolute rounded-full"
        style={{ backgroundColor: config.glowColor }}
        animate={{
          width: 88 + (isActive ? amplitude * 24 : 0),
          height: 88 + (isActive ? amplitude * 24 : 0),
          opacity: isActive ? 0.3 + amplitude * 0.4 : 0.15,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      />

      {/* Ripple rings (listening/speaking only) */}
      <AnimatePresence>
        {isActive && amplitude > 0.1 && (
          <>
            <motion.div
              key="ripple-1"
              className="absolute rounded-full border-2"
              style={{ borderColor: config.color }}
              initial={{ width: 72, height: 72, opacity: 0.5 }}
              animate={{ width: 120, height: 120, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.div
              key="ripple-2"
              className="absolute rounded-full border-2"
              style={{ borderColor: config.color }}
              initial={{ width: 72, height: 72, opacity: 0.3 }}
              animate={{ width: 140, height: 140, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeOut",
                delay: 0.3,
              }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Processing spinner ring */}
      {state === "processing" && (
        <motion.div
          className="absolute w-[76px] h-[76px] rounded-full"
          style={{
            border: "2px solid transparent",
            borderTopColor: config.color,
            borderRightColor: config.color,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Inner orb button — main tap still controls voice recording.
          When a character is selected, the character image replaces
          the Mic glyph; the colored body remains as the active-state
          indicator behind the image. */}
      <motion.button
        className="relative z-10 flex items-center justify-center w-16 h-16 rounded-full text-white shadow-lg"
        style={{ backgroundColor: config.color }}
        animate={{ scale }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
        onClick={onTap}
        disabled={disabled}
        aria-label={
          state === "idle"
            ? "Start recording"
            : state === "listening"
              ? "Stop recording"
              : state === "processing"
                ? "Processing"
                : "Speaking"
        }
      >
        {hasCharacter ? (
          <CharacterAvatar character={character} size={56} orbState={state} />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </motion.button>

      {/* Picker trigger — small chip overlaid bottom-right. Separate
          target so a tap-to-record on the main body isn't ambiguous.
          Hides while listening/speaking so it doesn't visually compete
          with the active recording state. */}
      <button
        ref={pickerTriggerRef}
        type="button"
        onClick={() => {
          const rect = pickerTriggerRef.current?.getBoundingClientRect() ?? null;
          setAnchorRect(rect);
          setPickerOpen((v) => !v);
        }}
        aria-label="Change tutor character or voice"
        aria-expanded={pickerOpen}
        className={`absolute -bottom-1 -right-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-md transition hover:bg-foreground hover:text-background focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 ${
          isActive ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <Settings2 className="h-3 w-3" />
      </button>

      {/* Idle breathing pulse */}
      {state === "idle" && (
        <motion.div
          className="absolute rounded-full"
          style={{ backgroundColor: config.glowColor }}
          animate={{
            width: [72, 80, 72],
            height: [72, 80, 72],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <TutorCharacterPopover
        open={pickerOpen}
        anchorRect={anchorRect}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
