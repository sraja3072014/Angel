import { useMemo, useState } from "react";
import { Search, MessageSquare, Sparkles, Layers, Sliders, X, ArrowRight } from "lucide-react";
import { ChatSession } from "./GeminiSidebar";
import { spawnStudio } from "../services/studioRouter";

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  onSelectSession: (session: ChatSession) => void;
  onOpenLibrary: () => void;
  onOpenMenuTab: (tab: string) => void;
  onOpenWorkshop: () => void;
  onRunPrompt: (prompt: string) => void;
}

const CORE_TOPICS = [
  { id: "feat-anycraft", title: "AnyCraft Image Studio (Remove BG & Edit)", kind: "Studio", action: "anycraft" },
  { id: "feat-3d", title: "3D Viewport Studio & Workshop", kind: "3D Workspace", action: "workshop" },
  { id: "feat-library", title: "Library (Images, 2D Work, 3D Work, Animation)", kind: "Library", action: "library" },
  { id: "feat-brain", title: "AI Brain (Online Cloud vs Offline Ollama)", kind: "Control Center", action: "menu:brain" },
  { id: "feat-avatar", title: "Avatar & Voice (2D 8-State & Tamil Voice)", kind: "Control Center", action: "menu:avatar_voice" },
  { id: "feat-cyber", title: "Angel CyberShield & OS Doctor", kind: "Security", action: "menu:cybershield" },
  { id: "feat-news", title: "Today's Live News (Tamil / English)", kind: "Live Action", action: "prompt:today news" },
];

export function GlobalSearchModal({
  open,
  onClose,
  sessions,
  onSelectSession,
  onOpenLibrary,
  onOpenMenuTab,
  onOpenWorkshop,
  onRunPrompt,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matchedChats = sessions
      .filter((s) => {
        if (!q) return true;
        if (s.title.toLowerCase().includes(q)) return true;
        return s.messages?.some((m: any) => String(m.text || "").toLowerCase().includes(q));
      })
      .slice(0, 6)
      .map((s) => ({
        id: s.id,
        title: s.title,
        subtitle: `${s.messages?.length || 0} messages • ${s.timestamp}`,
        kind: "Chat",
        onPick: () => {
          onSelectSession(s);
          onClose();
        },
      }));

    const matchedFeatures = CORE_TOPICS.filter(
      (f) => !q || f.title.toLowerCase().includes(q) || f.kind.toLowerCase().includes(q)
    ).map((f) => ({
      id: f.id,
      title: f.title,
      subtitle: f.kind,
      kind: f.kind,
      onPick: () => {
        onClose();
        if (f.action === "anycraft") spawnStudio("anycraft").catch(() => {});
        else if (f.action === "workshop") onOpenWorkshop();
        else if (f.action === "library") onOpenLibrary();
        else if (f.action.startsWith("menu:")) onOpenMenuTab(f.action.replace("menu:", ""));
        else if (f.action.startsWith("prompt:")) onRunPrompt(f.action.replace("prompt:", ""));
      },
    }));

    return [...matchedChats, ...matchedFeatures];
  }, [query, sessions, onSelectSession, onClose, onOpenWorkshop, onOpenLibrary, onOpenMenuTab, onRunPrompt]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-xl p-4 select-none">
      <div className="w-full max-w-xl rounded-2xl bg-slate-950/95 border border-cyan-400/40 backdrop-blur-2xl shadow-2xl overflow-hidden text-white">
        <div className="p-3.5 border-b border-white/10 flex items-center gap-2.5 bg-black/40">
          <Search size={16} className="text-cyan-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chat messages, Library items, studios, or Angel AI features..."
            className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2.5 space-y-1">
          {results.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No matching chats or features for &quot;{query}&quot;
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                onClick={item.onPick}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/10 flex items-center justify-between gap-3 transition group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.kind === "Chat" ? (
                    <MessageSquare size={14} className="text-cyan-400 shrink-0" />
                  ) : item.kind === "Library" ? (
                    <Layers size={14} className="text-emerald-400 shrink-0" />
                  ) : item.kind === "Control Center" ? (
                    <Sliders size={14} className="text-purple-400 shrink-0" />
                  ) : (
                    <Sparkles size={14} className="text-amber-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{item.title}</div>
                    <div className="text-[10px] text-slate-400 truncate">{item.subtitle}</div>
                  </div>
                </div>
                <ArrowRight size={13} className="text-slate-500 group-hover:text-cyan-300 shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
