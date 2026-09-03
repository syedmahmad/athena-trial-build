import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

type Emotion = "neutral" | "happy" | "thinking" | "excited" | "encouraging";

// 16x16 pixel grid professor
const SKIN = "hsl(30, 60%, 70%)";
const HAT = "hsl(220, 30%, 20%)";
const HAT_BAND = "hsl(var(--yellow))";
const TASSEL = "hsl(var(--yellow))";
const ROBE = "hsl(var(--blue))";
const ROBE_DARK = "hsl(190, 72%, 40%)";
const BG = "transparent";
const EYES = "hsl(var(--foreground))";
const MOUTH = "hsl(var(--foreground))";
const CHEEK = "hsl(340, 60%, 65%)";

type Row = (string | null)[];

function getPixelGrid(emotion: Emotion): Row[] {
  const _ = null;
  const S = SKIN;
  const H = HAT;
  const B = HAT_BAND;
  const T = TASSEL;
  const R = ROBE;
  const D = ROBE_DARK;
  const E = EYES;
  const M = MOUTH;
  const C = CHEEK;

  // Happy/excited eyes = squinted (^_^)
  const isHappy = emotion === "happy" || emotion === "excited";
  const isThinking = emotion === "thinking";

  return [
    // Row 0-2: Mortarboard hat
    [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
    [_, _, _, _, H, H, H, H, H, H, H, H, _, _, _, _],
    [_, _, _, _, _, _, B, B, B, B, _, _, _, T, _, _],
    // Row 3: Tassel
    [_, _, _, _, _, _, _, _, _, _, _, _, _, T, _, _],
    // Row 4-8: Head
    [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
    [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
    // Eyes row
    ...(isHappy ? [
      [_, _, _, _, S, S, E, S, S, E, S, S, _, _, _, _] as Row, // ^_^ eyes (dots for squint)
    ] : isThinking ? [
      [_, _, _, _, S, E, E, S, S, E, E, S, _, _, _, _] as Row, // o_o eyes
    ] : [
      [_, _, _, _, S, E, E, S, S, E, E, S, _, _, _, _] as Row, // normal eyes
    ]),
    // Cheeks + nose
    [_, _, _, _, S, C, S, S, S, S, C, S, _, _, _, _],
    // Mouth row
    ...(isHappy ? [
      [_, _, _, _, S, S, S, M, M, S, S, S, _, _, _, _] as Row, // smile
    ] : isThinking ? [
      [_, _, _, _, S, S, S, S, M, M, S, S, _, _, _, _] as Row, // side mouth
    ] : [
      [_, _, _, _, S, S, M, M, M, M, S, S, _, _, _, _] as Row, // neutral
    ]),
    // Row 9-10: Chin
    [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
    // Row 11-15: Robe/body
    [_, _, _, _, R, R, R, R, R, R, R, R, _, _, _, _],
    [_, _, _, R, R, D, R, R, R, R, D, R, R, _, _, _],
    [_, _, _, R, R, D, R, R, R, R, D, R, R, _, _, _],
    [_, _, _, R, R, R, R, R, R, R, R, R, R, _, _, _],
    [_, _, _, _, R, R, R, R, R, R, R, R, _, _, _, _],
  ];
}

interface Props {
  emotion: Emotion;
  isTalking: boolean;
  size?: number;
}

export default function PixelCharacter({ emotion, isTalking, size = 64 }: Props) {
  const grid = getPixelGrid(emotion);
  const cellSize = size / 16;

  return (
    <motion.div className="relative">
      {/* Glow behind */}
      <motion.div
        className="absolute inset-0 rounded-full blur-xl"
        style={{
          background: "radial-gradient(circle, hsl(var(--blue) / 0.15) 0%, transparent 70%)",
          transform: "scale(1.8)",
        }}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity }}
      />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative z-10 drop-shadow-lg">
        {grid.map((row, y) =>
          row.map((color, x) =>
            color ? (
              <motion.rect
                key={`${x}-${y}`}
                x={x * cellSize}
                y={y * cellSize}
                width={cellSize + 0.5}
                height={cellSize + 0.5}
                fill={color}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (y * 16 + x) * 0.002, duration: 0.15 }}
              />
            ) : null
          )
        )}

        {/* Talking mouth animation — overlay flicker */}
        {isTalking && (
          <motion.rect
            x={7 * cellSize}
            y={9 * cellSize}
            width={cellSize * 2}
            height={cellSize}
            fill={MOUTH}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.25, repeat: Infinity }}
          />
        )}
      </svg>

      {/* Sparkle for excited */}
      {emotion === "excited" && (
        <motion.div
          className="absolute -top-1 -right-1 z-20"
          animate={{ scale: [1, 1.3, 1], rotate: [0, 15, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <Sparkles className="w-4 h-4" style={{ color: "hsl(var(--yellow))" }} />
        </motion.div>
      )}
    </motion.div>
  );
}
