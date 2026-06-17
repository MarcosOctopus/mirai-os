"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getAudioLevel, speak, startAudioCapture, stopSpeaking, startMediaRecording, stopMediaRecording } from "@/lib/voice";

export type VoiceStatus = "idle" | "listening" | "processing" | "speaking";

export function useVoice() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const isListeningRef = useRef(false);
  const pendingResultRef = useRef<((text: string) => void) | null>(null);
  const captureCleanupRef = useRef<(() => void) | null>(null);

  // ─── Silence Detection (VAD) ──────────────────────────────────
  const audioLevelRef = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef<((text: string) => void) | null>(null);
  const onErrorRef = useRef<(() => void) | null>(null);
  const heardSpeechRef = useRef(false);
  const continuousModeRef = useRef(false);

  const SILENCE_TIMEOUT_MS = 1000;   // 1.0s de silêncio = fim da fala (0.7s cortava)
  const SILENCE_THRESHOLD = 0.025;   // abaixo disso é silêncio
  const MAX_RECORDING_MS = 12000;    // segurança: no máximo 12s de gravação
  const POST_SPEECH_COOLDOWN_MS = 1500; // 1.5s depois de falar antes de re-ouvir (evita loop de eco)
  const CONTINUOUS_LISTENING_MS = 5000; // 5s de escuta contínua pós-resposta

  // ─── Barge-in (interrupção) ───────────────────────────────────
  const bargeInMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bargeInCallbackRef = useRef<(() => void) | null>(null);
  const stopRequestedByBargeInRef = useRef(false);
  const BARGE_IN_THRESHOLD = 0.04;   // nível de áudio que aciona interrupção
  const BARGE_IN_HOLD_MS = 300;      // quanto tempo de fala contínua pra interromper
  const isSpeakingRef = useRef(false);

  // ─── Escuta contínua (pós-resposta) ───────────────────────────
  const continuousTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continuousCallbackRef = useRef<((text: string) => void) | null>(null);
  const CONTINUOUS_TIMEOUT_MS = 30000;  // 30s de escuta após resposta

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearMaxTimer = useCallback(() => {
    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
  }, []);

  // Chamado quando o usuário termina de falar (silêncio detectado ou timeout)
  const finalizeRecording = useCallback(() => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    clearSilenceTimer();
    clearMaxTimer();
    stopMediaRecording(); // triggers onstop → transcription → chama pendingResultRef
  }, [clearSilenceTimer, clearMaxTimer]);

  // Monitor de silêncio — checa o audioLevel a cada 200ms
  const silenceMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSilenceMonitor = useCallback(() => {
    clearSilenceTimer();

    silenceMonitorRef.current = setInterval(() => {
      if (!isListeningRef.current) {
        if (silenceMonitorRef.current) {
          clearInterval(silenceMonitorRef.current);
          silenceMonitorRef.current = null;
        }
        return;
      }

      const level = audioLevelRef.current;

      if (level < SILENCE_THRESHOLD) {
        if (heardSpeechRef.current && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            console.log("[vad] Silence detected, stopping recording");
            finalizeRecording();
          }, SILENCE_TIMEOUT_MS);
        }
      } else {
        heardSpeechRef.current = true;
        clearSilenceTimer();
      }
    }, 200);
  }, [clearSilenceTimer, finalizeRecording]);

  const stopCapture = useCallback(() => {
    captureCleanupRef.current?.();
    captureCleanupRef.current = null;
    setAudioLevel(0);
    audioLevelRef.current = 0;
    clearSilenceTimer();
    clearMaxTimer();
    if (silenceMonitorRef.current) {
      clearInterval(silenceMonitorRef.current);
      silenceMonitorRef.current = null;
    }
  }, [clearSilenceTimer, clearMaxTimer]);

  // ─── Iniciar escuta (usado pelo wake word, botão, barge-in e contínua) ──
  const startListening = useCallback((onResult?: (text: string) => void) => {
    // Se tá falando, interrompe primeiro
    if (isSpeakingRef.current) {
      stopSpeaking();
      isSpeakingRef.current = false;
    }

    if (isListeningRef.current) return;

    // Limpa timer de escuta contínua se tiver rodando
    if (continuousTimerRef.current) {
      clearTimeout(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }

    isListeningRef.current = true;
    heardSpeechRef.current = false;
    continuousModeRef.current = false;
    pendingResultRef.current = onResult || null;
    onResultRef.current = onResult || null;
    continuousCallbackRef.current = onResult || null;

    setTranscript("");
    setStatus("listening");

    // Start audio visualization + silence tracking via ref
    startAudioCapture((frequencies) => {
      const level = getAudioLevel(frequencies);
      setAudioLevel(level);
      audioLevelRef.current = level;
    })
      .then((cleanup) => { captureCleanupRef.current = cleanup; })
      .catch((err) => console.warn("Audio capture not available:", err));

    // Start media recording for Gemini STT
    startMediaRecording(
      // onResult - transcription succeeded
      (text) => {
        clearSilenceTimer();
        clearMaxTimer();
        if (silenceMonitorRef.current) {
          clearInterval(silenceMonitorRef.current);
          silenceMonitorRef.current = null;
        }
        isListeningRef.current = false;
        stopCapture();
        setStatus("processing");
        setTranscript(text);
        if (pendingResultRef.current) {
          pendingResultRef.current(text);
          pendingResultRef.current = null;
        }
      },
      // onError - transcription failed
      () => {
        clearSilenceTimer();
        clearMaxTimer();
        if (silenceMonitorRef.current) {
          clearInterval(silenceMonitorRef.current);
          silenceMonitorRef.current = null;
        }
        isListeningRef.current = false;
        stopCapture();
        setStatus("idle");
        pendingResultRef.current = null;
      }
    );

    // Start silence monitor
    startSilenceMonitor();

    // Safety max recording timeout
    maxRecordingTimerRef.current = setTimeout(() => {
      if (isListeningRef.current) {
        console.log("[vad] Max recording time reached, stopping");
        finalizeRecording();
      }
    }, MAX_RECORDING_MS);
  }, [stopCapture, startSilenceMonitor, finalizeRecording, clearSilenceTimer, clearMaxTimer]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    clearSilenceTimer();
    clearMaxTimer();
    if (silenceMonitorRef.current) {
      clearInterval(silenceMonitorRef.current);
      silenceMonitorRef.current = null;
    }
    if (continuousTimerRef.current) {
      clearTimeout(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }
    stopMediaRecording();
    stopCapture();
    setStatus("idle");
    pendingResultRef.current = null;
    heardSpeechRef.current = false;
    continuousModeRef.current = false;
  }, [stopCapture, clearSilenceTimer, clearMaxTimer]);

  // ─── Iniciar Barge-in Monitor ────────────────────────────────
  // Durante a fala da Mirai, monitora áudio. Se usuário falar por cima → para + ouve.
  const startBargeInMonitor = useCallback((onBargeIn: () => void) => {
    bargeInCallbackRef.current = onBargeIn;
    let speakingStart: number | null = null;

    if (bargeInMonitorRef.current) {
      clearInterval(bargeInMonitorRef.current);
    }

    bargeInMonitorRef.current = setInterval(() => {
      if (!isSpeakingRef.current) {
        if (bargeInMonitorRef.current) {
          clearInterval(bargeInMonitorRef.current);
          bargeInMonitorRef.current = null;
        }
        return;
      }

      const level = audioLevelRef.current;

      if (level > BARGE_IN_THRESHOLD) {
        // Usuário começou a falar. Marca intenção de barge-in, mas não corta a palavra/frase atual.
        if (!speakingStart) {
          speakingStart = Date.now();
        } else if (Date.now() - speakingStart > BARGE_IN_HOLD_MS) {
          console.log("[barge-in] User interrupted; finishing current TTS segment before listening");
          speakingStart = null;
          stopRequestedByBargeInRef.current = true;
          stopSpeaking();
        }
      } else {
        speakingStart = null;
      }
    }, 150);
  }, []);

  // ─── Falar + Barge-in + Escuta Contínua ───────────────────────
  const speakText = useCallback(async (text: string, onEnd?: () => void, onBargeIn?: () => void) => {
    setStatus("speaking");
    isSpeakingRef.current = true;

    // Inicia monitor de interrupção
    if (onBargeIn) {
      startBargeInMonitor(onBargeIn);
    }

    await speak(text, () => {
      isSpeakingRef.current = false;
      if (bargeInMonitorRef.current) {
        clearInterval(bargeInMonitorRef.current);
        bargeInMonitorRef.current = null;
      }
      setStatus("idle");
      if (stopRequestedByBargeInRef.current) {
        stopRequestedByBargeInRef.current = false;
        onBargeIn?.();
        return;
      }
      onEnd?.();
    });
  }, [startBargeInMonitor]);

  const cancelSpeech = useCallback(() => {
    isSpeakingRef.current = false;
    if (bargeInMonitorRef.current) {
      clearInterval(bargeInMonitorRef.current);
      bargeInMonitorRef.current = null;
    }
    if (continuousTimerRef.current) {
      clearTimeout(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }
    stopSpeaking();
    setStatus("idle");
  }, []);

  // ─── Iniciar escuta contínua (após resposta) ─────────────────
  // Mirai termina de falar → fica ouvindo por 30s pra ver se você fala mais
  const startContinuousListening = useCallback((onResult?: (text: string) => void) => {
    if (continuousTimerRef.current) {
      clearTimeout(continuousTimerRef.current);
    }

    // Se já tá ouvindo, não faz nada
    if (isListeningRef.current) return;

    // Inicia escuta
    startListening(onResult);
    continuousModeRef.current = true;

    // Se não falar nada em 5s, volta ao idle
    continuousTimerRef.current = setTimeout(() => {
      if (isListeningRef.current) {
        console.log("[continuous] Timeout 5s, stopping listening");
        isListeningRef.current = false;
        clearSilenceTimer();
        clearMaxTimer();
        if (silenceMonitorRef.current) {
          clearInterval(silenceMonitorRef.current);
          silenceMonitorRef.current = null;
        }
        stopMediaRecording();
        stopCapture();
        setStatus("idle");
        pendingResultRef.current = null;
        continuousCallbackRef.current?.("");
      }
      continuousTimerRef.current = null;
    }, CONTINUOUS_TIMEOUT_MS);
  }, [startListening, stopCapture, clearSilenceTimer, clearMaxTimer]);

  useEffect(() => () => {
    isListeningRef.current = false;
    isSpeakingRef.current = false;
    if (bargeInMonitorRef.current) {
      clearInterval(bargeInMonitorRef.current);
      bargeInMonitorRef.current = null;
    }
    if (continuousTimerRef.current) {
      clearTimeout(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }
    stopMediaRecording();
    stopCapture();
    stopSpeaking();
  }, [stopCapture]);

  return {
    status, transcript, audioLevel,
    startListening, stopListening,
    speakText, cancelSpeech,
    startContinuousListening, isSpeakingRef,
    startListeningBargeIn: startListening, // usado pelo barge-in
  };
}
