import { useState } from "react";
import { Dices, RotateCcw, Sparkles } from "lucide-react";
import { speakText } from "../../services/voiceEngine";

const TRACK_LENGTH = 28;

export function LudoBoard() {
  const [rajaPos, setRajaPos] = useState(0);
  const [angelPos, setAngelPos] = useState(0);
  const [dice, setDice] = useState<number>(6);
  const [turn, setTurn] = useState<"raja" | "angel">("raja");
  const [commentary, setCommentary] = useState(
    "Ludo தயார் ராஜா! Roll Dice அழுத்தி உங்க முதல் நகர்வை விளையாடுங்க!"
  );
  const [winner, setWinner] = useState<string | null>(null);

  const rollForAngel = (currentRaja: number, currentAngel: number) => {
    setTimeout(() => {
      const roll = Math.floor(Math.random() * 6) + 1;
      setDice(roll);
      let nextAngel = Math.min(TRACK_LENGTH, currentAngel + roll);
      if (nextAngel === currentRaja && nextAngel > 0 && nextAngel < TRACK_LENGTH) {
        setRajaPos(0);
        const msg = `ஹாஹா! எனக்கு ${roll} விழுந்துச்சு — உங்க காயினை வெட்டிட்டேன் ராஜா!`;
        setCommentary(msg);
        speakText(msg);
      } else if (nextAngel >= TRACK_LENGTH) {
        setWinner("Angel AI");
        const msg = "நான் ஜெயிச்சிட்டேன் ராஜா! இன்னொரு ஆட்டம் போடலாமா?";
        setCommentary(msg);
        speakText(msg);
      } else {
        setCommentary(`எனக்கு ${roll} விழுந்துச்சு! (${nextAngel}/${TRACK_LENGTH}) — இப்போ உங்க முறை ராஜா.`);
      }
      setAngelPos(nextAngel);
      setTurn("raja");
    }, 650);
  };

  const handleRajaRoll = () => {
    if (turn !== "raja" || winner) return;
    const roll = Math.floor(Math.random() * 6) + 1;
    setDice(roll);
    const nextRaja = Math.min(TRACK_LENGTH, rajaPos + roll);
    setRajaPos(nextRaja);

    if (nextRaja >= TRACK_LENGTH) {
      setWinner("Raja");
      const msg = "சூப்பர் ராஜா! நீங்க Ludo-ல ஜெயிச்சிட்டீங்க!";
      setCommentary(msg);
      speakText(msg);
      return;
    }

    if (nextRaja === angelPos && nextRaja > 0) {
      setAngelPos(0);
      setCommentary(`அட! ${roll} போட்டு என் காயினை வெட்டிட்டீங்களே! சரி என் முறை...`);
    } else {
      setCommentary(`உங்களுக்கு ${roll} விழுந்துச்சு (${nextRaja}/${TRACK_LENGTH}). இப்போ என் முறை...`);
    }

    setTurn("angel");
    rollForAngel(nextRaja, nextRaja === angelPos ? 0 : angelPos);
  };

  const handleReset = () => {
    setRajaPos(0);
    setAngelPos(0);
    setWinner(null);
    setTurn("raja");
    setCommentary("புதிய Ludo ஆட்டம் ஆரம்பம்! Roll Dice அழுத்துங்க ராஜா.");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-cyan-200 flex items-center gap-1.5">
          <Sparkles size={14} className="text-cyan-400" />
          <span>{commentary}</span>
        </div>
        <button
          onClick={handleReset}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs flex items-center gap-1"
        >
          <RotateCcw size={12} />
          <span>Reset</span>
        </button>
      </div>

      {/* Interactive 28-Tile Ludo Track */}
      <div className="grid grid-cols-7 gap-2 p-3 rounded-2xl bg-black/40 border border-white/10">
        {Array.from({ length: TRACK_LENGTH + 1 }).map((_, idx) => {
          const hasRaja = rajaPos === idx;
          const hasAngel = angelPos === idx;
          const isGoal = idx === TRACK_LENGTH;
          return (
            <div
              key={idx}
              className={`h-11 rounded-xl border flex flex-col items-center justify-center text-[10px] font-mono relative ${
                isGoal
                  ? "bg-amber-500/20 border-amber-400/60 text-amber-200 font-bold"
                  : idx === 0
                  ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-300"
                  : "bg-white/5 border-white/10 text-slate-400"
              }`}
            >
              <span>{isGoal ? "HOME" : idx === 0 ? "START" : idx}</span>
              <div className="flex items-center gap-1 mt-0.5">
                {hasRaja && (
                  <span className="w-3 h-3 rounded-full bg-cyan-400 border border-white shadow-[0_0_8px_#22d3ee]" title="Raja" />
                )}
                {hasAngel && (
                  <span className="w-3 h-3 rounded-full bg-rose-400 border border-white shadow-[0_0_8px_#fb7185]" title="Angel" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-3">
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-cyan-400" />
            <span>Raja: {rajaPos}/{TRACK_LENGTH}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-400" />
            <span>Angel: {angelPos}/{TRACK_LENGTH}</span>
          </span>
        </div>

        <button
          onClick={handleRajaRoll}
          disabled={turn !== "raja" || Boolean(winner)}
          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 disabled:opacity-40 transition"
        >
          <Dices size={15} />
          <span>{winner ? `${winner} Won!` : `Roll Dice (${dice})`}</span>
        </button>
      </div>
    </div>
  );
}
