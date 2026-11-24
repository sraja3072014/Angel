import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Layers,
  Sparkles,
  CalendarClock,
  GraduationCap,
  Sliders,
  MessageSquare,
  ChevronLeft,
  CheckCircle2,
  Boxes,
} from "lucide-react";

export interface ChatSession {
  id: string;
  title: string;
  timestamp: string;
  messages: any[];
}

interface GeminiSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNewChat: () => void;
  onOpenMenu?: () => void;
  onSelectPrompt?: (prompt: string) => void;
  onOpenWorkshop?: () => void;
  currentChatId?: string | null;
  sessions?: ChatSession[];
  onSelectSession?: (session: ChatSession) => void;
}

export function GeminiSidebar({
  collapsed,
  onToggleCollapse,
  onNewChat,
  onOpenMenu,
  onSelectPrompt,
  onOpenWorkshop,
  currentChatId,
  sessions,
  onSelectSession,
}: GeminiSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeItem, setActiveItem] = useState<string>("chat");
  const [activeTheme, setActiveTheme] = useState<string>(() => {
    return localStorage.getItem("angel_3d_core_theme") || "quantum_gyro";
  });

  useEffect(() => {
    const handleThemeChange = (e: any) => {
      if (e.detail?.theme) {
        setActiveTheme(e.detail.theme);
      }
    };
    window.addEventListener("angel-3d-theme-changed", handleThemeChange);
    return () => window.removeEventListener("angel-3d-theme-changed", handleThemeChange);
  }, []);

  const displayChats = sessions && sessions.length > 0 ? sessions : [];

  const filteredChats = displayChats.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside
      className={`h-full flex flex-col justify-between transition-all duration-300 select-none z-20 ${
        collapsed ? "w-16" : "w-64"
      } bg-slate-950/60 backdrop-blur-2xl border-r border-white/10 text-white`}
    >
      {/* Top Header & New Chat */}
      <div className="p-3 flex flex-col gap-3">
        {/* Brand Header with miniature rotating 3D Earth orb & collapse toggle */}
        <div
          onClick={onToggleCollapse}
          className={`flex items-center justify-between rounded-xl hover:bg-white/5 cursor-pointer transition group ${
            collapsed ? "p-1 justify-center" : "px-2 py-1.5"
          }`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            {/* Miniature 3D-styled Core Icon synced to selected 3D Core Theme */}
            <div className="relative w-6 h-6 shrink-0 flex items-center justify-center">
              {activeTheme === "quantum_gyro" && (
                <div className="w-5 h-5 rounded-full border border-cyan-400/80 animate-[spin_4s_linear_infinite] flex items-center justify-center shadow-[0_0_8px_rgba(34,211,238,0.7)]">
                  <div className="w-3.5 h-3.5 rounded-full border border-amber-400/80 animate-[spin_2s_linear_infinite_reverse] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_4px_#22d3ee]" />
                  </div>
                </div>
              )}

              {activeTheme === "neural_synapse" && (
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-500 shadow-[0_0_8px_rgba(168,85,247,0.7)] flex items-center justify-center animate-pulse border border-purple-400/70">
                  <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_4px_#fff]" />
                </div>
              )}

              {activeTheme === "orbital_earth" && (
                <>
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-cyan-600 via-emerald-500 to-indigo-600 shadow-[0_0_10px_rgba(6,182,212,0.6)] flex items-center justify-center animate-[spin_12s_linear_infinite] border border-cyan-400/50">
                    <div className="w-2 h-2 rounded-full bg-emerald-300/50 blur-[0.5px]" />
                  </div>
                  <div className="absolute inset-0 rounded-full border border-cyan-300/40 rotate-45 scale-110 pointer-events-none" />
                </>
              )}

              {activeTheme === "volumetric_hologram" && (
                <>
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-teal-500 via-cyan-400 to-blue-600 shadow-[0_0_8px_rgba(20,184,166,0.7)] flex items-center justify-center border border-teal-300/60 animate-[spin_6s_linear_infinite]">
                    <div className="w-2 h-2 rounded-full bg-cyan-100 blur-[0.5px]" />
                  </div>
                  <div className="absolute inset-0 rounded-full border border-teal-300/40 rotate-12 scale-110 pointer-events-none" />
                </>
              )}
            </div>

            {!collapsed && (
              <span className="text-sm font-extrabold tracking-wide text-white drop-shadow flex items-center gap-1.5">
                <span className="text-cyan-400">✦</span> Angel AI
              </span>
            )}
          </div>

          {!collapsed && (
            <div className="text-slate-400 group-hover:text-white transition p-1">
              <ChevronLeft size={15} />
            </div>
          )}
        </div>

        {/* New Chat Pill Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNewChat();
          }}
          title="New chat (Ctrl+N)"
          className={`relative z-20 cursor-pointer flex items-center gap-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold shadow-sm transition active:scale-95 ${
            collapsed ? "p-2.5 justify-center" : "px-4 py-2.5 w-full"
          }`}
        >
          <Plus size={16} className="text-cyan-300 pointer-events-none" />
          {!collapsed && <span className="pointer-events-none">New chat</span>}
        </button>

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1 mt-1">
          <button
            onClick={() => {
              setActiveItem("search");
              setShowSearchModal(!showSearchModal);
            }}
            title="Search chat"
            className={`flex items-center gap-3 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white transition ${
              collapsed ? "p-2.5 justify-center" : "px-3 py-2"
            } ${activeItem === "search" ? "bg-white/10 text-white" : ""}`}
          >
            <Search size={16} className="text-slate-400 shrink-0" />
            {!collapsed && <span>Search chat</span>}
          </button>

          <button
            onClick={() => {
              setActiveItem("workshop");
              onOpenWorkshop?.();
            }}
            title="3D Workshop Studio"
            className={`flex items-center gap-3 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white transition ${
              collapsed ? "p-2.5 justify-center" : "px-3 py-2"
            } ${activeItem === "workshop" ? "bg-white/10 text-white" : ""}`}
          >
            <Boxes size={16} className="text-cyan-400 shrink-0" />
            {!collapsed && <span>3D Workshop</span>}
          </button>

          <button
            onClick={() => {
              setActiveItem("library");
              onSelectPrompt?.("Show saved library templates, code canvases, and pinned prompts.");
            }}
            title="Library"
            className={`flex items-center gap-3 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white transition ${
              collapsed ? "p-2.5 justify-center" : "px-3 py-2"
            } ${activeItem === "library" ? "bg-white/10 text-white" : ""}`}
          >
            <Layers size={16} className="text-slate-400 shrink-0" />
            {!collapsed && <span>Library</span>}
          </button>

          <button
            onClick={() => {
              setActiveItem("image");
              onSelectPrompt?.("Generate a cinematic ultra-realistic space view of Earth with satellite telemetry.");
            }}
            title="Image Studio"
            className={`flex items-center gap-3 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white transition ${
              collapsed ? "p-2.5 justify-center" : "px-3 py-2"
            } ${activeItem === "image" ? "bg-white/10 text-white" : ""}`}
          >
            <Sparkles size={16} className="text-amber-400 shrink-0" />
            {!collapsed && <span>Image</span>}
          </button>

          <button
            onClick={() => {
              setActiveItem("scheduled");
              onSelectPrompt?.("List all scheduled background autonomous tasks and active timers.");
            }}
            title="Scheduled Tasks"
            className={`flex items-center gap-3 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white transition ${
              collapsed ? "p-2.5 justify-center" : "px-3 py-2"
            } ${activeItem === "scheduled" ? "bg-white/10 text-white" : ""}`}
          >
            <CalendarClock size={16} className="text-sky-400 shrink-0" />
            {!collapsed && <span>Scheduled</span>}
          </button>

          <button
            onClick={() => {
              setActiveItem("education");
              onSelectPrompt?.("Teach me step-by-step how Angel AI executes local Rust reflexes with zero terminal flashes.");
            }}
            title="Interactive Learning"
            className={`flex items-center gap-3 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white transition ${
              collapsed ? "p-2.5 justify-center" : "px-3 py-2"
            } ${activeItem === "education" ? "bg-white/10 text-white" : ""}`}
          >
            <GraduationCap size={16} className="text-indigo-400 shrink-0" />
            {!collapsed && <span>Learn</span>}
          </button>
        </nav>

        {/* Quick Search Modal Popover */}
        {showSearchModal && !collapsed && (
          <div className="p-2.5 rounded-2xl bg-slate-900/90 border border-white/10 text-xs flex flex-col gap-2 animate-in fade-in duration-150">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400"
            />
          </div>
        )}

        {/* Recent Conversations List */}
        {!collapsed && (
          <div className="mt-2 flex flex-col gap-1 overflow-hidden">
            <div className="text-[11px] font-mono tracking-wider text-slate-400 uppercase px-2 mb-1 flex items-center justify-between">
              <span>Recent</span>
              {displayChats.length > 0 && (
                <span className="text-[10px] text-cyan-400 font-bold">{displayChats.length}</span>
              )}
            </div>
            <div className="flex flex-col gap-0.5 overflow-y-auto max-h-48 pr-1">
              {filteredChats.length > 0 ? (
                filteredChats.map((c) => {
                  const isActive = currentChatId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        if (onSelectSession) {
                          onSelectSession(c);
                        } else {
                          onSelectPrompt?.(`Load conversation topic: ${c.title}`);
                        }
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 group transition ${
                        isActive
                          ? "bg-cyan-950/40 border border-cyan-400/30 text-cyan-200 font-semibold"
                          : "hover:bg-white/10 text-slate-300 hover:text-white"
                      }`}
                    >
                      <MessageSquare
                        size={13}
                        className={isActive ? "text-cyan-400 shrink-0" : "text-slate-500 group-hover:text-cyan-300 shrink-0"}
                      />
                      <span className="truncate flex-1">{c.title}</span>
                    </button>
                  );
                })
              ) : (
                <div className="px-2 py-3 text-[11px] text-slate-500 italic text-center">
                  {searchQuery ? "No matching chats" : "No past chats yet"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Section */}
      <div className="p-3 border-t border-white/10 flex flex-col gap-1.5">
        {/* Unified Single Menu Button */}
        <button
          onClick={onOpenMenu}
          title="Open 12-Module Master Control Center"
          className={`flex items-center gap-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 text-cyan-200 text-xs font-bold transition ${
            collapsed ? "p-2.5 justify-center" : "px-3 py-2"
          }`}
        >
          <Sliders size={16} className="text-cyan-400 shrink-0" />
          {!collapsed && <span className="truncate">Menu</span>}
        </button>

        {/* User Profile Badge */}
        <div
          className={`flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 transition ${
            collapsed ? "p-2 justify-center" : "px-3 py-2"
          }`}
        >
          <div className="relative">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-md">
              R
            </div>
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
          </div>

          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                <span>Raja</span>
                <CheckCircle2 size={12} className="text-cyan-400" />
              </div>
              <div className="text-[10px] text-emerald-400 font-mono">Sovereign • Online</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
