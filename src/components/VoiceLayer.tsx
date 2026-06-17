"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// ─── VoiceLayer: carregado APÓS o primeiro toque do usuário ────
// Só importa módulos de áudio/microfone depois de um gesture.
// Isso evita crash no iOS Safari onde `getUserMedia` não existe
// até o usuário interagir com a página.

export type VoiceStatus = "idle" | "listening" | "processing" | "speaking";

type VoiceLayerProps = {
  onStatusChange: (status: VoiceStatus) => void;
  onTranscript: (text: string) => void;
  enabled: boolean;
  chatMode: "conversa" | "arquiteto";
};

export default function VoiceLayer({
  onStatusChange,
  onTranscript,
  enabled,
  chatMode,
}: VoiceLayerProps) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const speakingRef = useRef(false);
  const voiceRef = useRef<any>(null);

  useEffect(() => {
    onStatusChange(status);
  }, [status, onStatusChange]);

  // Inicializa o módulo de voz (só quando enabled=true e APÓS gesture)
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      try {
        const mod = await import("@/hooks/useVoice");
        const voice = mod.useVoice();
        voiceRef.current = voice;

        // Sincroniza status
        const unsub = setInterval(() => {
          if (cancelled) return;
          const s = voice.status || "idle";
          setStatus(s);
        }, 200);

        // Já expõe as funções no ref
        voiceRef.current = voice;

        return () => {
          cancelled = true;
          clearInterval(unsub);
        };
      } catch (err) {
        console.warn("[VoiceLayer] init failed:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled]);

  // Limpa no unmount
  useEffect(() => {
    return () => {
      try { voiceRef.current?.cancelSpeech?.(); } catch {}
    };
  }, []);

  // Funções expostas via ref (acessadas pelo MiraiApp via ref)
  const startListening = useCallback((onResult?: (text: string) => void) => {
    setStatus("listening");
    // TODO: integrar com voice.startListening
  }, []);

  const stopListening = useCallback(() => {
    setStatus("idle");
    // TODO: integrar com voice.stopListening
  }, []);

  const speakText = useCallback(async (text: string) => {
    if (chatMode === "arquiteto") return; // Modo arquiteto não fala
    // TODO: integrar com voice.speakText
  }, [chatMode]);

  const cancelSpeech = useCallback(() => {
    try { voiceRef.current?.cancelSpeech?.(); } catch {}
    setStatus("idle");
  }, []);

  return null; // Componente invisível, só carrega os módulos
}
