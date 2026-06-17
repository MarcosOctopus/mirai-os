"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Picovoice Porcupine Wake Word Detection ────────────────────
//
// Detecta a frase de ativação "Mirai" e dispara onDetection().
// Usa PPN customizado gerado no Picovoice Console.
//
// Como funciona:
//   1. Cria um PorcupineWorker que carrega o modelo .ppn de "Mirai"
//   2. WebVoiceProcessor captura o microfone continuamente
//   3. Quando a wake word é detectada → chama onDetection()

export const PICOVOICE_ACCESS_KEY =
  process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY ||
  "4MdPjySri4BjeyolHA5zPGv8DaEBVzq4s05Cgt0Knwheyq3PZmgXUg==";

// Caminho do modelo de parâmetros do Porcupine (relativo a /public).
// IMPORTANTE: o idioma do modelo de parâmetros DEVE bater com o idioma da
// wake word. "Hey Mirai" é um PPN em português (pt), então usamos o modelo
// de parâmetros português. Usar o modelo inglês (porcupine_params.pv) faz o
// engine carregar sem erro mas NUNCA detectar a wake word.
const PORCUPINE_MODEL_PATH = "models/porcupine_params_pt.pv";

export type WakeWordState = "idle" | "loading" | "listening" | "error";

type UseWakeWordOptions = {
  onDetection: () => void;
  enabled?: boolean;
};

export function useWakeWord({ onDetection, enabled = true }: UseWakeWordOptions) {
  const [state, setState] = useState<WakeWordState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Refs para evitar recriação da engine quando o callback muda.
  const onDetectionRef = useRef(onDetection);
  const workerRef = useRef<any>(null);
  const wvpRef = useRef<any>(null);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    onDetectionRef.current = onDetection;
  }, [onDetection]);

  const teardown = useCallback(async () => {
    const worker = workerRef.current;
    const wvp = wvpRef.current;
    workerRef.current = null;
    wvpRef.current = null;

    try {
      if (wvp && worker) await wvp.unsubscribe(worker);
    } catch (_) {}
    try {
      await worker?.release?.();
    } catch (_) {}
    try {
      worker?.terminate?.();
    } catch (_) {}
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (workerRef.current || startingRef.current) return;
    startingRef.current = true;
    setState("loading");
    setError(null);

    // Timeout: se não inicializar em 20s, força erro
    const timeout = setTimeout(() => {
      if (workerRef.current) return; // já inicializou
      startingRef.current = false;
      setState("error");
      const msg = "PorcupineWorker.create() timed out after 20s";
      setError(msg);
      console.error("[wake-word]", msg);
    }, 20000);

    try {
      const { PorcupineWorker } = await import("@picovoice/porcupine-web");
      const { WebVoiceProcessor } = await import("@picovoice/web-voice-processor");

      // Wake word customizada "Hey Mirai" — PPN em base64 (evita bug do publicPath no bundle ESM)
      const WAKE_KEYWORD = {
        base64: "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",
        label: "Mirai",
        sensitivity: 0.8,
      };

      const worker = await PorcupineWorker.create(
        PICOVOICE_ACCESS_KEY,
        WAKE_KEYWORD as any,
        () => {
          // Detecção: dispara o callback mais recente.
          onDetectionRef.current?.();
        },
        {
          publicPath: PORCUPINE_MODEL_PATH,
          customWritePath: "porcupine_params_pt_v1",
          forceWrite: true,
        },
        {
          processErrorCallback: (e: any) => {
            console.warn("[wake-word] process error:", e);
          },
        }
      );

      // Se desmontou enquanto carregava, limpa imediatamente.
      if (!mountedRef.current) {
        try {
          await worker.release();
          worker.terminate();
        } catch (_) {}
        startingRef.current = false;
        return;
      }

      workerRef.current = worker;
      wvpRef.current = WebVoiceProcessor;
      clearTimeout(timeout);

      await WebVoiceProcessor.subscribe(worker);
      setState("listening");
    } catch (err: any) {
      clearTimeout(timeout);
      console.warn("[wake-word] init failed:", err);
      setError(err?.message || "Falha ao iniciar wake word");
      setState("error");
      await teardown();
    } finally {
      startingRef.current = false;
    }
  }, [teardown]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setState("idle");
      teardown();
      return;
    }

    start();

    return () => {
      mountedRef.current = false;
      teardown();
    };
  }, [enabled, start, teardown]);

  return { state, error };
}
