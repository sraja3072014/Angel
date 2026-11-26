import { ShieldAlert, Check, CheckCheck, X } from "lucide-react";

export interface PermissionRequest {
  id: string;
  toolName: string;
  serverOrScope: string;
  description: string;
  argsPreview: string;
  riskLevel: "sensitive" | "destructive";
}

interface PermissionGateModalProps {
  request: PermissionRequest | null;
  onDecision: (decision: "allow_once" | "allow_session" | "deny") => void;
}

export function PermissionGateModal({ request, onDecision }: PermissionGateModalProps) {
  if (!request) return null;

  const isDestructive = request.riskLevel === "destructive";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-md rounded-2xl bg-slate-950/90 border border-cyan-400/50 backdrop-blur-2xl shadow-[0_0_50px_rgba(6,182,212,0.28)] p-5 space-y-4 text-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                isDestructive
                  ? "bg-rose-500/20 border-rose-400/50 text-rose-300"
                  : "bg-amber-500/20 border-amber-400/50 text-amber-300"
              }`}
            >
              <ShieldAlert size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">IRIS Permission Gate</h3>
              <p className="text-[11px] text-cyan-300 font-medium">
                ராஜா, இந்தச் செயலைச் செய்ய அனுமதிக்கலாமா?
              </p>
            </div>
          </div>
          <button
            onClick={() => onDecision("deny")}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
            title="Deny"
          >
            <X size={16} />
          </button>
        </div>

        <div className="rounded-xl bg-black/50 border border-white/10 p-3 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Tool / Action</span>
            <span className="font-mono font-bold text-cyan-200">{request.toolName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Scope</span>
            <span className="font-mono text-slate-300">{request.serverOrScope}</span>
          </div>
          <p className="text-[11px] text-slate-300 pt-1 border-t border-white/10">
            {request.description}
          </p>
          {request.argsPreview && (
            <pre className="mt-1.5 p-2 rounded-lg bg-slate-900/90 border border-white/5 text-[10px] font-mono text-amber-200 overflow-x-auto max-h-24">
              {request.argsPreview}
            </pre>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onDecision("allow_once")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-100 text-xs font-bold transition"
          >
            <Check size={14} />
            <span>Allow Once</span>
          </button>

          <button
            onClick={() => onDecision("allow_session")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-xs font-bold transition"
          >
            <CheckCheck size={14} />
            <span>Allow Session</span>
          </button>

          <button
            onClick={() => onDecision("deny")}
            className="py-2 px-3.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-rose-200 text-xs font-bold transition"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
