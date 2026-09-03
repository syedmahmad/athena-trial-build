/**
 * Adapts whiteboard element colors for dark mode readability.
 * The AI tends to generate hex colors calibrated for light backgrounds
 * (e.g. #2563eb blue-600, #dc2626 red-600). These are too dark on the
 * dark canvas (oklch ~0.19). We brighten them to at least L=65 in HSL.
 */

import { useEffect, useState } from "react";

export function useIsDarkMode() {
  const [isDark, setIsDark] = useState(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

/** Returns a CSS color string that's readable on both light and dark canvases. */
export function adaptWbColor(color: string, isDark: boolean): string {
  if (!isDark || !color || color.startsWith("var(")) return color;

  const hsl = hexToHsl(color);
  if (!hsl) return color;

  const [h, s, l] = hsl;
  if (l < 55) {
    // Too dark for the dark canvas — boost lightness to at least 68%
    const newL = Math.max(68, l + 30);
    return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${newL.toFixed(0)}%)`;
  }
  return color;
}
