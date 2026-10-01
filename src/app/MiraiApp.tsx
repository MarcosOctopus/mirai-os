"use client";

import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Nav from "@/components/mirai/Nav";
import { useVoice } from "@/hooks/useVoice";
import { useWakeWord } from "@/hooks/useWakeWord";
import { unlockAudio } from "@/lib/voice";

const LoadingPresence = ({ label }: { label: string }) => (
  <div className="mirai-loading" role="status" aria-live="polite">
    {label}
  </div>
);

const BackgroundCanvas = dynamic(() => import("@/components/BackgroundCanvas"), {
  ssr: false,
  loading: () => <LoadingPresence label="Inicializando campo neural..." />,
});

const ConsoleInput = dynamic(() => import("@/components/ConsoleInput"), {
  ssr: false,
  loading: () => <LoadingPresence label="Carregando console..." />,
});

const MiraiOrb3D = dynamic(() => import("@/components/MiraiOrb3D"), {
  ssr: false,
  loading: () => <LoadingPresence label="Materializando núcleo..." />,
});

type OrbStatus = "idle" | "listening" | "thinking" | "speaking" | "executing" | "done";
type ChatMode = "conversa" | "arquiteto";

type VoiceApi = ReturnType<typeof useVoice>;

interface Msg {
  role: "user" | "assistant";
  content: string;
  plainText?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class MiraiErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || "Falha desconhecida no núcleo Mirai." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[mirai-app] render failure", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="mirai-os is-dormant" data-status="idle">
          <div className="mirai-mic-warning" role="alert">
            Núcleo visual reiniciado: {this.state.message}
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

function safeTimeout(callback: () => void, delay: number) {
  if (typeof window === "undefined") return undefined;

  let active = true;
  const id = window.setTimeout(() => {
    if (!active) return;
    callback();
  }, delay);

  return () => {
    active = false;
    window.clearTimeout(id);
  };
}

function detectModeSwitch(text: string): ChatMode | null {
  const normalized = text.toLowerCase().trim();
  if (/^iniciar modo arquiteto/.test(normalized)) return "arquiteto";
  if (/^iniciar modo conversa/.test(normalized)) return "conversa";
  return null;
}

function detectStop(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return ["obrigado", "para", "stop", "pode ser", "é só", "e só",
    "valeu", "tchau", "entendi", "stop mirai", "chega", "já deu",
    "pode parar", "encerrar"].some((term) => normalized.includes(term));
}

function MiraiAppCore() {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<OrbStatus>("idle");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("conversa");
  const [awake, setAwake] = useState(false);
  const [micWarning, setMicWarning] = useState("");

  const voice = useVoice();
  const voiceRef = useRef<VoiceApi>(voice);
  const messagesRef = useRef<Msg[]>([]);
  const chatModeRef = useRef<ChatMode>("conversa");
  const handleSendRef = useRef<(text: string) => Promise<void>>(async () => {});
  const autoListenRef = useRef(true);
  const timeoutsRef = useRef<Array<() => void>>([]);
  const msgEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    chatModeRef.current = chatMode;
  }, [chatMode]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((cancel) => cancel());
      timeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const cancel = safeTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((item) => item !== cancel);
      callback();
    }, delay);

    if (cancel) timeoutsRef.current.push(cancel);
    return cancel;
  }, []);

  const startPostResponseListening = useCallback(() => {
    try {
      voiceRef.current?.startContinuousListening((transcript) => {
        const clean = transcript.trim();

        if (clean && detectStop(clean)) {
          voiceRef.current.stopListening();
          setStatus("idle");
          setThinking(false);
          return;
        }

        if (clean) {
          void handleSendRef.current(clean);
          return;
        }

        startPostResponseListening();
      });
    } catch (e) {
      console.warn("[listen] error:", e);
    }
  }, []);

  const startConversationLoop = useCallback(() => {
    setStatus("listening");
    voiceRef.current.startListening((transcript: string) => {
      const clean = transcript.trim();
      if (clean) void handleSendRef.current(clean);
    });
  }, []);

  const awaken = useCallback(async () => {
    setAwake(true);
    setMicWarning("");
    unlockAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err: any) {
      const msg = err?.name === "NotAllowedError"
        ? "Microfone bloqueado. Permita nas configurações do navegador."
        : "Microfone não disponível.";
      setMicWarning(msg);
      return;
    }

    const v = voiceRef.current;
    v.cancelSpeech();
    setStatus("listening");
    v.startListening((transcript: string) => {
      const clean = transcript.trim();
      if (clean) void handleSend(clean);
    });
  }, []);

  const { state: wakeState } = useWakeWord({ onDetection: awaken, enabled: true });

  const handleSend = useCallback(async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    const v = voiceRef.current;

    if (detectStop(cleanText)) {
      v.cancelSpeech();
      v.stopListening();
      setStatus("idle");
      setThinking(false);
      return;
    }

    v.stopListening();

    const mode = detectModeSwitch(cleanText);
    if (mode) {
      setChatMode(mode);
      setAwake(true);
      const reply = mode === "arquiteto"
        ? "Modo Arquiteto ativado. Respostas técnicas em texto."
        : "Modo Conversa ativado. Vou falar em voz.";

      setMessages((prev) => [
        ...prev,
        { role: "user", content: cleanText },
        { role: "assistant", content: reply },
      ]);

      if (mode === "conversa") {
        setStatus("speaking");
        void v.speakText(reply).then(() => {
          setStatus("idle");
          setTimeout(startPostResponseListening, 500);
        }).catch(() => setStatus("idle"));
      } else {
        setStatus("idle");
      }
      return;
    }

    setAwake(true);
    // Usar refs pra evitar stale closures — messages e chatMode do state podem
    // estar desatualizados quando o callback roda (ex: após 2+ interações)
    const currentMessages = messagesRef.current;
    const currentMode = chatModeRef.current;
    const requestMessages = [...currentMessages, { role: "user" as const, content: cleanText }];
    setMessages(requestMessages);
    setThinking(true);
    setStatus("thinking");

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: requestMessages, mode: currentMode }),
      });

      if (!resp.ok) {
        let errorMessage = "Falha na API";
        try {
          const err = await resp.json();
          errorMessage = err?.error || errorMessage;
        } catch (_) {}
        throw new Error(errorMessage);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("Stream de resposta indisponível.");

      let fullText = "";
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || "";
            if (content) fullText += content;
          } catch (_) {}
        }
      }

      const reply = fullText.trim() || "Estou aqui.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setThinking(false);

      if (currentMode === "conversa") {
        setStatus("speaking");
        void voiceRef.current.speakText(reply).then(() => {
          setStatus("idle");
          setTimeout(() => {
            startPostResponseListening();
          }, 500);
        }).catch(() => setStatus("idle"));
      } else {
        setStatus("idle");
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Erro: ${err?.message || "Falha inesperada"}` }]);
      setThinking(false);
      setStatus("idle");
    }
  }, [startPostResponseListening]); // ← só startPostResponseListening, sem messages/chatMode!

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const handleMic = useCallback(async () => {
    const currentVoice = voiceRef.current;

    if (currentVoice.status === "listening") {
      currentVoice.stopListening();
      setStatus("idle");
      return;
    }

    setAwake(true);
    setMicWarning("");
    unlockAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err: any) {
      const msg = err?.name === "NotAllowedError" ? "Microfone bloqueado." : "Microfone não disponível.";
      setMicWarning(msg);
      return;
    }

    if (currentVoice.status === "speaking") currentVoice.cancelSpeech();
    setStatus("listening");
    currentVoice.startListening((transcript: string) => {
      const clean = transcript.trim();
      if (clean) void handleSend(clean);
    });
  }, [handleSend]);

  const handleStop = useCallback(() => {
    const v = voiceRef.current;
    v.cancelSpeech();
    v.stopListening();
    setStatus("idle");
    setThinking(false);
  }, []);

  const handleToggleMode = useCallback(() => {
    const newMode = chatMode === "conversa" ? "arquiteto" : "conversa";
    voiceRef.current.stopListening();
    setChatMode(newMode);
    setAwake(true);

    if (newMode === "conversa") {
      setStatus("speaking");
      void voiceRef.current.speakText("Modo Conversa ativado!").then(() => {
        setStatus("idle");
        setTimeout(startPostResponseListening, 500);
      }).catch(() => setStatus("idle"));
    } else {
      setStatus("idle");
    }
  }, [chatMode, startPostResponseListening]);

  if (!mounted) return null;

  return (
    <main className={`mirai-os ${awake ? "is-awake" : "is-dormant"}`} data-status={status}>
      <div style={{ pointerEvents: "none" }} aria-hidden="true">
        <BackgroundCanvas status={status} />
      </div>
      <div className="mirai-status-halo" />

      {/* Saída do modo conversa: sem isto, quem entra no orb fica sem menu. */}
      <Nav atual="/" flutuante />

      {(micWarning || wakeState === "error") && (
        <div className="mirai-mic-warning" role="status">
          {micWarning || "Wake word indisponível. Toque no orb para despertar Mirai."}
        </div>
      )}

      <div className="mirai-messages" aria-live="polite">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`msg msg-${message.role}`}>
            <span className="msg-label">{message.role === "user" ? "VOCÊ" : chatMode === "arquiteto" ? "MIRAI · ARQUITETO" : "MIRAI"}</span>
            <span className="msg-text">{message.content}</span>
          </div>
        ))}
        {thinking && (
          <div className="msg msg-assistant">
            <span className="msg-label">{chatMode === "arquiteto" ? "MIRAI · ARQUITETO" : "MIRAI"}</span>
            <span className="msg-text">...</span>
          </div>
        )}
        <div ref={msgEndRef} />
      </div>

      <section className="mirai-presence">
        <div
          className="mirai-orb-button"
          role="button"
          tabIndex={0}
          onClick={() => void awaken()}
          onPointerUp={() => void awaken()}
          onTouchEnd={(event) => {
            event.preventDefault();
            void awaken();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void awaken();
            }
          }}
          aria-label="Despertar Mirai"
        >
          <MiraiOrb3D status={status} audioLevel={voice.audioLevel} awake={awake} />
        </div>
      </section>

      <ConsoleInput
        onSend={(text) => void handleSend(text)}
        onMicClick={() => void handleMic()}
        onAttach={() => void awaken()}
        onToggleMode={handleToggleMode}
        onStopSpeaking={handleStop}
        chatMode={chatMode}
        disabled={thinking}
        isSpeaking={status === "speaking"}
        placeholder={awake ? "Converse com Mirai..." : "Toque no orb, diga Hey Mirai ou digite..."}
      />
    </main>
  );
}

export default function MiraiApp() {
  return (
    <MiraiErrorBoundary>
      <MiraiAppCore />
    </MiraiErrorBoundary>
  );
}
