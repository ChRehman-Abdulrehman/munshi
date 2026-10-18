"use client";

import type { Lang } from "./types";

type SpeechCallbacks = {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
};

export type ListenSession = {
  active: boolean;
  start: (lang: Lang, cb: SpeechCallbacks) => void;
  stop: () => void;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return recognitionCtor() !== null;
}

export function recorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof FormData !== "undefined"
  );
}

export function canListen(): boolean {
  return whisperIsBroken() ? speechSupported() : recorderSupported() || speechSupported();
}

let whisperBroken = false;
export function whisperIsBroken(): boolean {
  return whisperBroken;
}
export function markWhisperBroken(): void {
  whisperBroken = true;
}

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Mic ki ijazat nahi mili. Settings se microphone on karein, ya neeche likh kar bhejein.",
  "service-not-allowed": "Mic ki ijazat nahi mili. Neeche likh kar bhejein.",
  "no-speech": "Awaz nahi aayi. Dobara bolein ya likhein.",
  "audio-capture": "Microphone nahi mila. Check karein ke mic juda hua hai.",
  network: "Internet ki wajah se awaz nahi samajh aayi. Likhein ya dobara koshish karein.",
  aborted: "Sunna band ho gaya.",
};

export class MicSession {
  private rec: SpeechRecognitionLike | null = null;
  active = false;

  start(lang: Lang, cb: SpeechCallbacks): void {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      cb.onError("Is browser mein awaz support nahi hai. Neeche likh kar bhejein.");
      return;
    }
    this.stop();
    const rec = new Ctor();
    rec.lang = lang === "en" ? "en-US" : "ur-PK";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      this.active = true;
      cb.onStart?.();
    };
    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i] as unknown as { isFinal: boolean; 0: { transcript: string } };
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (interim) cb.onInterim?.(interim);
      if (final) cb.onFinal(final.trim());
    };
    rec.onerror = (e) => {
      this.active = false;
      cb.onError(ERROR_TEXT[e.error] ?? "Awaz mein masla aaya. Dobara koshish karein ya likhein.");
    };
    rec.onend = () => {
      this.active = false;
      cb.onEnd?.();
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      cb.onError("Mic abhi masroof hai. Thori der baad koshish karein.");
    }
  }

  stop(): void {
    if (this.rec) {
      try {
        this.rec.abort();
      } catch {
        void 0;
      }
      this.rec = null;
    }
    this.active = false;
  }
}

export class WhisperSession {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private cb: SpeechCallbacks | null = null;
  private lang: Lang = "roman";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;
  active = false;

  start(lang: Lang, cb: SpeechCallbacks): void {
    this.cb = cb;
    this.lang = lang;
    this.cancelled = false;
    if (!recorderSupported()) {
      cb.onError("Is browser mein recording support nahi hai. Neeche likh kar bhejein.");
      return;
    }
    this.stop();
    this.cancelled = false;
    void this.begin();
  }

  private async begin(): Promise<void> {
    const cb = this.cb;
    if (!cb) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      cb.onError("Mic ki ijazat nahi mili. Settings se microphone on karein, ya neeche likh kar bhejein.");
      return;
    }
    if (this.cancelled) {
      this.releaseTracks();
      return;
    }
    try {
      const mime = typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
      this.chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      rec.onstop = () => void this.finish();
      this.rec = rec;
      rec.start();
      this.active = true;
      this.timer = setTimeout(() => this.stop(), 30000);
      cb.onStart?.();
    } catch {
      this.releaseTracks();
      cb.onError("Recording shuru nahi ho saki. Dobara koshish karein.");
    }
  }

  private releaseTracks(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    this.active = false;
  }

  private async finish(): Promise<void> {
    const cb = this.cb;
    const chunks = this.chunks;
    this.releaseTracks();
    if (!cb) return;
    const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
    if (blob.size < 1024) {
      cb.onError("Awaz record nahi hui. Mic daba kar saaf bolein.");
      cb.onEnd?.();
      return;
    }
    try {
      const fd = new FormData();
      fd.append("audio", new File([blob], "voice.webm", { type: blob.type || "audio/webm" }));
      fd.append("language", this.lang === "en" ? "en-US" : "ur-PK");
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (res.status === 501) {
        markWhisperBroken();
        cb.onError("Accurate voice set nahi hai — dobara mic dabayein to browser wali awaz use hogi, ya likh kar bhejein.");
        cb.onEnd?.();
        return;
      }
      if (!res.ok) throw new Error("stt_failed");
      const data = (await res.json()) as { text?: string };
      const text = (data.text ?? "").trim();
      if (text) cb.onFinal(text);
      else cb.onError("Awaz samajh nahi aayi. Dobara bolein ya likh kar bhejein.");
    } catch {
      cb.onError("Awaz bhejne mein masla aaya — internet check karein ya likh kar bhejein.");
    }
    cb.onEnd?.();
  }

  stop(): void {
    if (this.rec && this.rec.state !== "inactive") {
      try {
        this.rec.stop();
      } catch {
        this.releaseTracks();
      }
    } else if (!this.rec) {
      this.cancelled = true;
      this.releaseTracks();
    }
  }
}

export function speak(text: string, lang: Lang): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "en" ? "en-US" : "ur-PK";
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    void 0;
  }
}
