// useAudioLevel hook - for orb visualization
import { useState, useRef, useCallback, useEffect } from "react";
import { startAudioCapture, getAudioLevel } from "@/lib/voice";

export function useAudioLevel() {
  const [level, setLevel] = useState(0);
  const [frequencies, setFrequencies] = useState<Uint8Array | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startCapture = useCallback(async () => {
    try {
      const cleanup = await startAudioCapture((data) => {
        setFrequencies(data);
        setLevel(getAudioLevel(data));
      });
      cleanupRef.current = cleanup;
      setIsCapturing(true);
    } catch (err) {
      console.warn("Audio capture not available:", err);
    }
  }, []);

  const stopCapture = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setIsCapturing(false);
    setLevel(0);
    setFrequencies(null);
  }, []);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return { level, frequencies, isCapturing, startCapture, stopCapture };
}
