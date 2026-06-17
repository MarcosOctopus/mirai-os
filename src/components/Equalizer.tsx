"use client";

import { motion } from "framer-motion";

interface EqualizerProps {
  isActive: boolean;
  level: number;
}

export default function Equalizer({ isActive, level }: EqualizerProps) {
  const bars = 7;

  return (
    <div className="flex items-end gap-[3px] h-6">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full"
          style={{
            backgroundColor: isActive ? "rgb(0, 240, 255)" : "rgb(40, 40, 80)",
            height: isActive ? `${Math.max(15, level * 80 + Math.sin(Date.now() * 0.01 + i) * 20)}%` : "15%",
          }}
          animate={
            isActive
              ? {
                  height: [
                    `${15 + Math.sin(i * 1.5) * 10}%`,
                    `${60 + Math.sin(i * 2.0 + Date.now() * 0.005) * 25}%`,
                    `${15 + Math.sin(i * 1.5) * 10}%`,
                  ],
                  opacity: [0.6, 1, 0.6],
                }
              : {}
          }
          transition={{
            duration: 1.5 + i * 0.1,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
