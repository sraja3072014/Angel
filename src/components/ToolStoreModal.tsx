import { useEffect, useState } from "react";
import { Puzzle, Sparkles, Link2, Play, X } from "lucide-react";
import { RegisteredAngelTool, toolRegistry } from "../services/toolRegistry";

interface ToolStoreModalProps {
  open: boolean;
  onClose: () => void;
}

export function ToolStoreModal({ open, onClose }: ToolStoreModalProps) {
  const [tools, setTools] = useState<RegisteredAngelTool[]>([]);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const list = await toolRegistry.listTools();
    setTools(list);
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    return toolRegistry.subscribe(() => {
      refresh();
    });
  }, [open]);

  if (!open) return null;

  const handleSelfGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskPrompt.trim() || busy) return;
    setBusy(true);
    setStatus("Generating sandboxed TypeScript tool & JSON schema...");
    try {
      const created = await toolRegistry.generateAndRegisterTool(taskPrompt.trim());
      setTaskPrompt("");
      setStatus(`Hot-loaded tool "${created.name}" successfully!`);
    } catch (err: any) {
      setStatus(`Error: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleImportManifest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manifestUrl.trim() || busy) return;
    setBusy(true);
    setStatus("Validating & importing angel-plugin.json...");
    try {
      const imported = await toolRegistry.importFromManifestUrl(manifestUrl.trim());
      setManifestUrl("");
      setStatus(`Hot-loaded manifest plugin "${imported.name}"!`);
    } catch (err: any) {
      setStatus(`Import error: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleTestTool = async (name: string) => {
    try {
      const result = await toolRegistry.executeTool(name, { input: "test" });
      setStatus(`Tool "${name}" output: ${JSON.stringify(result)}`);
    } catch (err: any) {
      setStatus(`Execution error: ${err?.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xl p-4 select-none">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-950/90 border border-cyan-400/40 backdrop-blur-2xl shadow-2xl p-5 space-y-4 text-white max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Puzzle size={18} className="text-cyan-400" />
            <div>
              <h2 className="text-sm font-extrabold">Hot-Reloadable Tool Store (angel_tools)</h2>
              <p className="text-[11px] text-slate-400">
                Self-generate TypeScript tools or import angel-plugin.json without restarting Angel
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* 1. Self-Generate Tool */}
        <form onSubmit={handleSelfGenerate} className="flex gap-2">
          <input
            value={taskPrompt}
            onChange={(e) => setTaskPrompt(e.target.value)}
            placeholder="Describe a new tool (e.g., Calculate Grace Church Sunday tithe split)..."
            className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={busy || !taskPrompt.trim()}
            className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <Sparkles size={13} />
            <span>Self-Generate</span>
          </button>
        </form>

        {/* 2. One-Click Manifest Import */}
        <form onSubmit={handleImportManifest} className="flex gap-2">
          <input
            value={manifestUrl}
            onChange={(e) => setManifestUrl(e.target.value)}
            placeholder="Paste GitHub/HTTPS URL to angel-plugin.json..."
            className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={busy || !manifestUrl.trim()}
            className="px-3.5 py-2 rounded-xl bg-purple-500/25 hover:bg-purple-500/40 border border-purple-400/50 text-purple-100 font-bold text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <Link2 size={13} />
            <span>Import Manifest</span>
          </button>
        </form>

        {status && (
          <div className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-[11px] text-cyan-200">
            {status}
          </div>
        )}

        {/* Active Tools List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {tools.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No hot-loaded tools registered yet. Generate one above!
            </div>
          ) : (
            tools.map((tool) => (
              <div
                key={tool.id}
                className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-300">{tool.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                      {tool.source_type}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{tool.description}</p>
                </div>
                <button
                  onClick={() => handleTestTool(tool.name)}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[11px] font-bold flex items-center gap-1 shrink-0"
                >
                  <Play size={11} />
                  <span>Run</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
