"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  radius: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
  driftX: number;
  driftY: number;
};

function createStars(width: number, height: number): Star[] {
  const isMobile = width < 768;
  const density = isMobile ? 0.00004 : 0.00006;
  const maxStars = isMobile ? 120 : 200;
  const count = Math.min(Math.floor(width * height * density), maxStars);

  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: Math.random() * 1.2 + 0.3,
    baseOpacity: Math.random() * 0.5 + 0.3,
    twinkleSpeed: Math.random() * 0.002 + 0.001,
    twinklePhase: Math.random() * Math.PI * 2,
    driftX: (Math.random() - 0.5) * 2,
    driftY: (Math.random() - 0.5) * 2,
  }));
}

function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId = 0;
    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    let reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = createStars(width, height);
    };

    const drawStatic = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      for (const star of stars) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.baseOpacity})`;
        ctx.fill();
      }
    };

    const drawAnimated = (time: number) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      for (const star of stars) {
        const opacity =
          star.baseOpacity *
          (0.65 + 0.35 * Math.sin(time * star.twinkleSpeed + star.twinklePhase));
        const x = wrap(star.x + star.driftX * time * 0.01, width);
        const y = wrap(star.y + star.driftY * time * 0.01, height);

        ctx.beginPath();
        ctx.arc(x, y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fill();
      }

      animationId = requestAnimationFrame(drawAnimated);
    };

    const start = () => {
      cancelAnimationFrame(animationId);
      if (reducedMotion) {
        drawStatic();
        return;
      }
      animationId = requestAnimationFrame(drawAnimated);
    };

    const onMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      start();
    };

    resize();
    start();

    window.addEventListener("resize", resize);
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="starfield" />;
}
