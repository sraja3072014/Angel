import { GoogleGenAI } from "@google/genai";
import { invoke } from "@tauri-apps/api/core";
import { loadAngelConfig } from "./cloudBrain";

export class AngelVoiceEngine {
  private isConversationActive = false;
  private isSpeaking = false;
  private isWakeWordEnabled = false;

  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadAnimationId: number | null = null;

  private speechRecognition: any = null;

  private onWakeDetected?: () => void;
  private onCommandRecognized: (text: string) => void;
  private onStatusChange: (status: string, listening: boolean) => void;
  private onAudioLevelChange?: (level: number) => void;

  constructor(
    first: (() => void) | ((text: string) => void),
    second: ((text: string) => void) | ((status: string, listening: boolean) => void),
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
    } else {
      this.onCommandRecognized = first as (text: string) => void;
      this.onStatusChange = second as (status: string, listening: boolean) => void;
    }

    this.initSpeechRecognition();
  }

  public setAudioLevelCallback(cb: (level: number) => void) {
    this.onAudioLevelChange = cb;
  }

  private initSpeechRecognition() {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      this.speechRecognition = new SpeechRec();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = false;
      this.speechRecognition.lang = "en-IN";

      this.speechRecognition.onresult = (event: any) => {
        if (!this.isWakeWordEnabled || this.isSpeaking) return;
        const lastIndex = event.results.length - 1;
        const heard = event.results[lastIndex][0].transcript.toLowerCase().trim();

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
    this.isSpeaking = false;
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
   * 1. Smart Real-Time Silence Detection (VAD): Stops recording 1.2s after user finishes speaking
   */
  public async listenOnce(keepConversationLoop = true) {
    return this.listenWithVAD(keepConversationLoop);
  }

  public async listenWithVAD(keepConversationLoop = true) {
    if (this.isSpeaking) return;
    this.isConversationActive = keepConversationLoop;
    this.onWakeDetected?.();
    this.onStatusChange("Listening... (Speak in Tamil or English)", true);

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

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

      // Real-time VAD Monitoring
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      let userHasSpoken = false;
      let lastSpeechTime = Date.now();
      const SILENCE_TIMEOUT_MS = 1250; // 1.25s silence detection threshold
      const MAX_RECORD_LIMIT_MS = 14000; // 14s safety ceiling
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
        if (normalizedLevel > 0.08) {
          userHasSpoken = true;
          lastSpeechTime = now;
        }

        // If user spoke and was silent for 1.2s -> finish recording
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
    } catch (err) {
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
   * 2. Custom WAV/MP3 Voice File or Piper/Edge Neural TTS Voice Output
   */
  public async speak(text: string, onStart?: () => void, onEnd?: () => void) {
    const cleanText = text
      .replace(/\[ACTION:[^\]]+\]/g, "")
      .replace(/[*#_`]/g, "")
      .trim();

    if (!cleanText) {
      onEnd?.();
      this.resumeListeningIfActive();
      return;
    }

    this.isSpeaking = true;
    onStart?.();

    try {
      const lower = cleanText.toLowerCase();
      if (lower.includes("welcome raja") && (await this.tryPlayCustomAudio("/voices/welcome.mp3"))) {
        return;
      }

      const hasTamil = /[\u0B80-\u0BFF]/.test(cleanText);
      await invoke("speak_offline_tts", { text: cleanText, isTamil: hasTamil });
    } catch {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(cleanText);
        utter.lang = /[\u0B80-\u0BFF]/.test(cleanText) ? "ta-IN" : "en-IN";
        await new Promise<void>((resolve) => {
          utter.onend = () => resolve();
          utter.onerror = () => resolve();
          window.speechSynthesis.speak(utter);
        });
      }
    } finally {
      this.isSpeaking = false;
      onEnd?.();
      this.resumeListeningIfActive();
    }
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
   * 3. Audio File Processing
   */
  public async processAudioFile(file: File) {
    this.onStatusChange(`Reading audio: ${file.name}...`, true);
    const mimeType = file.name.toLowerCase().endsWith(".mp3") ? "audio/mp3" : "audio/wav";
    await this.transcribeBlob(file, mimeType);
  }

  private async transcribeBlob(blob: Blob, mimeType: string) {
    const cfg = loadAngelConfig();

    if (navigator.onLine && cfg.geminiKey) {
      try {
        const base64Audio = await this.blobToBase64(blob);
        const ai = new GoogleGenAI({ apiKey: cfg.geminiKey });
        const resp = await ai.models.generateContent({
          model: "gemini-3.5-flash-lite",
          contents: [
            { inlineData: { mimeType, data: base64Audio } },
            "Transcribe this audio accurately into text (Tamil, English, or Tanglish). Return ONLY the spoken words, nothing else.",
          ],
        });
        const text = (resp.text || "").trim();
        if (text) {
          this.onStatusChange(`Command: "${text}"`, false);
          this.onCommandRecognized(text);
          return;
        }
      } catch {}
    }

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
