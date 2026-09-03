"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./landing-hero.module.css";

export function LandingHero({ destination }: { destination: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const handleEnter = () => {
    if (leaving) return;
    setLeaving(true);
    router.prefetch(destination);
    setTimeout(() => router.push(destination), 700);
  };

  return (
    <div className={`${styles.root} ${leaving ? styles.leaving : ""}`}>
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.starfield} aria-hidden="true" />

      <main className={styles.stage} data-screen-label="Athena Entry">
        <div className={styles.orbWrap} aria-hidden="true">
          <div className={styles.orbGlow} />
          <div className={`${styles.ring} ${styles.r3}`} />
          <div className={`${styles.ring} ${styles.r2}`} />
          <div className={`${styles.ring} ${styles.r1}`} />
          <div className={styles.orb} />
          <div className={`${styles.particle} ${styles.p1}`} />
          <div className={`${styles.particle} ${styles.p2}`} />
          <div className={`${styles.particle} ${styles.p3}`} />
          <div className={`${styles.particle} ${styles.p4}`} />
        </div>

        <div className={styles.wordmark}>
          <h1>
            athena<span className={styles.dot}>.</span>
          </h1>
          <div className={styles.underline} />
          <div className={styles.tagline}>your personal math tutor</div>
        </div>

        <button
          className={styles.enter}
          type="button"
          aria-label="Click to enter"
          onClick={handleEnter}
        >
          <span className={styles.label}>
            <span>Click to enter</span>
            <span className={styles.arrow} />
          </span>
        </button>
      </main>
    </div>
  );
}
