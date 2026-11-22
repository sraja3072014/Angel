import { useState } from "react";
import {
  Plus,
  Search,
  Layers,
  Sparkles,
  CalendarClock,
  GraduationCap,
  Shield,
  Sliders,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

interface GeminiSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNewChat: () => void;
  onOpenMenu?: () => void;
  onOpenSecuritySuite: () => void;
  onSelectPrompt?: (prompt: string) => void;
  currentChatId?: string;
}

export function GeminiSidebar({
  collapsed,
  onToggleCollapse,
  onNewChat,
  onOpenMenu,
  onOpenSecuritySuite,
  onSelectPrompt,
}: GeminiSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeItem, setActiveItem] = useState<string>("chat");

  const recentChats = [
    { id: "1", title: "System Security & RAM Check", time: "10m ago" },
    { id: "2", title: "Windows 11 Volume & Screenshots", time: "1h ago" },
    { id: "3", title: "Open-Meteo Weather Koduvai API", time: "Yesterday" },
    { id: "4", title: "Three.js Ambient Hologram Earth", time: "2d ago" },
  ];

  const filteredChats = recentChats.filter((c) =>
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
        {/* Collapse toggle row */}
        <div className="flex items-center justify-between">
          {!collapsed && (
            <span className="text-[11px] font-mono tracking-widest text-slate-400 uppercase px-1">
              Workspace
            </span>
          )}
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* New Chat Pill Button */}
        <button
          onClick={onNewChat}
          title="New chat"
          className={`flex items-center gap-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold shadow-sm transition ${
            collapsed ? "p-2.5 justify-center" : "px-4 py-2.5 w-full"
          }`}
        >
          <Plus size={16} className="text-cyan-300" />
          {!collapsed && <span>New chat</span>}
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
              setActiveItem("student");
              onSelectPrompt?.("Enter Student guided learning mode: Explain the core concepts of Rust and WebAssembly step-by-step.");
            }}
            title="Student Learning"
            className={`flex items-center gap-3 rounded-xl hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white transition ${
              collapsed ? "p-2.5 justify-center" : "px-3 py-2"
            } ${activeItem === "student" ? "bg-white/10 text-white" : ""}`}
          >
            <GraduationCap size={16} className="text-emerald-400 shrink-0" />
            {!collapsed && <span>Student</span>}
          </button>
        </nav>

        {/* Quick Search Dropdown / Bar when expanded */}
        {!collapsed && showSearchModal && (
          <div className="p-2 rounded-xl bg-black/50 border border-white/10 space-y-1.5 animate-in fade-in duration-150">
            <input
              type="text"
              placeholder="Filter recent chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2.5 py-1 text-xs rounded bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <div className="max-h-28 overflow-y-auto space-y-1">
              {filteredChats.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    onSelectPrompt?.(`Load session: ${c.title}`);
                    setShowSearchModal(false);
                  }}
                  className="px-2 py-1 text-[11px] rounded hover:bg-white/10 cursor-pointer text-slate-300 truncate"
                >
                  {c.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Conversations List (when expanded) */}
        {!collapsed && (
          <div className="mt-3 flex-1 flex flex-col overflow-hidden">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1">
              Recent
            </div>
            <div className="flex flex-col gap-0.5 overflow-y-auto max-h-48 pr-1">
              {recentChats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectPrompt?.(`Load conversation topic: ${c.title}`)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-2 group transition"
                >
                  <MessageSquare size={13} className="text-slate-500 group-hover:text-cyan-300 shrink-0" />
                  <span className="truncate flex-1">{c.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Section */}
      <div className="p-3 border-t border-white/10 flex flex-col gap-1.5">
        {/* Unified Master Control Center Launcher */}
        <button
          onClick={onOpenMenu}
          title="Open Master Control Center (12 Modules)"
          className={`flex items-center gap-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 text-cyan-200 text-xs font-bold transition ${
            collapsed ? "p-2.5 justify-center" : "px-3 py-2"
          }`}
        >
          <Sliders size={16} className="text-cyan-400 shrink-0" />
          {!collapsed && <span className="truncate">Menu & Settings</span>}
        </button>

        {/* AI Antivirus & OS Doctor Launcher */}
        <button
          onClick={onOpenSecuritySuite}
          title="Open K7 AI Antivirus & OS Doctor"
          className={`flex items-center gap-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-bold transition ${
            collapsed ? "p-2.5 justify-center" : "px-3 py-2"
          }`}
        >
          <Shield size={16} className="text-emerald-400 shrink-0 animate-pulse" />
          {!collapsed && <span className="truncate">AI Antivirus & Doctor</span>}
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
