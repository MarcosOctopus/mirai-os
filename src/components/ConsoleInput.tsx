"use client";

import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent } from "react";

interface ConsoleInputProps {
  onSend: (text: string) => void;
  onMicClick: () => void;
  onAttach: () => void;
  onStopSpeaking: () => void;
  onToggleMode: () => void;
  chatMode: "conversa" | "arquiteto";
  isSpeaking: boolean;
  disabled: boolean;
  placeholder?: string;
}

export default function ConsoleInput({
  onSend,
  onMicClick,
  onAttach,
  onStopSpeaking,
  onToggleMode,
  chatMode,
  isSpeaking,
  disabled,
  placeholder = "Digite sua mensagem...",
}: ConsoleInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 24 * 4)}px`;
  };

  const hasText = text.trim().length > 0;
  const showStop = true;

  const modeColor = chatMode === "conversa" ? "#0aefff" : "#ffb347";
  const modeLabel = chatMode === "conversa" ? "Conversa" : "Arquiteto";
  const modeIcon = chatMode === "conversa"
    ? "💬"
    : "🏗️";

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 input-glow"
      style={{
        borderTop: "1px solid rgba(10,239,255,0.08)",
        background: "rgba(4,5,16,0.92)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="mx-auto flex max-w-4xl items-end gap-2 px-4 py-3">
        {/* Mode Toggle */}
        <button
          onClick={onToggleMode}
          className="mb-1 flex h-9 shrink-0 items-center gap-1 rounded-full px-3 transition-all duration-200"
          style={{
            background: `${modeColor}10`,
            color: modeColor,
            border: `1px solid ${modeColor}30`,
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}
          aria-label={`Modo atual: ${modeLabel}. Clique para alternar.`}
          title={`Modo: ${modeLabel}`}
        >
          <span style={{ fontSize: "14px" }}>{modeIcon}</span>
          <span>{modeLabel}</span>
        </button>

        {/* Stop button */}
        {showStop && (
          <button
            onClick={onStopSpeaking}
            className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
            style={{
              background: "rgba(255,50,50,0.15)",
              color: "#ff3232",
              border: "1px solid rgba(255,50,50,0.3)",
              boxShadow: "0 0 12px rgba(255,50,50,0.15)",
            }}
            aria-label="Parar Mirai"
            title="Parar Mirai"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        )}

        {/* Mic */}
        <button
          onClick={onMicClick}
          disabled={disabled}
          className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
          style={{
            background: disabled ? "rgba(255,255,255,0.03)" : "rgba(10,239,255,0.06)",
            color: disabled ? "rgba(255,255,255,0.15)" : "rgba(10,239,255,0.5)",
            border: disabled ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(10,239,255,0.1)",
          }}
          aria-label="Microfone"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </button>

        {/* Attach */}
        <button
          onClick={onAttach}
          disabled={disabled}
          className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
          style={{
            background: disabled ? "rgba(255,255,255,0.03)" : "rgba(176,38,255,0.06)",
            color: disabled ? "rgba(255,255,255,0.15)" : "rgba(176,38,255,0.5)",
            border: disabled ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(176,38,255,0.1)",
          }}
          aria-label="Anexar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* Input */}
        <div
          className="flex-1 overflow-hidden rounded-xl transition-all duration-200"
          style={{
            border: hasText ? "1px solid rgba(10,239,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
            background: "rgba(10,239,255,0.03)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="block w-full resize-none bg-transparent px-4 py-2.5 text-sm leading-6 outline-none"
            style={{
              color: "#c8d6e5",
              fontFamily: "'Courier New', ui-monospace, monospace",
              maxHeight: `${24 * 4}px`,
            }}
          />
        </div>

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={!hasText || disabled}
          className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200"
          style={{
            background: hasText && !disabled
              ? "rgba(10,239,255,0.12)"
              : "rgba(255,255,255,0.03)",
            color: hasText && !disabled ? "#0aefff" : "rgba(255,255,255,0.15)",
            border: hasText && !disabled
              ? "1px solid rgba(10,239,255,0.25)"
              : "1px solid rgba(255,255,255,0.05)",
            boxShadow: hasText && !disabled ? "0 0 15px rgba(10,239,255,0.1)" : "none",
          }}
          aria-label="Enviar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
