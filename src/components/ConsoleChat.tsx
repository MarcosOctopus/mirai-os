import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent } from 'react';

interface ConsoleChatProps {
  onSend: (text: string) => void;
  onMicClick: () => void;
  onAttach: () => void;
  disabled: boolean;
  placeholder?: string;
}

export default function ConsoleChat({
  onSend,
  onMicClick,
  onAttach,
  disabled,
  placeholder = 'Digite sua mensagem...',
}: ConsoleChatProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea up to 4 lines (~24px per line ≈ 96px)
  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 24 * 4; // ~4 lines
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  const hasText = text.trim().length > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-700/60 bg-[#1a1a2e]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl items-end gap-2 px-4 py-3">
        {/* Microphone button */}
        <button
          type="button"
          onClick={onMicClick}
          disabled={disabled}
          aria-label="Microfone"
          className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-700/50 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </button>

        {/* Attach button */}
        <button
          type="button"
          onClick={onAttach}
          disabled={disabled}
          aria-label="Anexar"
          className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-700/50 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* Text input area */}
        <div className="flex-1 overflow-hidden rounded-2xl border border-gray-600/50 bg-[#0f0f1e] transition-colors focus-within:border-gray-500/80">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="block w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 text-white placeholder-gray-500 outline-none scrollbar-thin scrollbar-thumb-gray-700"
            style={{ maxHeight: `${24 * 4}px` }}
          />
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!hasText || disabled}
          aria-label="Enviar"
          className={`mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all ${
            hasText && !disabled
              ? 'bg-[#2b6ef0] text-white hover:bg-[#1e5cd6] shadow-lg shadow-blue-500/20'
              : 'bg-gray-700/50 text-gray-500'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
