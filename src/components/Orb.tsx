"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface OrbProps {
  level: number;
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  frequencies: Uint8Array | null;
  onClick?: () => void;
}

export default function Orb({
  level,
  isListening,
  isSpeaking,
  isThinking,
  frequencies,
  onClick,
}: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      timeRef.current += 0.01;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.35;
      const dpr = devicePixelRatio;

      ctx.clearRect(0, 0, w, h);

      // Determine colors based on state
      let mainColor = "0, 180, 255"; // blue idle
      let glowColor = "0, 150, 255";
      let pulse = 0;

      if (isThinking) {
        mainColor = "0, 240, 255";
        glowColor = "0, 200, 255";
        pulse = Math.sin(timeRef.current * 3) * 0.2 + 0.5;
      }
      if (isListening) {
        mainColor = "0, 255, 180";
        glowColor = "0, 220, 150";
        pulse = level * 0.8 + 0.2;
      }
      if (isSpeaking) {
        mainColor = "255, 200, 100";
        glowColor = "255, 180, 50";
        pulse = level * 0.9 + 0.1;
      }

      // Outer glow
      const glowR = maxR * (1.2 + pulse * 0.3);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      gradient.addColorStop(0, `rgba(${mainColor}, ${0.15 + pulse * 0.2})`);
      gradient.addColorStop(0.5, `rgba(${mainColor}, ${0.05 + pulse * 0.1})`);
      gradient.addColorStop(1, `rgba(${mainColor}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Frequency rings
      if (frequencies && frequencies.length > 0) {
        for (let ring = 0; ring < 3; ring++) {
          const ringR = maxR * (0.8 + ring * 0.15);
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${mainColor}, ${0.1 + ring * 0.05})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Animate dots on rings
          const numDots = 8 + ring * 4;
          for (let i = 0; i < numDots; i++) {
            const angle =
              (i / numDots) * Math.PI * 2 +
              timeRef.current * (0.5 + ring * 0.3);
            const fi = frequencies[
              Math.floor((i / numDots) * frequencies.length)
            ] || 128;
            const rOffset = (fi / 255) * ringR * 0.15 * (1 - ring * 0.2);
            const x = cx + Math.cos(angle) * (ringR + rOffset);
            const y = cy + Math.sin(angle) * (ringR + rOffset);
            ctx.beginPath();
            ctx.arc(x, y, 2 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${mainColor}, ${0.2 + (fi / 255) * 0.5})`;
            ctx.fill();
          }
        }
      }

      // Main orb body
      const orbR = maxR * (0.5 + pulse * 0.15);
      const orbGrad = ctx.createRadialGradient(
        cx - orbR * 0.3,
        cy - orbR * 0.3,
        0,
        cx,
        cy,
        orbR
      );
      orbGrad.addColorStop(0, `rgba(255, 255, 255, ${0.6 + pulse * 0.2})`);
      orbGrad.addColorStop(0.3, `rgba(${mainColor}, 0.6)`);
      orbGrad.addColorStop(0.7, `rgba(${mainColor}, 0.3)`);
      orbGrad.addColorStop(1, `rgba(${mainColor}, 0.1)`);
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
      ctx.fill();

      // Inner glow
      const innerGrad = ctx.createRadialGradient(
        cx - orbR * 0.2,
        cy - orbR * 0.2,
        0,
        cx,
        cy,
        orbR * 0.5
      );
      innerGrad.addColorStop(
        0,
        `rgba(255, 255, 255, ${0.8 + pulse * 0.15})`
      );
      innerGrad.addColorStop(1, `rgba(${mainColor}, 0.2)`);
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, orbR * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Pulse ring
      if (isThinking || isSpeaking || isListening) {
        const pulseR = orbR * (1.3 + Math.sin(timeRef.current * 4) * 0.1);
        ctx.beginPath();
        ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${mainColor}, ${0.2 + Math.sin(timeRef.current * 4) * 0.15})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [level, isListening, isSpeaking, isThinking, frequencies]);

  return (
    <motion.button
      onClick={onClick}
      className="relative w-40 h-40 sm:w-48 sm:h-48 rounded-full cursor-pointer focus:outline-none"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={{
        boxShadow: isThinking
          ? [
              "0 0 20px rgba(0,240,255,0.3)",
              "0 0 40px rgba(0,240,255,0.5)",
              "0 0 20px rgba(0,240,255,0.3)",
            ]
          : isListening
          ? [
              "0 0 20px rgba(0,255,180,0.3)",
              "0 0 40px rgba(0,255,180,0.5)",
              "0 0 20px rgba(0,255,180,0.3)",
            ]
          : "0 0 20px rgba(0,180,255,0.2)",
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-full"
      />
    </motion.button>
  );
}
