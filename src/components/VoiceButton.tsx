"use client";

import { motion } from "framer-motion";

interface VoiceButtonProps {
  isListening: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export default function VoiceButton({
  isListening,
  onClick,
  disabled,
}: VoiceButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-colors
        ${
          isListening
            ? "bg-red-500/20 text-red-400"
            : "bg-dash-hair/5 text-gray-400 hover:bg-dash-hair/10 hover:text-dash-fg"
        }
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
      whileHover={disabled ? {} : { scale: 1.1 }}
      whileTap={disabled ? {} : { scale: 0.9 }}
      animate={
        isListening
          ? {
              boxShadow: [
                "0 0 10px rgba(255,50,50,0.3)",
                "0 0 20px rgba(255,50,50,0.5)",
                "0 0 10px rgba(255,50,50,0.3)",
              ],
            }
          : {}
      }
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </motion.button>
  );
}
