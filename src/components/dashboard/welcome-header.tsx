"use client";

import { motion } from "framer-motion";
import { AnimatedSprite } from "@/components/pixel-art/animated-sprite";

export function WelcomeHeader({
  displayName,
}: {
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const name = displayName?.split(" ")[0] || "Warrior";

  return (
    <div className="flex items-center gap-5 p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative flex shrink-0 items-center justify-center"
      >
        <AnimatedSprite
          src="/images/pixel-art/profile-avatar.png"
          alt="Avatar"
          width={64}
          height={64}
        />
      </motion.div>
      <div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground"
        >
          Welcome back, hero
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="text-3xl font-bold tracking-tight"
        >
          {name}
        </motion.h1>
      </div>
    </div>
  );
}
