import { useCallback, useEffect, useRef, useState } from "react";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import { omniChatCompletion, sarvamSpeechToText, sarvamTextToSpeech } from "../services/omniRouteClient";
import { angelVoice, speakText } from "../services/voiceEngine";
import {
  detectCreateSkillIntent,
  generateAndSaveSkill,
  getActiveSkillsSystemPrompt,
} from "../services/skillEngine";
import { AngelWorkspaceProfile, resolveLocalFallbackProfile } from "../services/supabaseAuth";

export type CompanionMode =
  | "idle"
  | "tamil_riddles"
  | "paatukku_paatu"
  | "bible_quiz"
  | "grace_church_admin";

export interface VoiceTurnMessage {
  role: "user" | "assistant";
  text: string;
  mode: CompanionMode;
  timestamp: string;
}

const MODE_SYSTEM_PROMPTS: Record<CompanionMode, string> = {
  idle:
    "You are Angel, Raja's warm, realistic human-like AI companion and co-pilot for Grace Church Management. Reply naturally in the user's language (Tamil, Tanglish, or English) in concise spoken sentences.",
  tamil_riddles:
    "You are in Tamil Riddles (விடுகதை) companion game mode! Ask clever, playful Tamil riddles (விடுகதை), evaluate Raja's spoken answers warmly in Tamil/Tanglish, give hints if needed, and immediately pose the next fun riddle.",
  paatukku_paatu:
    "You are in Paatukku Paatu (பாட்டுக்குப் பாட்டு) Tamil song antakshari mode! Match the ending syllable/letter of the user's Tamil song line, sing/quote a classic or melodic Tamil song line starting with that syllable, and invite the next turn.",
  bible_quiz:
    "You are in Daily Bible Verse & Interactive Bible Quiz mode for Grace Church Management. Share an encouraging daily Bible verse in Tamil/English, log any spoken prayer notes cleanly, and ask engaging interactive Bible trivia questions.",
  grace_church_admin:
    "You are in Grace Church Management Admin Co-Pilot mode. Help Raja manage church events, announcements, member follow-ups, Sunday service schedules, and media assets efficiently in Tamil/English.",
};

export function useAngelVoice(profile?: AngelWorkspaceProfile) {
  const [mode, setMode] = useState<CompanionMode>("idle");
  const [continuousLoop, setContinuousLoop] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [history, setHistory] = useState<VoiceTurnMessage[]>([]);

  const isSpeakingRef = useRef(false);
  const continuousLoopRef = useRef(false);
  const modeRef = useRef<CompanionMode>("idle");
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechStartTimeRef = useRef<number>(0);

  useEffect(() => {
    continuousLoopRef.current = continuousLoop;
  }, [continuousLoop]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const speakReply = useCallback(async (text: string) => {
    if (!text.trim()) return;
    isSpeakingRef.current = true;
    setIsSpeaking(true);

    try {
      const hasTamil = /[\u0B80-\u0BFF]/.test(text);
      const sarvamB64 = await sarvamTextToSpeech(text, hasTamil ? "ta-IN" : "en-IN");

      if (sarvamB64) {
        const audio = new Audio(`data:audio/wav;base64,${sarvamB64}`);
        ttsAudioRef.current = audio;
        audio.volume = 0.9;
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          audio.play().catch(() => resolve());
        });
        ttsAudioRef.current = null;
      } else {
        await speakText(text);
      }
    } catch {
      await speakText(text);
    } finally {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    }
  }, []);

  const duckOrStopTTSForBargeIn = useCallback(() => {
    if (!isSpeakingRef.current) return;
    // Duck first, then stop cleanly if genuine user speech continues
    if (ttsAudioRef.current) {
      ttsAudioRef.current.volume = 0.15;
    }
    setTimeout(() => {
      if (Date.now() - speechStartTimeRef.current > 350 && isSpeakingRef.current) {
        if (ttsAudioRef.current) {
          ttsAudioRef.current.pause();
          ttsAudioRef.current = null;
        }
        angelVoice.stopSpeaking();
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      }
    }, 380);
  }, []);

  const processUserUtterance = useCallback(
    async (utterance: string, overrideMode?: CompanionMode) => {
      const clean = utterance.trim();
      if (!clean) return;

      setLastTranscript(clean);
      setIsProcessing(true);

      const lower = clean.toLowerCase();
      let activeMode = overrideMode || modeRef.current;

      // Detect Hands-Free Continuous Loop triggers
      if (
        lower.includes("keep talk with me") ||
        clean.includes("என் கூட பேசிட்டே இரு") ||
        lower.includes("continuous voice")
      ) {
        setContinuousLoop(true);
        continuousLoopRef.current = true;
      } else if (lower.includes("stop talking") || clean.includes("போதும் நிறுத்து")) {
        setContinuousLoop(false);
        continuousLoopRef.current = false;
      }

      // Detect Companion Game/Mode switches
      if (clean.includes("விடுகதை") || lower.includes("riddle")) {
        activeMode = "tamil_riddles";
        setMode("tamil_riddles");
      } else if (clean.includes("பாட்டுக்குப் பாட்டு") || lower.includes("paatukku")) {
        activeMode = "paatukku_paatu";
        setMode("paatukku_paatu");
      } else if (lower.includes("bible") || clean.includes("பைபிள்") || lower.includes("prayer")) {
        activeMode = "bible_quiz";
        setMode("bible_quiz");
      } else if (lower.includes("grace church") || lower.includes("church admin")) {
        activeMode = "grace_church_admin";
        setMode("grace_church_admin");
      }

      setHistory((prev) => [
        ...prev.slice(-14),
        {
          role: "user",
          text: clean,
          mode: activeMode,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      try {
        const activeProfile = profile || resolveLocalFallbackProfile();

        // Check Self-Generating Skill creation intent
        const newSkillTopic = detectCreateSkillIntent(clean);
        if (newSkillTopic) {
          const created = await generateAndSaveSkill(newSkillTopic, activeProfile);
          const reply = `புதிய "${created.name}" உருவாக்கப்பட்டு விட்டது ராஜா! இனி நான் இந்த skill-ஐப் பயன்படுத்தி உங்களுக்கு உதவுவேன்.`;
          setLastReply(reply);
          setHistory((prev) => [
            ...prev.slice(-14),
            { role: "assistant", text: reply, mode: activeMode, timestamp: new Date().toLocaleTimeString() },
          ]);
          await speakReply(reply);
          return reply;
        }

        const skillsPrompt = await getActiveSkillsSystemPrompt(activeProfile);
        const contextPrompt = activeProfile.isRajaAdmin
          ? "Primary User: Raja (Admin, Grace Church Management)."
          : `Workspace User: ${activeProfile.fullName} (Isolated Workspace).`;

        const systemMessage = `${MODE_SYSTEM_PROMPTS[activeMode]}\n${contextPrompt}${skillsPrompt}`;

        const recentMessages = history.slice(-6).map((m) => ({
          role: m.role,
          content: m.text,
        }));

        const result = await omniChatCompletion([
          { role: "system", content: systemMessage },
          ...recentMessages,
          { role: "user", content: clean },
        ]);

        setLastReply(result.text);
        setHistory((prev) => [
          ...prev.slice(-14),
          {
            role: "assistant",
            text: result.text,
            mode: activeMode,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);

        await speakReply(result.text);
        return result.text;
      } catch (err: any) {
        const fallback = `மன்னிக்கவும் ராஜா, இணைப்பில் சிறிய தாமதம்: ${err?.message || "Network error"}`;
        setLastReply(fallback);
        return fallback;
      } finally {
        setIsProcessing(false);
      }
    },
    [history, profile, speakReply]
  );

  // @ricky0123/vad-react with 1200ms (1.2s) Adaptive Pause Threshold + Hardware Echo Cancellation
  const vad = useMicVAD({
    startOnLoad: false,
    redemptionMs: 1200,
    minSpeechMs: 250,
    getStream: () =>
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      }),
    onSpeechStart: () => {
      speechStartTimeRef.current = Date.now();
      if (isSpeakingRef.current) {
        duckOrStopTTSForBargeIn();
      }
    },
    onSpeechEnd: async (audio: Float32Array) => {
      // Ignore very short accidental echo bursts while Angel is speaking
      if (isSpeakingRef.current && Date.now() - speechStartTimeRef.current < 400) {
        return;
      }

      try {
        const wavBuffer = utils.encodeWAV(audio);
        const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
        const transcript = await sarvamSpeechToText(wavBlob, "ta-IN");

        if (transcript && transcript.trim().length > 1) {
          await processUserUtterance(transcript);
        }
      } catch (err) {
        console.warn("VAD speech end processing error:", err);
      }
    },
  });

  const startContinuousMode = useCallback(
    async (initialMode?: CompanionMode) => {
      if (initialMode) {
        setMode(initialMode);
        modeRef.current = initialMode;
      }
      setContinuousLoop(true);
      continuousLoopRef.current = true;
      if (!vad.listening) {
        await vad.start().catch(() => {});
      }
      const greetingMap: Record<CompanionMode, string> = {
        idle: "வணக்கம் ராஜா! நான் கேட்டுட்டு இருக்கேன், பேசுங்க.",
        tamil_riddles: "விடுகதை விளையாட்டு ஆரம்பம்! முதல் விடுகதை: ஓடாமல் ஓடும், நிற்காமல் நிற்கும் — அது என்ன?",
        paatukku_paatu: "பாட்டுக்குப் பாட்டு ஆரம்பம்! நீங்க ஒரு தமிழ் பாட்டு பாடுங்க, நான் தொடர்றேன்.",
        bible_quiz: "இன்றைய வேதாகம வசனம்: 'கர்த்தர் என் மேய்ப்பராயிருக்கிறார்; எனக்குக் குறைவுபடாது' (சங்கீதம் 23:1). ஒரு Bible Quiz கேட்கட்டுமா?",
        grace_church_admin: "Grace Church Management Admin Mode தயார் ராஜா. என்ன அப்டேட் பண்ணனும்?",
      };
      const targetMode = initialMode || modeRef.current;
      await speakReply(greetingMap[targetMode]);
    },
    [speakReply, vad]
  );

  const stopContinuousMode = useCallback(async () => {
    setContinuousLoop(false);
    continuousLoopRef.current = false;
    angelVoice.stopSpeaking();
    if (vad.listening) {
      await vad.pause().catch(() => {});
    }
  }, [vad]);

  return {
    mode,
    setMode,
    continuousLoop,
    listening: vad.listening,
    vadLoading: vad.loading,
    vadError: vad.errored,
    userSpeaking: vad.userSpeaking,
    isSpeaking,
    isProcessing,
    lastTranscript,
    lastReply,
    history,
    startVoice: vad.start,
    pauseVoice: vad.pause,
    toggleVoice: vad.toggle,
    startContinuousMode,
    stopContinuousMode,
    processUserUtterance,
    speakReply,
  };
}
