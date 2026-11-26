import { useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard, PieceDropHandlerArgs } from "react-chessboard";
import { RotateCcw, Sparkles } from "lucide-react";
import { speakText } from "../../services/voiceEngine";

type Difficulty = "casual" | "tactical" | "master";

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

export function ChessArena() {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(() => gameRef.current.fen());
  const [difficulty, setDifficulty] = useState<Difficulty>("tactical");
  const [commentary, setCommentary] = useState(
    "உங்க முதல் நகர்வை ஆடுங்க ராஜா! (White is yours)"
  );

  const pickAiMove = (chess: Chess, level: Difficulty) => {
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;

    if (level === "casual") {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // Score captures & checks for tactical / master play
    let bestScore = -999;
    let bestMoves = [moves[0]];

    for (const m of moves) {
      let score = Math.random() * (level === "tactical" ? 0.8 : 0.15);
      if (m.captured) {
        score += (PIECE_VALUES[m.captured] || 1) * 10;
      }
      if (m.san.includes("+")) score += 4;
      if (m.san.includes("#")) score += 1000;

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [m];
      } else if (Math.abs(score - bestScore) < 0.05) {
        bestMoves.push(m);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  };

  const makeAngelMove = () => {
    const chess = gameRef.current;
    if (chess.isGameOver()) return;

    const move = pickAiMove(chess, difficulty);
    if (!move) return;

    chess.move(move);
    setFen(chess.fen());

    let msg = "";
    if (chess.isCheckmate()) {
      msg = "செக்மேட் ராஜா! நல்ல ஆட்டம் — இன்னொரு முறை ஆடலாமா?";
    } else if (move.captured) {
      msg = `நல்ல மூவ் ராஜா, ஆனா என் ${move.piece === "n" ? "குதிரையைக்" : "காயினைக்"} கவனிக்கலையே!`;
    } else if (chess.inCheck()) {
      msg = "செக் ராஜா! கவனமா நகர்த்துங்க!";
    } else {
      msg = `நான் ${move.san} ஆடிட்டேன். உங்க முறை ராஜா!`;
    }
    setCommentary(msg);
    speakText(msg);
  };

  const handlePieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (!targetSquare) return false;
    const chess = gameRef.current;
    if (chess.isGameOver()) return false;

    try {
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
      if (!move) return false;

      setFen(chess.fen());
      if (chess.isCheckmate()) {
        const winMsg = "அருமை ராஜா! செக்மேட் பண்ணி ஜெயிச்சிட்டீங்க!";
        setCommentary(winMsg);
        speakText(winMsg);
        return true;
      }

      setTimeout(makeAngelMove, 380);
      return true;
    } catch {
      return false;
    }
  };

  const handleReset = () => {
    gameRef.current.reset();
    setFen(gameRef.current.fen());
    setCommentary("புதிய செஸ் போட்டி ஆரம்பம்! உங்க முதல் மூவ் ஆடுங்க ராஜா.");
  };

  return (
    <div className="flex flex-col md:flex-row gap-5 items-start justify-center">
      <div className="w-[340px] sm:w-[380px] rounded-2xl overflow-hidden border border-cyan-400/30 shadow-2xl">
        <Chessboard
          options={{
            position: fen,
            onPieceDrop: handlePieceDrop,
          }}
        />
      </div>

      <div className="flex-1 space-y-3 min-w-[220px]">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Angel AI Difficulty
          </div>
          <div className="flex gap-1.5">
            {(["casual", "tactical", "master"] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setDifficulty(lvl)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize border ${
                  difficulty === lvl
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
                    : "bg-black/40 border-white/10 text-slate-400"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-xs text-cyan-100 flex items-start gap-2">
          <Sparkles size={15} className="text-cyan-400 shrink-0 mt-0.5" />
          <span>{commentary}</span>
        </div>

        <button
          onClick={handleReset}
          className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold flex items-center justify-center gap-1.5"
        >
          <RotateCcw size={13} />
          <span>Restart Chess Match</span>
        </button>
      </div>
    </div>
  );
}
