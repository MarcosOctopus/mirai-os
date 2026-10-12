"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSend: (text: string) => void;
  isThinking: boolean;
}

export default function ChatInterface({
  messages,
  onSend,
  isThinking,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isThinking) return;
    onSend(text);
    setInput("");
  };

  // Group consecutive messages by role
  const groupedMessages = messages.reduce((acc, msg) => {
    const last = acc[acc.length - 1];
    if (last && last[0].role === msg.role) {
      last.push(msg);
    } else {
      acc.push([msg]);
    }
    return acc;
  }, [] as Message[][]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <div className="text-4xl mb-4 opacity-20">✨</div>
            <p className="text-sm">Toque no orb ou digite algo</p>
            <p className="text-xs mt-1">Estou aqui para ajudar</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {groupedMessages.map((group, gi) => {
            const isUser = group[0].role === "user";
            return (
              <motion.div
                key={group[0].id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    isUser
                      ? "bg-blue-600/80 text-white rounded-br-md"
                      : "bg-dash-hair/5 text-gray-200 rounded-bl-md"
                  }`}
                >
                  {!isUser && (
                    <div className="text-xs text-cyan-400 mb-1 font-medium">
                      Mirai
                    </div>
                  )}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {group.map((m) => m.content).join("\n")}
                  </div>
                  <div
                    className={`text-[10px] mt-1 ${
                      isUser ? "text-blue-200" : "text-gray-500"
                    }`}
                  >
                    {new Date(group[0].timestamp).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isThinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-dash-hair/5 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <motion.span
                  className="w-2 h-2 bg-cyan-400 rounded-full"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                />
                <motion.span
                  className="w-2 h-2 bg-cyan-400 rounded-full"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                />
                <motion.span
                  className="w-2 h-2 bg-cyan-400 rounded-full"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-4 py-3 border-t border-dash-hair/5"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua mensagem..."
          disabled={isThinking}
          className="flex-1 bg-dash-hair/5 border border-dash-hair/10 rounded-xl px-4 py-2.5 text-sm text-dash-fg 
                     placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:bg-dash-hair/[0.07]
                     transition-colors disabled:opacity-40"
        />
        <motion.button
          type="submit"
          disabled={!input.trim() || isThinking}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400
                     hover:bg-cyan-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-5 h-5"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </motion.button>
      </form>
    </div>
  );
}
