"use client";

// Barra de baixo do Orb (digitar / microfone / anexar / enviar).
// Mesmas funções de antes; agora vestindo o padrão Dash: superfície do app,
// raio 12, ícones de um traço, acento da marca. E deixou de ser `fixed` — ela
// vive DENTRO do miolo do Orb, então não atravessa mais a sidebar.
import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent } from "react";
import { IconeChat, IconeSeta, IconeAgentes } from "@/components/dash/icons";

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
  const conversa = chatMode === "conversa";

  const botaoBase =
    "mb-1 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] transition disabled:opacity-40";

  return (
    <div className="w-full border-t border-white/[0.07] bg-dash-side/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-end gap-2">
        {/* Modo (conversa / arquiteto) */}
        <button
          onClick={onToggleMode}
          className={`mb-1 flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-3 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
            conversa
              ? "bg-dash-brand/15 text-dash-brand hover:bg-dash-brand/25"
              : "bg-dash-warn/15 text-dash-warn hover:bg-dash-warn/25"
          }`}
          aria-label={`Modo atual: ${conversa ? "Conversa" : "Arquiteto"}. Clique para alternar.`}
          title={`Modo: ${conversa ? "Conversa" : "Arquiteto"}`}
        >
          {conversa ? <IconeChat className="h-3.5 w-3.5" /> : <IconeAgentes className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{conversa ? "Conversa" : "Arquiteto"}</span>
        </button>

        {/* Parar */}
        <button
          onClick={onStopSpeaking}
          className={`${botaoBase} bg-dash-bad/10 text-dash-bad hover:bg-dash-bad/20`}
          aria-label="Parar Mirai"
          title="Parar Mirai"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>

        {/* Microfone */}
        <button
          onClick={onMicClick}
          disabled={disabled}
          className={`${botaoBase} ${
            isSpeaking ? "bg-dash-brand/20 text-dash-brand" : "bg-dash-raise text-dash-muted hover:text-white"
          }`}
          aria-label="Microfone"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-4 w-4">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </button>

        {/* Anexar */}
        <button
          onClick={onAttach}
          disabled={disabled}
          className={`${botaoBase} bg-dash-raise text-dash-muted hover:text-white`}
          aria-label="Anexar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-4 w-4">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* Campo */}
        <div
          className={`flex-1 overflow-hidden rounded-[12px] border bg-dash-bg transition ${
            hasText ? "border-dash-brand/50" : "border-white/10"
          }`}
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
            className="block w-full resize-none bg-transparent px-4 py-2.5 text-[13px] leading-6 text-white outline-none placeholder:text-dash-dim"
            style={{ maxHeight: `${24 * 4}px` }}
          />
        </div>

        {/* Enviar */}
        <button
          onClick={handleSend}
          disabled={!hasText || disabled}
          className={`${botaoBase} ${
            hasText && !disabled
              ? "bg-dash-brand text-white hover:bg-dash-brandHi"
              : "bg-dash-raise text-dash-dim"
          }`}
          aria-label="Enviar"
        >
          <IconeSeta className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
