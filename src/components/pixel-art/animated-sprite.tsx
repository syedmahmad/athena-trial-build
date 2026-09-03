"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export function AnimatedSprite({
  src,
  alt,
  width = 64,
  height = 64,
  className,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={`rounded-lg ${className ?? ""}`}
      style={{ width, height, overflow: "hidden" }}
      animate={{
        y: [0, -4, 0],
        scale: [1, 1.02, 1],
      }}
      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
      whileHover={{ scale: 1.15, rotate: [0, -5, 5, 0], transition: { duration: 0.4 } }}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="object-contain"
      />
    </motion.div>
  );
}
