"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  opacitySpeed: number;
  glowPhase: number;
  glowSpeed: number;
}

export function ParticlesBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const animationRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const count = Math.floor((window.innerWidth * window.innerHeight) / 14000);
    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2.5 + 1,
        speedX: (Math.random() - 0.5) * 0.25,
        speedY: (Math.random() - 0.5) * 0.25,
        opacity: Math.random() * 0.5 + 0.1,
        opacitySpeed: (Math.random() - 0.5) * 0.004,
        glowPhase: Math.random() * Math.PI * 2,
        glowSpeed: 0.008 + Math.random() * 0.015,
      });
    }
    particlesRef.current = particles;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isDark = resolvedTheme === "dark";
      // Light: navy glow | Dark: warm amber glow
      const r = isDark ? 220 : 50;
      const g = isDark ? 180 : 50;
      const b = isDark ? 60 : 120;

      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        p.glowPhase += p.glowSpeed;

        // Smooth sine-based glow pulsing (like a firefly breathing)
        const glowIntensity = 0.3 + 0.7 * ((Math.sin(p.glowPhase) + 1) / 2);
        p.opacity += p.opacitySpeed;

        if (p.opacity <= 0.05 || p.opacity >= 0.6) {
          p.opacitySpeed *= -1;
        }

        // Wrap around edges
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;

        const finalOpacity = p.opacity * glowIntensity;
        const glowRadius = p.size * (3 + glowIntensity * 4);

        // Outer glow halo
        const gradient = ctx.createRadialGradient(
          p.x, p.y, 0,
          p.x, p.y, glowRadius
        );
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${finalOpacity * 0.9})`);
        gradient.addColorStop(0.15, `rgba(${r}, ${g}, ${b}, ${finalOpacity * 0.5})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${finalOpacity * 0.15})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Bright core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.min(r + 50, 255)}, ${Math.min(g + 50, 255)}, ${Math.min(b + 40, 255)}, ${finalOpacity})`;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [resolvedTheme]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}
