import { GoogleGenAI } from "@google/genai";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { loadAngelConfig } from "./cloudBrain";

export interface AngelVoiceConfig {
  preferredMic: string;
  vadTimeout: number; // 800 - 2500ms, default 1400
  languageMode: "auto" | "ta-IN" | "en-IN"; // default "auto"
  ttsEngine: "edge" | "multimodal" | "webspeech" | "piper_sapi"; // default "edge"
  voicePersona: "ta-IN-PallaviNeural" | "ta-IN-ValluvarNeural" | "en-IN-NeerjaNeural" | "en-GB-SoniaNeural" | "en-IN-PrabhatNeural"; // default "ta-IN-PallaviNeural"
  voiceGender: "female" | "male"; // default "female"
  volume: number; // 0 - 100, default 85
  speed: number; // 0.5 - 2.0, default 1.0
  pitch: number; // -20 - +20, default 0
}

export const DEFAULT_VOICE_CONFIG: AngelVoiceConfig = {
  preferredMic: "default",
  vadTimeout: 1400,
  languageMode: "auto",
  ttsEngine: "edge",
  voicePersona: "ta-IN-PallaviNeural",
  voiceGender: "female",
  volume: 85,
  speed: 1.0,
  pitch: 0,
};

export function loadAngelVoiceConfig(): AngelVoiceConfig {
  try {
    const raw = localStorage.getItem("angel_voice_config");
    if (raw) return { ...DEFAULT_VOICE_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_VOICE_CONFIG;
}

export function saveAngelVoiceConfig(cfg: AngelVoiceConfig) {
  try {
    localStorage.setItem("angel_voice_config", JSON.stringify(cfg));
    localStorage.setItem("angel_vad_silence_ms", cfg.vadTimeout.toString());
    localStorage.setItem("angel_voice_engine", cfg.ttsEngine);
  } catch (e) {
    console.warn("Failed to save voice config:", e);
  }
}

export class AngelVoiceEngine {
  private isConversationActive = false;
  private isSpeaking = false;
  private isMuted = false;
  private isWakeWordEnabled = false;

  private currentAudio: HTMLAudioElement | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadAnimationId: number | null = null;

  private speechRecognition: any = null;
  private currentSpeechSessionId = 0;

  private onWakeDetected?: () => void;
  private onCommandRecognized: (text: string) => void;
  private onStatusChange: (status: string, listening: boolean) => void;
  private onAudioLevelChange?: (level: number) => void;

  constructor(
    first?: (() => void) | ((text: string) => void),
    second?: ((text: string) => void) | ((status: string, listening: boolean) => void),
    third?: ((status: string, listening: boolean) => void) | ((level: number) => void),
    fourth?: (level: number) => void
  ) {
    if (typeof fourth === "function") {
      this.onWakeDetected = first as () => void;
      this.onCommandRecognized = second as (text: string) => void;
      this.onStatusChange = third as (status: string, listening: boolean) => void;
      this.onAudioLevelChange = fourth;
    } else if (typeof third === "function") {
      this.onWakeDetected = first as () => void;
      this.onCommandRecognized = second as (text: string) => void;
      this.onStatusChange = third as (status: string, listening: boolean) => void;
    } else if (typeof second === "function") {
      this.onCommandRecognized = (first || (() => {})) as (text: string) => void;
      this.onStatusChange = second as (status: string, listening: boolean) => void;
    } else {
      this.onCommandRecognized = () => {};
      this.onStatusChange = () => {};
    }

    this.isMuted = localStorage.getItem("angel_voice_muted") === "true";
    this.initSpeechRecognition();
  }

  public setAudioLevelCallback(cb: (level: number) => void) {
    this.onAudioLevelChange = cb;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopSpeaking();
    }
  }

  public stopSpeaking() {
    this.currentSpeechSessionId++;
    this.isSpeaking = false;
    try {
      invoke("stop_native_tts").catch(() => {});
    } catch {}
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  private initSpeechRecognition() {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      this.speechRecognition = new SpeechRec();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;

      const voiceCfg = loadAngelVoiceConfig();
      this.speechRecognition.lang = voiceCfg.languageMode === "en-IN" ? "en-IN" : "ta-IN";

      this.speechRecognition.onresult = (event: any) => {
        const lastIndex = event.results.length - 1;
        const heard = event.results[lastIndex][0].transcript.toLowerCase().trim();

        // Fast Interrupt detection
        if (/^(stop|wait|நிறுத்து|போதும்|அமைதி|quiet|pause)$/i.test(heard)) {
          this.stopSpeaking();
          this.stopRecording();
          return;
        }

        if (!this.isWakeWordEnabled || this.isSpeaking) return;

        if (heard.includes("hey angel") || heard.includes("angel") || heard.includes("ஏஞ்சல்")) {
          const cleaned = heard.replace(/hey angel|angel|ஏஞ்சல்/gi, "").trim();
          this.onWakeDetected?.();

          if (cleaned.length > 2) {
            this.onCommandRecognized(cleaned);
          } else {
            this.speak("Yes Raja, I am listening.", () => {}, () => {
              this.listenWithVAD(true);
            });
          }
        }
      };

      this.speechRecognition.onend = () => {
        if (this.isWakeWordEnabled && !this.isSpeaking) {
          try {
            this.speechRecognition.start();
          } catch {}
        }
      };
    }
  }

  public toggleWakeWord(): boolean {
    this.isWakeWordEnabled = !this.isWakeWordEnabled;
    if (this.isWakeWordEnabled) {
      try {
        this.speechRecognition?.start();
      } catch {}
      this.onStatusChange("Wake Word Active: Say 'Hey Angel'...", false);
    } else {
      try {
        this.speechRecognition?.stop();
      } catch {}
      this.stopAll();
      this.onStatusChange("Hands-Free Wake OFF", false);
    }
    return this.isWakeWordEnabled;
  }

  public stopAll() {
    this.isConversationActive = false;
    this.stopSpeaking();
    this.stopVAD();

    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.onAudioLevelChange?.(0);
    this.onStatusChange("Standby.", false);
  }

  /**
   * Smart Real-Time Silence Detection (VAD) with phrase buffering
   */
  public async listenOnce(keepConversationLoop = true) {
    return this.listenWithVAD(keepConversationLoop);
  }

  public async listenWithVAD(keepConversationLoop = true) {
    if (this.isSpeaking) return;
    this.isConversationActive = keepConversationLoop;
    this.onWakeDetected?.();

    const voiceCfg = loadAngelVoiceConfig();
    const isTa = voiceCfg.languageMode !== "en-IN";
    this.onStatusChange(
      isTa
        ? "Listening... (பேசுங்கள்: தமிழ் அல்லது English)"
        : "Listening... (Speak your command)",
      true
    );

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(voiceCfg.preferredMic && voiceCfg.preferredMic !== "default"
            ? { deviceId: { ideal: voiceCfg.preferredMic } }
            : {}),
        },
      };

      this.audioStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Setup Web Audio API Analyser for VAD
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);

      const chunks: BlobPart[] = [];
      this.mediaRecorder = new MediaRecorder(this.audioStream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        this.stopVAD();
        this.onAudioLevelChange?.(0);
        this.onStatusChange("Processing voice command...", false);

        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        await this.transcribeBlob(audioBlob, "audio/webm");
      };

      this.mediaRecorder.start();

      // Real-time VAD Monitoring with Phrase Buffering
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      let userHasSpoken = false;
      let lastSpeechTime = Date.now();
      const SILENCE_TIMEOUT_MS = voiceCfg.vadTimeout || 1400; // default 1400ms
      const MAX_RECORD_LIMIT_MS = 16000; // 16s safety ceiling
      const startTime = Date.now();

      const checkSilence = () => {
        if (!this.analyser || !this.mediaRecorder || this.mediaRecorder.state !== "recording") return;

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalizedLevel = Math.min(1, avg / 128);
        const volumeLevel100 = Math.min(100, Math.round(normalizedLevel * 100));
        this.onAudioLevelChange?.(volumeLevel100);

        const now = Date.now();

        // Energy threshold check (speech detected)
        if (normalizedLevel > 0.07) {
          userHasSpoken = true;
          lastSpeechTime = now;
        }

        // Phrase buffer: finish when user paused longer than SILENCE_TIMEOUT_MS
        if (userHasSpoken && now - lastSpeechTime > SILENCE_TIMEOUT_MS) {
          if (this.mediaRecorder.state === "recording") {
            this.mediaRecorder.stop();
          }
          return;
        }

        // Safety limit reached
        if (now - startTime > MAX_RECORD_LIMIT_MS) {
          if (this.mediaRecorder.state === "recording") {
            this.mediaRecorder.stop();
          }
          return;
        }

        this.vadAnimationId = requestAnimationFrame(checkSilence);
      };

      this.vadAnimationId = requestAnimationFrame(checkSilence);
    } catch (err: any) {
      console.warn("Microphone access error:", err);
      this.onStatusChange("Unable to access the microphone. Please check settings.", false);
      try {
        await this.runRustOfflineMic();
      } catch {
        throw err;
      }
    }
  }

  public isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === "recording";
  }

  public stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.stopVAD();
    this.onAudioLevelChange?.(0);
  }

  private stopVAD() {
    if (this.vadAnimationId) {
      cancelAnimationFrame(this.vadAnimationId);
      this.vadAnimationId = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((t) => t.stop());
      this.audioStream = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
  }

  /**
   * Neural Speech Synthesis (Tamil & English Dual-Route)
   */
  public async speakText(text: string, onStart?: () => void, onEnd?: () => void): Promise<void> {
    return this.speak(text, onStart, onEnd);
  }

  public async speak(text: string, onStart?: () => void, onEnd?: () => void) {
    if (this.isMuted || localStorage.getItem("angel_voice_muted") === "true") {
      this.stopSpeaking();
      onEnd?.();
      this.resumeListeningIfActive();
      return;
    }

    const cleanText = text
      .replace(/\[ACTION:[^\]]+\]/g, "")
      .replace(/[*#_`]/g, "")
      .trim();

    if (!cleanText) {
      onEnd?.();
      this.resumeListeningIfActive();
      return;
    }

    this.currentSpeechSessionId++;
    const sessionId = this.currentSpeechSessionId;

    this.isSpeaking = true;
    onStart?.();

    try {
      const lower = cleanText.toLowerCase();
      if (lower.includes("welcome raja") && (await this.tryPlayCustomAudio("/voices/welcome.mp3"))) {
        return;
      }

      const voiceCfg = loadAngelVoiceConfig();
      const vol = Math.max(0, Math.min(1, (voiceCfg.volume ?? 85) / 100));
      const rate = Math.max(0.5, Math.min(2.0, voiceCfg.speed ?? 1.0));
      const gender = voiceCfg.voiceGender || (voiceCfg.voicePersona?.includes("Valluvar") || voiceCfg.voicePersona?.includes("Prabhat") ? "male" : "female");

      // Split into sentence-level chunks for immediate microsecond streaming speech
      const rawSentences = cleanText.match(/[^.!?।\n]+[.!?।\n]*/g);
      const sentences = rawSentences && rawSentences.length > 0
        ? rawSentences.map((s) => s.trim()).filter((s) => s.length > 0)
        : [cleanText];

      for (let i = 0; i < sentences.length; i++) {
        if (this.currentSpeechSessionId !== sessionId || this.isMuted) break;
        const sentence = sentences[i];
        const hasTamil = /[\u0B80-\u0BFF]/.test(sentence);
        const targetLang = hasTamil || voiceCfg.languageMode === "ta-IN" ? "ta" : "en-IN";

        // Prewarm / prefetch subsequent sentence in parallel into disk cache
        if (i + 1 < sentences.length) {
          const nextSentence = sentences[i + 1];
          const nextHasTamil = /[\u0B80-\u0BFF]/.test(nextSentence);
          const nextLang = nextHasTamil || voiceCfg.languageMode === "ta-IN" ? "ta" : "en-IN";
          invoke("synthesize_neural_tts", {
            text: nextSentence,
            lang: nextLang,
            voice: nextHasTamil
              ? gender === "male" ? "ta-IN-ValluvarNeural" : "ta-IN-PallaviNeural"
              : gender === "male" ? "en-IN-PrabhatNeural" : "en-IN-NeerjaNeural",
          }).catch(() => {});
        }

        // 1. Guaranteed Audible Speech via Native Windows Media Player (<15ms from disk cache)
        try {
          await invoke<string>("speak_tamil_native", {
            text: sentence,
            lang: targetLang,
            gender,
            volume: vol,
            rate,
          });
        } catch (nativeErr) {
          console.warn("speak_tamil_native fallback to synthesize_neural_tts:", nativeErr);
          // Fallback: Web Audio / SAPI
          try {
            const chosenVoice = hasTamil
              ? gender === "male" ? "ta-IN-ValluvarNeural" : "ta-IN-PallaviNeural"
              : gender === "male" ? "en-IN-PrabhatNeural" : (voiceCfg.voicePersona || "en-IN-NeerjaNeural");
            const ratePercent = Math.round(((voiceCfg.speed ?? 1.0) - 1.0) * 100);
            const pitchHz = voiceCfg.pitch ?? 0;
            const base64Audio = await invoke<string>("synthesize_neural_tts", {
              text: sentence,
              lang: targetLang,
              voice: chosenVoice,
              ratePercent,
              pitchHz,
            });

            await this.playAudioBase64(base64Audio, voiceCfg);
          } catch {
            await this.speakWebSpeech(sentence, hasTamil);
          }
        }
      }
    } catch (outerErr) {
      console.warn("Voice speak error:", outerErr);
    } finally {
      if (this.currentSpeechSessionId === sessionId) {
        this.isSpeaking = false;
        onEnd?.();
        this.resumeListeningIfActive();
      }
    }
  }

  public async speakSecurityAlert(tamilAlertText: string, playChime = true): Promise<void> {
    if (playChime && typeof window !== "undefined") {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(880, audioCtx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.25);
          gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.3);
        }
      } catch {}
    }
    await this.speak(tamilAlertText);
  }

  private async playAudioBase64(dataUrl: string, cfg: AngelVoiceConfig): Promise<void> {
    try {
      let rawB64 = dataUrl;
      if (rawB64.startsWith("data:")) {
        const parts = rawB64.split(",");
        rawB64 = parts[1] || "";
      }
      const binaryStr = atob(rawB64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/mp3" });
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);

      audio.volume = Math.max(0, Math.min(1, (cfg.volume ?? 85) / 100));
      audio.playbackRate = Math.max(0.5, Math.min(2.0, cfg.speed ?? 1.0));
      this.currentAudio = audio;

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          this.currentAudio = null;
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        audio.onerror = () => {
          this.currentAudio = null;
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        audio.play().catch(() => {
          this.currentAudio = null;
          URL.revokeObjectURL(blobUrl);
          resolve();
        });
      });
    } catch (e) {
      console.warn("playAudioBase64 decoding error:", e);
    }
  }

  private async speakWebSpeech(text: string, isTamil: boolean): Promise<void> {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = isTamil ? "ta-IN" : "en-IN";
    utter.rate = isTamil ? 0.95 : 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (isTamil) {
      const taVoice = voices.find(
        (v) =>
          v.lang.startsWith("ta") ||
          v.name.toLowerCase().includes("tamil") ||
          v.name.toLowerCase().includes("pallavi")
      );
      if (taVoice) utter.voice = taVoice;
    } else {
      const enVoice = voices.find(
        (v) =>
          v.lang.startsWith("en-IN") ||
          v.name.toLowerCase().includes("neerja") ||
          v.name.toLowerCase().includes("india")
      );
      if (enVoice) utter.voice = enVoice;
    }

    await new Promise<void>((resolve) => {
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    });
  }

  private async tryPlayCustomAudio(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) return false;
      const audio = new Audio(url);
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
      return true;
    } catch {
      return false;
    }
  }

  private resumeListeningIfActive() {
    if (this.isConversationActive && !this.isSpeaking) {
      setTimeout(() => {
        if (this.isConversationActive && !this.isSpeaking) {
          this.listenWithVAD(true);
        }
      }, 500);
    }
  }

  /**
   * Audio File & STT Processing with Gemini Multimodal / Offline fallback
   */
  public async processAudioFile(file: File) {
    this.onStatusChange(`Reading audio: ${file.name}...`, true);
    const mimeType = file.name.toLowerCase().endsWith(".mp3") ? "audio/mp3" : "audio/wav";
    await this.transcribeBlob(file, mimeType);
  }

  private async transcribeBlob(blob: Blob, mimeType: string) {
    const cfg = loadAngelConfig();

    // 1. Google Gemini Multimodal Audio (Gemini 2.5 Flash / 2.0 Flash / 2.5 Flash-Lite)
    if (navigator.onLine && cfg.geminiKey) {
      try {
        const base64Audio = await this.blobToBase64(blob);
        const ai = new GoogleGenAI({ apiKey: cfg.geminiKey });
        const cleanModelName = (m: string) => m.replace(/^(models\/)+/, "").trim();
        const ladder = ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"];

        for (const model of ladder) {
          try {
            const resp = await ai.models.generateContent({
              model: cleanModelName(model),
              contents: [
                { inlineData: { mimeType, data: base64Audio } },
                "Transcribe this user's voice accurately. The user may speak Tamil, Tanglish (Tamil mixed with English), or English. Output the exact spoken words naturally.",
              ],
            });
            const text = (resp.text || "").trim();
            if (text) {
              this.onStatusChange(`Command: "${text}"`, false);
              this.onCommandRecognized(text);
              return;
            }
          } catch {
            continue;
          }
        }
      } catch {}
    }

    // 2. Groq Whisper Large V3 Turbo Multimodal Audio
    if (navigator.onLine && (cfg as any).groqKey) {
      try {
        const formData = new FormData();
        formData.append("file", blob, "voice.webm");
        formData.append("model", "whisper-large-v3-turbo");
        formData.append("prompt", "Tamil, Tanglish, and English conversational audio transcription.");

        const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(cfg as any).groqKey}`,
          },
          body: formData,
        });

        if (resp.ok) {
          const data = await resp.json();
          const text = (data.text || "").trim();
          if (text) {
            this.onStatusChange(`Command: "${text}"`, false);
            this.onCommandRecognized(text);
            return;
          }
        }
      } catch {}
    }

    // 3. Fallback to Windows SAPI Offline Mic
    await this.runRustOfflineMic();
  }

  private async runRustOfflineMic() {
    try {
      this.onStatusChange("Offline Voice Mode listening...", true);
      const offlineText = await invoke<string>("offline_speech_to_text", { wavPath: null });
      if (offlineText) {
        this.onStatusChange(`Offline: "${offlineText}"`, false);
        this.onCommandRecognized(offlineText);
      } else {
        this.onStatusChange("No voice detected.", false);
        this.resumeListeningIfActive();
      }
    } catch {
      this.onStatusChange("Microphone unavailable. Check settings.", false);
      this.isConversationActive = false;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        resolve(res.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const angelVoice = new AngelVoiceEngine();

export async function speakText(text: string, onStart?: () => void, onEnd?: () => void): Promise<void> {
  emit("angel-speech-start", { text }).catch(() => {});
  try {
    await angelVoice.speak(
      text,
      () => {
        onStart?.();
      },
      () => {
        emit("angel-speech-end", {}).catch(() => {});
        onEnd?.();
      }
    );
  } finally {
    emit("angel-speech-end", {}).catch(() => {});
  }
}

export async function speakSecurityAlert(tamilText: string, playChime = true): Promise<void> {
  await angelVoice.speakSecurityAlert(tamilText, playChime);
}

export const voiceEngine = {
  getAvailableMicrophones: async (): Promise<MediaDeviceInfo[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "audioinput");
    } catch {
      return [];
    }
  },
  setMicrophone: (_deviceId: string) => {},
};
