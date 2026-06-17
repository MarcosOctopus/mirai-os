"use client";

function safeTimeout(ms: number): { signal?: AbortSignal } {
  if (typeof AbortController === "undefined") return {};

  if (typeof AbortSignal !== "undefined" && typeof (AbortSignal as any).timeout === "function") {
    try {
      return { signal: AbortSignal.timeout(ms) };
    } catch (_) {
      // Alguns WebViews expõem AbortSignal.timeout mas quebram em runtime.
    }
  }

  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal };
}

// ─── Safe getUserMedia (guarda iOS) ─────────────────────────────
function safeGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      reject(new Error("Microfone não disponível neste dispositivo. Toque no orb para ativar."));
      return;
    }
    navigator.mediaDevices.getUserMedia(constraints).then(resolve).catch(reject);
  });
}

// ─── Audio Context (unlocked once on user gesture) ──────────────

let audioCtx: AudioContext | null = null;
let currentSourceNode: MediaElementAudioSourceNode | null = null;
let currentAudioEl: HTMLAudioElement | null = null;
let audioUnlocked = false;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function ensureAudioContext() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();
    // Play a silent buffer to unlock
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (_) {}
}

export function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  ensureAudioContext();
}

// ─── Speech Recognition (Whisper API via backend) ───────────────

let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let recordingChunks: Blob[] = [];

export function getSpeechRecognition(): any {
  return null; // Uses MediaRecorder + Whisper API instead
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  try {
    const resp = await fetch("/api/stt", {
      method: "POST",
      headers: { "Content-Type": audioBlob.type || "audio/webm" },
      body: audioBlob,
      ...safeTimeout(25000),
    });
    if (!resp.ok) {
      console.warn("STT API failed:", resp.status);
      return "";
    }
    const result = await resp.json();
    return result.text || "";
  } catch (err) {
    console.warn("STT API error:", err);
    return "";
  }
}

export function startMediaRecording(
  onResult: (text: string) => void,
  onError?: () => void
): MediaRecorder | null {
  if (typeof window === "undefined") return null;
  
  safeGetUserMedia({ audio: true })
    .then((stream) => {
      mediaStream = stream;
      recordingChunks = [];
      
      const mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/wav")
        ? "audio/wav"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/mp4";
      
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder = recorder;
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunks.push(e.data);
      };
      
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
        
        const blob = new Blob(recordingChunks, { type: mimeType });
        recordingChunks = [];
        
        if (blob.size < 200) {
          onError?.();
          return;
        }
        
        const text = await transcribeAudio(blob);
        if (text.trim()) {
          onResult(text.trim());
        } else {
          onError?.();
        }
      };
      
      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
        onError?.();
      };
      
      recorder.start();
    })
    .catch(() => onError?.());
  
  return mediaRecorder;
}

export function stopMediaRecording(): void {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

// ─── TTS Playback (MediaElementSource + AudioContext) ───────────
// Max chars per TTS request (client-side chunking as safety net)
const TTS_CHUNK_LIMIT = 450;

// Split text into speakable chunks at sentence boundaries
function splitSpeechChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  const splitRx = /(?<=[.!?])\s+/g;
  const sentences = text.split(splitRx).filter(Boolean);

  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).trim().length <= maxLen) {
      current = (current + " " + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length > maxLen) {
        for (let i = 0; i < s.length; i += maxLen) {
          chunks.push(s.slice(i, i + maxLen));
        }
      } else {
        current = s;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

let stopRequested = false;
let activePlaybackAbort: (() => void) | null = null;

export async function speak(text: string, onEnd?: () => void): Promise<void> {
  if (typeof window === "undefined") return;
  forceStopSpeaking();
  stopRequested = false;

  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();

  if (!cleanText) { onEnd?.(); return; }

  const segments = splitSpeechChunks(cleanText, TTS_CHUNK_LIMIT);
  const audioQueue = segments.map((segment) => fetchTtsSegment(segment));

  for (let i = 0; i < segments.length; i++) {
    if (stopRequested) break;

    const url = await audioQueue[i];
    if (stopRequested) {
      if (url) URL.revokeObjectURL(url);
      break;
    }

    if (!url) {
      const remaining = segments.slice(i).join(". ");
      fallbackSpeak(remaining, onEnd);
      return;
    }

    const played = await playSpeechUrl(url);
    if (!played && !stopRequested) {
      const remaining = segments.slice(i).join(". ");
      fallbackSpeak(remaining, onEnd);
      return;
    }
  }

  if (!stopRequested) onEnd?.();
}

async function fetchTtsSegment(text: string): Promise<string | null> {
  try {
    const resp = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      ...safeTimeout(45000),
    });
    if (!resp.ok) {
      console.warn("TTS API failed for segment, falling back to browser speech");
      return null;
    }
    const arrayBuffer = await resp.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn("TTS segment error:", err);
    return null;
  }
}

async function playSpeechUrl(url: string, onEnd?: () => void): Promise<boolean> {
  const played = await playViaMediaElementSource(url, onEnd);
  if (played || stopRequested) return played;
  return playViaAudioElement(url, onEnd);
}

// ─── Strategy 1: MediaElementSource + AudioContext ──────────────
// Audio element decodes MP3, AudioContext bypasses autoplay restrictions

async function playViaMediaElementSource(url: string, onEnd?: () => void): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    if (ctx.state !== "running") {
      audioCtx = null; // force recreate
      const fresh = getAudioContext();
      if (fresh.state === "suspended") await fresh.resume();
    }

    const audio = new Audio();
    currentAudioEl = audio;
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.src = url;

    await audio.load(); // Ensure loaded before connecting

    const source = ctx.createMediaElementSource(audio);
    source.connect(ctx.destination);
    currentSourceNode = source;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        activePlaybackAbort = null;
        cleanupCurrentAudio(url);
        resolve(ok);
      };
      activePlaybackAbort = () => {
        if (audio.ended || audio.currentTime >= Math.max(0, audio.duration - 0.08)) finish(true);
      };
      audio.onended = () => {
        finish(true);
        onEnd?.();
      };
      audio.onerror = () => finish(false);
      audio.play().catch(() => finish(false));
    });
  } catch (err) {
    console.warn("MediaElementSource failed:", err);
    return false;
  }
}

// ─── Strategy 2: Persistent Audio element (mobile-safe) ─────────
// Single reusable element avoids iOS autoplay restrictions on new <audio>.

let persistentAudio: HTMLAudioElement | null = null;

function getPersistentAudio(): HTMLAudioElement {
  if (!persistentAudio) {
    persistentAudio = new Audio();
    persistentAudio.volume = 1;
    persistentAudio.preload = "auto";
  }
  return persistentAudio;
}

function playViaAudioElement(url: string, onEnd?: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = getPersistentAudio();
    audio.pause();
    // Revoke previous URL
    if ((audio as any)._miraiUrl) {
      URL.revokeObjectURL((audio as any)._miraiUrl);
    }
    audio.src = url;
    (audio as any)._miraiUrl = url;
    audio.load();
    currentAudioEl = audio;

    let settled = false;
    const timeout = setTimeout(() => finish(false), 3000);
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activePlaybackAbort = null;
      currentAudioEl = persistentAudio;
      resolve(ok);
    };
    activePlaybackAbort = () => {
      if (audio.ended || audio.currentTime >= Math.max(0, audio.duration - 0.08)) finish(true);
    };

    audio.onended = () => {
      finish(true);
      onEnd?.();
    };
    audio.onerror = () => finish(false);
    audio.play().catch(() => finish(false));
  });
}

// ─── Fallback: Browser Speech Synthesis ─────────────────────────

function fallbackSpeak(text: string, onEnd?: () => void): void {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  utterance.rate = 1.1;
  utterance.pitch = 1.0;
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.getVoices();
  }
  if (onEnd) utterance.onend = onEnd;
  utterance.onerror = () => { onEnd?.(); };
  window.speechSynthesis.speak(utterance);
}

// ─── Cleanup ────────────────────────────────────────────────────

function cleanupCurrentAudio(url?: string) {
  try { if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl.src = ""; } } catch (_) {}
  try { if (currentSourceNode) { currentSourceNode.disconnect(); } } catch (_) {}
  currentAudioEl = null;
  currentSourceNode = null;
  if (url) URL.revokeObjectURL(url);
}

export function stopSpeaking(): void {
  stopRequested = true;
  activePlaybackAbort?.();
  try { if (typeof window !== "undefined") window.speechSynthesis.cancel(); } catch (_) {}
}

function forceStopSpeaking(): void {
  stopRequested = true;
  activePlaybackAbort = null;
  cleanupCurrentAudio();
  try { if (typeof window !== "undefined") window.speechSynthesis.cancel(); } catch (_) {}
}

// ─── Audio Capture (for orb visualization) ──────────────────────

let vizAudioContext: AudioContext | null = null;
let vizAnalyser: AnalyserNode | null = null;
let vizSource: MediaStreamAudioSourceNode | null = null;
let vizStream: MediaStream | null = null;

export async function startAudioCapture(
  onData: (frequencies: Uint8Array) => void
): Promise<() => void> {
  if (!vizAudioContext) vizAudioContext = new AudioContext();

  vizStream = await safeGetUserMedia({ audio: true });
  vizSource = vizAudioContext.createMediaStreamSource(vizStream);
  vizAnalyser = vizAudioContext.createAnalyser();
  vizAnalyser.fftSize = 64;
  vizSource.connect(vizAnalyser);

  const bufferLength = vizAnalyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let running = true;

  function tick() {
    if (!running || !vizAnalyser) return;
    vizAnalyser.getByteFrequencyData(dataArray);
    onData(new Uint8Array(dataArray));
    requestAnimationFrame(tick);
  }
  tick();

  return () => {
    running = false;
    vizStream?.getTracks().forEach((t) => t.stop());
    vizSource?.disconnect();
    vizSource = null;
    vizAnalyser = null;
    vizStream = null;
  };
}

export function getAudioLevel(frequencies: Uint8Array): number {
  if (!frequencies || frequencies.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frequencies.length; i++) sum += frequencies[i];
  return sum / frequencies.length / 256;
}
