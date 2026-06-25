"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Voice support is built entirely on the browser's free, built-in Web Speech
// APIs — SpeechRecognition (speech-to-text) and speechSynthesis (text-to-speech).
// No external service, no API key, no cost. Works in Chrome (desktop/Android)
// and iOS Safari 14.5+. We feature-detect and hide the UI where unsupported.

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Make replies sound natural when spoken: drop markdown markers, emoji and
// other glyphs the synthesizer would otherwise read out awkwardly.
function stripForSpeech(text: string): string {
  return text
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    // Astral-plane glyphs (most emoji) arrive as surrogate pairs.
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
    // Common BMP symbol/arrow/dingbat ranges + the variation selector.
    .replace(/[←-⇿☀-➿⬀-⯿️]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function useVoice() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const handlerRef = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    const hasSTT = Boolean(getRecognitionCtor());
    const hasTTS = typeof window !== "undefined" && "speechSynthesis" in window;
    setSupported(hasSTT && hasTTS);
  }, []);

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    setSpeaking(false);
  }, []);

  const stopListening = useCallback(() => {
    try {
      recogRef.current?.stop();
    } catch {
      /* ignore */
    }
    recogRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(
    (onResult: (text: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) return;
      // Never listen and speak at once — that would feed our own voice back in.
      stopSpeaking();
      try {
        recogRef.current?.abort();
      } catch {
        /* ignore */
      }
      handlerRef.current = onResult;
      const r = new Ctor();
      r.lang = "en-US";
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e) => {
        let finalText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript;
        }
        finalText = finalText.trim();
        if (finalText) handlerRef.current?.(finalText);
      };
      r.onend = () => {
        setListening(false);
        recogRef.current = null;
      };
      r.onerror = () => {
        setListening(false);
        recogRef.current = null;
      };
      recogRef.current = r;
      try {
        r.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    },
    [stopSpeaking],
  );

  const speak = useCallback((text: string, onDone?: () => void) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onDone?.();
      return;
    }
    const clean = stripForSpeech(text);
    if (!clean) {
      onDone?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "en-US";
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onstart = () => setSpeaking(true);
    u.onend = () => {
      setSpeaking(false);
      onDone?.();
    };
    u.onerror = () => {
      setSpeaking(false);
      onDone?.();
    };
    window.speechSynthesis.speak(u);
  }, []);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      try {
        recogRef.current?.abort();
      } catch {
        /* ignore */
      }
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return { supported, listening, speaking, startListening, stopListening, speak, stopSpeaking };
}
