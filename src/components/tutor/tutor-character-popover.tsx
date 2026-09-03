"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Mic, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTutorCharacter } from "@/components/providers/tutor-character-provider";
import { CodexPetSprite } from "@/components/tutor/codex-pet-sprite";
import {
  TUTOR_CHARACTERS,
  TUTOR_VOICES,
  type TutorCharacter,
  type TutorCharacterId,
  type TutorVoice,
} from "@/lib/tutor-characters";

type Props = {
  open: boolean;
  /** Bounding rect of the element that triggered the popover. The
   *  popover anchors below this rect, centered horizontally. */
  anchorRect: DOMRect | null;
  onClose: () => void;
};

const POPOVER_OFFSET = 12; // px below the anchor

/**
 * Portaled character + voice picker. Renders as a floating card below
 * the trigger element. Two rows: characters (selecting one also swaps
 * to the character's default voice), then a secondary voice override
 * row when the user wants a different voice pairing.
 *
 * Portaled to <body> on purpose: orbs typically live inside
 * framer-motion stacking contexts (motion.div, motion.h1) which beat
 * z-index. See feedback_portal_popovers_motion.
 */
export function TutorCharacterPopover({ open, anchorRect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Close on outside-click or Escape. The mousedown listener is on
  // capture so it fires before any inner button's onClick — clicking
  // a chip inside the popover doesn't close (chip is inside ref) but
  // clicking the page or the original trigger does.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const position = anchorRect
    ? {
        top: anchorRect.bottom + POPOVER_OFFSET,
        left: anchorRect.left + anchorRect.width / 2,
      }
    : { top: 100, left: window.innerWidth / 2 };

  // Clamp to viewport so the card never paints off-screen at narrow
  // widths or when the trigger is near the edge.
  const safeLeft = Math.max(
    180,
    Math.min(window.innerWidth - 180, position.left),
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label="Choose tutor character and voice"
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed z-[200] w-[320px] -translate-x-1/2 rounded-xl border border-border bg-card p-3 shadow-2xl"
          style={{ top: position.top, left: safeLeft }}
        >
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tutor
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <CharacterSection />
          {TUTOR_VOICES.length > 1 && (
            <>
              <div className="my-3 border-t border-border" />
              <VoiceSection />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function CharacterSection() {
  const { characterId, selectCharacter } = useTutorCharacter();
  return (
    <div>
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Character
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TUTOR_CHARACTERS.map((c) => (
          <CharacterChip
            key={c.id}
            character={c}
            selected={c.id === characterId}
            onSelect={() => selectCharacter(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function VoiceSection() {
  const { voiceId, setVoiceId } = useTutorCharacter();
  return (
    <div>
      <div className="mb-2 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Volume2 className="h-3 w-3" />
        Voice
      </div>
      <div className="flex flex-col gap-1">
        {TUTOR_VOICES.map((v) => (
          <VoiceRow
            key={v.id}
            voice={v}
            selected={v.id === voiceId}
            onSelect={() => setVoiceId(v.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CharacterChip({
  character,
  selected,
  onSelect,
}: {
  character: TutorCharacter;
  selected: boolean;
  onSelect: () => void;
}) {
  // Hover plays the wave animation so the chip previews the speaking
  // gesture before commit — small but adds liveliness to the picker.
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Use ${character.label}`}
      aria-pressed={selected}
      title={
        character.attribution
          ? `${character.label} — ${character.attribution}`
          : character.label
      }
      className={`group relative flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border p-1.5 transition ${
        selected
          ? "border-foreground bg-foreground/5"
          : "border-border/60 hover:border-foreground/40 hover:bg-foreground/5"
      }`}
    >
      <CharacterAvatar
        character={character}
        size={48}
        orbState={hovered ? "speaking" : "idle"}
      />
      <span
        className={`line-clamp-1 text-[10px] uppercase tracking-wider ${
          selected ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {character.label}
      </span>
      {selected && (
        <Check className="absolute right-1 top-1 h-3 w-3 text-foreground" />
      )}
    </button>
  );
}

function VoiceRow({
  voice,
  selected,
  onSelect,
}: {
  voice: TutorVoice;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Use voice ${voice.label}`}
      aria-pressed={selected}
      className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-left transition ${
        selected
          ? "border-foreground bg-foreground/5"
          : "border-border/60 hover:border-foreground/40 hover:bg-foreground/5"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-foreground">{voice.label}</div>
        {voice.description && (
          <div className="line-clamp-1 text-[10px] text-muted-foreground">
            {voice.description}
          </div>
        )}
      </div>
      {selected && <Check className="ml-2 h-3.5 w-3.5 text-foreground" />}
    </button>
  );
}

/** Renders the character's spritesheet at the given orb state, or the
 *  default orb glyph when the catalog entry has no spritesheet (the
 *  "orb" baseline). `orbState` maps to the codex-pets atlas row:
 *  idle/speaking/listening/thinking — see codex-pet-sprite.tsx. */
export function CharacterAvatar({
  character,
  size,
  orbState = "idle",
  movement = null,
}: {
  character: TutorCharacter;
  size: number;
  orbState?: string;
  movement?: "left" | "right" | null;
}) {
  if (!character.spritesheet) {
    return (
      <span
        className="flex items-center justify-center rounded-full text-white"
        style={{
          width: size,
          height: size,
          backgroundColor: "var(--athena-navy)",
        }}
      >
        <Mic style={{ width: size * 0.45, height: size * 0.45 }} />
      </span>
    );
  }
  return (
    <CodexPetSprite pet={character.spritesheet} size={size} orbState={orbState} movement={movement} />
  );
}

/** Re-exported for callers that need to construct a character avatar
 *  without opening the picker. */
export type { TutorCharacterId };
