import { useState } from "react";
import {
  Gamepad2,
  Crown,
  Dices,
  Grid3X3,
  Sparkles,
  Music,
  BookOpen,
  MessageSquare,
  Share2,
  X,
} from "lucide-react";
import { ChessArena } from "./ChessArena";
import { LudoBoard } from "./LudoBoard";
import { useAngelVoice } from "../../hooks/useAngelVoice";
import { handleGraceChurchCommand } from "../../services/churchCoPilot";

interface ArcadeTabProps {
  open: boolean;
  onClose: () => void;
}

type ArcadeGame = "chess" | "ludo" | "tictactoe" | "voice_hub";

export function ArcadeTab({ open, onClose }: ArcadeTabProps) {
  const [activeGame, setActiveGame] = useState<ArcadeGame>("chess");
  const [tttBoard, setTttBoard] = useState<Array<"X" | "O" | null>>(Array(9).fill(null));
  const [tttStatus, setTttStatus] = useState("Your turn (X), Raja!");
  const [churchShareStatus, setChurchShareStatus] = useState<string | null>(null);
  const voice = useAngelVoice();

  if (!open) return null;

  const checkTttWinner = (b: Array<"X" | "O" | null>) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    for (const [a, c, d] of lines) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return null;
  };

  const handleTttClick = (idx: number) => {
    if (tttBoard[idx] || checkTttWinner(tttBoard)) return;
    const next = [...tttBoard];
    next[idx] = "X";
    const winX = checkTttWinner(next);
    if (winX) {
      setTttBoard(next);
      setTttStatus("சூப்பர் ராஜா! நீங்க ஜெயிச்சிட்டீங்க!");
      voice.speakReply("சூப்பர் ராஜா! நீங்க ஜெயிச்சிட்டீங்க!");
      return;
    }

    const empty = next.map((v, i) => (v === null ? i : -1)).filter((i) => i !== -1);
    if (empty.length === 0) {
      setTttBoard(next);
      setTttStatus("Draw! நல்ல போட்டி ராஜா!");
      return;
    }

    const angelIdx = empty[Math.floor(Math.random() * empty.length)];
    next[angelIdx] = "O";
    setTttBoard(next);
    const winO = checkTttWinner(next);
    if (winO) {
      setTttStatus("நான் ஜெயிச்சிட்டேன் ராஜா! இன்னொரு முறை விளையாடலாமா?");
      voice.speakReply("நான் ஜெயிச்சிட்டேன் ராஜா!");
    } else {
      setTttStatus("Your turn (X), Raja!");
    }
  };

  const handleShareVerseToChurch = async () => {
    const res = await handleGraceChurchCommand(
      "Share today's encouraging Bible verse as a Grace Church Sunday WhatsApp announcement."
    );
    setChurchShareStatus(res.replyText);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl p-4 select-none">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl bg-slate-950/92 border border-cyan-400/40 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2.5">
            <Gamepad2 size={18} className="text-cyan-400" />
            <div>
              <h2 className="text-sm font-extrabold">CHILL &amp; ARCADE COMPANION</h2>
              <p className="text-[11px] text-slate-400">
                Voice-interactive Chess, Ludo, Tic-Tac-Toe &amp; Tamil Companion Games
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 py-2.5 border-b border-white/10 flex flex-wrap gap-2 bg-black/20">
          {[
            { id: "chess" as const, label: "Voice Chess", icon: Crown },
            { id: "ludo" as const, label: "2P Ludo", icon: Dices },
            { id: "tictactoe" as const, label: "Tic-Tac-Toe", icon: Grid3X3 },
            { id: "voice_hub" as const, label: "Voice Games Hub", icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveGame(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
                  activeGame === tab.id
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                }`}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Game Stage */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeGame === "chess" && <ChessArena />}
          {activeGame === "ludo" && <LudoBoard />}

          {activeGame === "tictactoe" && (
            <div className="flex flex-col items-center space-y-4">
              <div className="text-xs text-cyan-200 font-semibold">{tttStatus}</div>
              <div className="grid grid-cols-3 gap-2.5">
                {tttBoard.map((cell, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleTttClick(idx)}
                    className="w-20 h-20 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-2xl font-extrabold flex items-center justify-center text-cyan-300"
                  >
                    {cell}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setTttBoard(Array(9).fill(null));
                  setTttStatus("Your turn (X), Raja!");
                }}
                className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold"
              >
                New Round
              </button>
            </div>
          )}

          {activeGame === "voice_hub" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => voice.startContinuousMode("tamil_riddles")}
                className="p-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/30 text-left space-y-1 transition"
              >
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <Sparkles size={15} />
                  <span>விடுகதை (Tamil Riddles)</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Play clever Tamil riddles with Angel evaluating your spoken answers.
                </p>
              </button>

              <button
                onClick={() => voice.startContinuousMode("paatukku_paatu")}
                className="p-4 rounded-2xl bg-pink-500/10 hover:bg-pink-500/20 border border-pink-400/30 text-left space-y-1 transition"
              >
                <div className="flex items-center gap-2 text-pink-300 font-bold text-xs">
                  <Music size={15} />
                  <span>பாட்டுக்குப் பாட்டு (Antakshari)</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Tamil song antakshari matching the ending syllable in real time.
                </p>
              </button>

              <button
                onClick={() =>
                  voice.processUserUtterance(
                    "சொல்லுக்குச் சொல் (Tamil Word Chain) விளையாட்டு ஆரம்பிக்கலாம்! முதல் வார்த்தை: 'மழை'"
                  )
                }
                className="p-4 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 text-left space-y-1 transition"
              >
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                  <MessageSquare size={15} />
                  <span>சொல்லுக்குச் சொல் (Word Chain)</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Fast-paced Tamil/English ending-letter word chain challenge.
                </p>
              </button>

              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                  <BookOpen size={15} />
                  <span>Daily Bible Verses &amp; Quiz</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Play Bible trivia or share today&apos;s verse to Grace Church Management.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => voice.startContinuousMode("bible_quiz")}
                    className="px-3 py-1 rounded-lg bg-emerald-500/25 text-emerald-200 text-[11px] font-bold"
                  >
                    Start Quiz
                  </button>
                  <button
                    onClick={handleShareVerseToChurch}
                    className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-cyan-200 text-[11px] font-bold flex items-center gap-1"
                  >
                    <Share2 size={11} />
                    <span>Grace Church Share</span>
                  </button>
                </div>
                {churchShareStatus && (
                  <div className="text-[10.5px] text-cyan-200 bg-black/40 p-2 rounded-lg">
                    {churchShareStatus}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
