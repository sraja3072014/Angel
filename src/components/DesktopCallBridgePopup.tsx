import { useEffect, useState } from "react";
import { PhoneIncoming, PhoneCall, Bot, PhoneOff, ShieldAlert, Church, X } from "lucide-react";
import {
  CallTranscriptChunk,
  IncomingCallEvent,
  deviceSyncService,
} from "../services/deviceSyncService";
import { speakText } from "../services/voiceEngine";

export function DesktopCallBridgePopup() {
  const [activeCall, setActiveCall] = useState<IncomingCallEvent | null>(null);
  const [screeningActive, setScreeningActive] = useState(false);
  const [transcripts, setTranscripts] = useState<CallTranscriptChunk[]>([]);

  useEffect(() => {
    const unsubCall = deviceSyncService.onIncomingCall((call) => {
      setActiveCall(call);
      setScreeningActive(false);
      setTranscripts([]);

      const alertTa = `ராஜா, ${call.callerName} கால் பண்றாங்க. நீங்க மொபைல்ல எடுத்துப் பேசுறீங்களா, இல்ல நான் ஆட்டோமேட்டிக்கா பேசி மெசேஜ் வாங்கி வைக்கட்டுமா?`;
      speakText(alertTa);
    });

    const unsubTrans = deviceSyncService.onTranscript((chunk) => {
      setTranscripts((prev) => [...prev, chunk]);
    });

    return () => {
      unsubCall();
      unsubTrans();
    };
  }, []);

  if (!activeCall) return null;

  const handlePickUp = async () => {
    await deviceSyncService.dispatchCallAction(activeCall, "picked_up");
    setActiveCall(null);
  };

  const handleAiScreen = async () => {
    setScreeningActive(true);
    await deviceSyncService.dispatchCallAction(activeCall, "ai_screen");
    setTranscripts([
      {
        callId: activeCall.id,
        speaker: "angel",
        text: "வணக்கம்! நான் ராஜா-வின் Angel AI. அவர் இப்போது ஒரு வேலையில் இருக்கிறார்; உங்கள் செய்தியைச் சொல்லுங்கள், நான் உடனே தெரிவிக்கிறேன்.",
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  const handleRejectAutoSms = async () => {
    await deviceSyncService.dispatchCallAction(activeCall, "reject_auto_sms");
    setActiveCall(null);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[380px] rounded-2xl bg-slate-950/92 border border-cyan-400/50 backdrop-blur-2xl shadow-[0_0_45px_rgba(6,182,212,0.32)] p-4 space-y-3 text-white select-none animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center animate-pulse">
            <PhoneIncoming size={17} className="text-emerald-300" />
          </div>
          <div>
            <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
              <span>{activeCall.callerName}</span>
              {activeCall.isGraceMember && (
                <Church size={12} className="text-cyan-400" />
              )}
              {activeCall.isSpam && (
                <ShieldAlert size={12} className="text-rose-400" />
              )}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {activeCall.callerNumber} • {activeCall.timestamp}
            </div>
          </div>
        </div>

        <button
          onClick={() => setActiveCall(null)}
          className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* Caring Tamil Prompt */}
      <p className="text-[11px] text-cyan-200 leading-relaxed bg-white/5 border border-white/10 rounded-xl p-2.5">
        ராஜா, <b>{activeCall.callerName}</b> கால் பண்றாங்க. நீங்க மொபைல்ல எடுத்துப் பேசுறீங்களா, இல்ல நான் ஆட்டோமேட்டிக்கா பேசி மெசேஜ் வாங்கி வைக்கட்டுமா?
      </p>

      {/* Live AI Call Screening Transcript */}
      {screeningActive && (
        <div className="max-h-28 overflow-y-auto rounded-xl bg-black/60 border border-emerald-400/30 p-2 space-y-1.5 text-[11px]">
          {transcripts.map((t, idx) => (
            <div key={idx} className={t.speaker === "angel" ? "text-cyan-300" : "text-slate-200"}>
              <span className="font-bold uppercase text-[9px] mr-1.5">
                {t.speaker === "angel" ? "Angel:" : "Caller:"}
              </span>
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* 3-Action Call Handling */}
      <div className="grid grid-cols-3 gap-1.5 pt-1">
        <button
          onClick={handlePickUp}
          className="py-2 px-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[10.5px] font-bold flex flex-col items-center gap-1 transition"
        >
          <PhoneCall size={13} />
          <span>Pick Up</span>
        </button>

        <button
          onClick={handleAiScreen}
          className="py-2 px-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-[10.5px] font-bold flex flex-col items-center gap-1 transition"
        >
          <Bot size={13} />
          <span>AI Screen</span>
        </button>

        <button
          onClick={handleRejectAutoSms}
          className="py-2 px-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 text-[10.5px] font-bold flex flex-col items-center gap-1 transition"
        >
          <PhoneOff size={13} />
          <span>Reject+SMS</span>
        </button>
      </div>
    </div>
  );
}
