import React, { Component, ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CursorCompanionOverlay } from "./components/CursorCompanionOverlay";
import { PetAvatarWindow } from "./components/PetAvatarWindow";
import { DesktopCompanionStage } from "./components/DesktopCompanionStage";
import { AnyCraftWindow } from "./components/studios/AnyCraftWindow";
import { MotionStudioWindow } from "./components/studios/MotionStudioWindow";
import { ThreeDStudioWindow } from "./components/studios/ThreeDStudioWindow";
import "./index.css";
import "./App.css";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("RootErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-[#020617] text-white p-6 select-none font-sans">
          <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900/95 border border-rose-500/50 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-400 flex items-center justify-center text-rose-400 font-bold text-xl">
              !
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Angel AI Runtime Recovery</h2>
              <p className="text-xs text-slate-400 mt-1">
                A rendering error occurred while loading this window module.
              </p>
            </div>
            {this.state.error && (
              <div className="w-full p-3 rounded-lg bg-black/60 border border-white/10 text-left font-mono text-[11px] text-rose-300 overflow-x-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
            >
              Reload Window
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Check window query params to mount either full dashboard, standalone Co-Pilot popup, Desktop Pet Avatar, or Studio Windows
const search = typeof window !== "undefined" ? window.location.search : "";
const isAnyCraftMode = search.includes("mode=studio_anycraft");
const isMotionStudioMode = search.includes("mode=studio_motion");
const isThreeDStudioMode = search.includes("mode=studio_threed");
const isCompanionAvatarMode = search.includes("mode=companion_avatar");
const isPetAvatarMode = search.includes("mode=angel_pet");
const isCopilotMode = search.includes("mode=copilot_popup") || search.includes("mode=cursor_orb");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      {isCompanionAvatarMode ? (
        <div className="w-screen h-screen bg-transparent overflow-hidden select-none">
          <DesktopCompanionStage />
        </div>
      ) : isAnyCraftMode ? (
        <AnyCraftWindow />
      ) : isMotionStudioMode ? (
        <MotionStudioWindow />
      ) : isThreeDStudioMode ? (
        <ThreeDStudioWindow />
      ) : isPetAvatarMode ? (
        <div className="w-screen h-screen bg-transparent overflow-hidden select-none">
          <PetAvatarWindow />
        </div>
      ) : isCopilotMode ? (
        <div className="w-screen h-screen bg-transparent overflow-hidden flex items-center justify-center select-none">
          <CursorCompanionOverlay isStandaloneWindow={true} />
        </div>
      ) : (
        <App />
      )}
    </RootErrorBoundary>
  </React.StrictMode>,
);
