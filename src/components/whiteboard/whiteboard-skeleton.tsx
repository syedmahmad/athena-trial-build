"use client";

import { motion } from "framer-motion";

const PLACEHOLDER_BLOCKS = [
  { x: 50, y: 30, width: 400, height: 36 },   // Title
  { x: 50, y: 90, width: 600, height: 28 },   // Subtitle
  { x: 50, y: 142, width: 350, height: 70 },  // Math block
  { x: 50, y: 236, width: 700, height: 28 },  // Text
  { x: 90, y: 288, width: 500, height: 20 },  // Indented text
  { x: 50, y: 332, width: 300, height: 120 }, // Diagram/shape
  { x: 50, y: 476, width: 450, height: 70 },  // Math block
];

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const blockVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 0.45, y: 0, transition: { duration: 0.3 } },
};

export function WhiteboardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        background: "var(--wb-canvas)",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <svg
        viewBox="0 0 1000 600"
        width="100%"
        height="100%"
        preserveAspectRatio="xMinYMin meet"
        style={{ userSelect: "none" }}
      >
        {/* Grid background — matches WhiteboardCanvas */}
        <defs>
          <pattern
            id="wb-grid-skeleton"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              style={{ stroke: "var(--border)" }}
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wb-grid-skeleton)" />

        {/* Placeholder blocks */}
        <motion.g
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {PLACEHOLDER_BLOCKS.map((block, i) => (
            <motion.rect
              key={i}
              x={block.x}
              y={block.y}
              width={block.width}
              height={block.height}
              rx={6}
              style={{ fill: "var(--wb-hover-fill)" }}
              variants={blockVariants}
              animate={{
                opacity: [0.3, 0.55, 0.3],
              }}
              transition={{
                opacity: {
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.15,
                },
              }}
            />
          ))}
        </motion.g>
      </svg>
    </div>
  );
}
