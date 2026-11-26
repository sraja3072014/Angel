import { useState } from "react";
import {
  FolderKanban,
  Image as ImageIcon,
  Layers,
  Boxes,
  Film,
  Cpu,
  ExternalLink,
  X,
} from "lucide-react";
import { spawnStudio } from "../services/studioRouter";

export type LibraryCategory =
  | "images"
  | "2d_work"
  | "3d_work"
  | "animation_work"
  | "3d_workspace";

interface LibraryItem {
  id: string;
  category: LibraryCategory;
  title: string;
  status: string;
  details: string;
  actionLabel: string;
  actionType: "anycraft" | "threed" | "motion" | "workshop" | "avatar_2d";
}

interface LibraryModalProps {
  open: boolean;
  onClose: () => void;
  onOpenWorkshop: () => void;
  onOpenMenuTab: (tab: string) => void;
}

const CATEGORY_CARDS: Array<{
  id: LibraryCategory;
  title: string;
  subtitle: string;
  icon: typeof ImageIcon;
  accent: string;
}> = [
  {
    id: "images",
    title: "Images",
    subtitle: "Generated & saved visuals",
    icon: ImageIcon,
    accent: "text-cyan-400 border-cyan-400/40 bg-cyan-500/10",
  },
  {
    id: "2d_work",
    title: "2D Work",
    subtitle: "2D sprites & visual tasks",
    icon: Layers,
    accent: "text-emerald-400 border-emerald-400/40 bg-emerald-500/10",
  },
  {
    id: "3d_work",
    title: "3D Work",
    subtitle: "GLB, OBJ & STL models",
    icon: Boxes,
    accent: "text-purple-400 border-purple-400/40 bg-purple-500/10",
  },
  {
    id: "animation_work",
    title: "Animation Work",
    subtitle: "8-state 2D & lip-sync clips",
    icon: Film,
    accent: "text-amber-400 border-amber-400/40 bg-amber-500/10",
  },
  {
    id: "3d_workspace",
    title: "3D Workspace",
    subtitle: "Workshop builds & notes",
    icon: Cpu,
    accent: "text-sky-400 border-sky-400/40 bg-sky-500/10",
  },
];

const LIBRARY_ITEMS: LibraryItem[] = [
  {
    id: "img-1",
    category: "images",
    title: "Angel Blue/Gold Companion Visual",
    status: "Saved Asset",
    details: "Composed female AI companion image ready for AnyCraft Studio editing.",
    actionLabel: "Open in AnyCraft",
    actionType: "anycraft",
  },
  {
    id: "img-2",
    category: "images",
    title: "Grace Church Sunday Banner Prompt",
    status: "Template Ready",
    details: "Outdoor nature theme banner for Sunday service announcements.",
    actionLabel: "Open in AnyCraft",
    actionType: "anycraft",
  },
  {
    id: "2d-1",
    category: "2d_work",
    title: "Angel 2D Custom Sprite Profile",
    status: "Active",
    details: "2D canvas avatar sprite persisted in angel_2d_avatar_image.",
    actionLabel: "Configure 2D Avatar",
    actionType: "avatar_2d",
  },
  {
    id: "3d-1",
    category: "3d_work",
    title: "Grace Sanctuary Cross & Crystal Core",
    status: "3D Preset",
    details: "Interactive Three.js geometry with studio lighting & OBJ export.",
    actionLabel: "Open 3D Studio",
    actionType: "threed",
  },
  {
    id: "3d-2",
    category: "3d_work",
    title: "robot.glb Skeletal Asset",
    status: "Bundled",
    details: "62-clip local GLB asset at /assets/avatar/robot.glb.",
    actionLabel: "Open 3D Studio",
    actionType: "threed",
  },
  {
    id: "anim-1",
    category: "animation_work",
    title: "8-State 2D Lip-Sync & Blinking Controller",
    status: "Running 60fps",
    details: "Idle, Listening, Thinking, Speaking, Greeting, Alert, Happy & Cursor Tracking.",
    actionLabel: "Preview States",
    actionType: "avatar_2d",
  },
  {
    id: "anim-2",
    category: "animation_work",
    title: "Grace Church Announcement Motion Clip",
    status: "WebM Exportable",
    details: "60fps animated HTML5 canvas slide deck with MediaRecorder export.",
    actionLabel: "Open Motion Studio",
    actionType: "motion",
  },
  {
    id: "ws-1",
    category: "3d_workspace",
    title: "Interactive 3D Hardware & CAD Workshop",
    status: "Workspace Ready",
    details: "Parametric 3D assemblies, BOM notes, and physical build blueprints.",
    actionLabel: "Open 3D Workshop",
    actionType: "workshop",
  },
];

export function LibraryModal({
  open,
  onClose,
  onOpenWorkshop,
  onOpenMenuTab,
}: LibraryModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<LibraryCategory>("images");

  if (!open) return null;

  const filtered = LIBRARY_ITEMS.filter((item) => item.category === selectedCategory);

  const handleItemAction = async (item: LibraryItem) => {
    if (item.actionType === "anycraft") {
      await spawnStudio("anycraft", item.title).catch(() => {});
    } else if (item.actionType === "threed") {
      await spawnStudio("threed", item.title).catch(() => {});
    } else if (item.actionType === "motion") {
      await spawnStudio("motion", item.title).catch(() => {});
    } else if (item.actionType === "workshop") {
      onClose();
      onOpenWorkshop();
    } else if (item.actionType === "avatar_2d") {
      onClose();
      onOpenMenuTab("avatar_voice");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl p-4 select-none">
      <div className="w-full max-w-4xl max-h-[88vh] rounded-2xl bg-slate-950/92 border border-cyan-400/40 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden text-white">
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2.5">
            <FolderKanban size={18} className="text-cyan-400" />
            <div>
              <h2 className="text-sm font-extrabold">ANGEL AI LIBRARY</h2>
              <p className="text-[11px] text-slate-400">
                Organized workspace for Images, 2D Work, 3D Work, Animation Work &amp; 3D Workspace
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

        {/* 5 Category Boxes */}
        <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-2.5 border-b border-white/10 bg-black/20">
          {CATEGORY_CARDS.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`p-3 rounded-2xl border text-left transition flex flex-col gap-1.5 ${
                  isSelected
                    ? `${cat.accent} shadow-[0_0_20px_rgba(34,211,238,0.18)]`
                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Icon size={17} />
                <div className="text-xs font-extrabold">{cat.title}</div>
                <div className="text-[10px] text-slate-400 leading-tight">{cat.subtitle}</div>
              </button>
            );
          })}
        </div>

        {/* Filtered Category Items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{item.title}</span>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-[10px] font-mono text-cyan-300">
                    {item.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{item.details}</p>
              </div>
              <button
                onClick={() => handleItemAction(item)}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <ExternalLink size={12} />
                <span>{item.actionLabel}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
