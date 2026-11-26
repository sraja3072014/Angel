import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadAngelConfig } from "../services/cloudBrain";
import { handleGraceChurchCommand } from "../services/churchCoPilot";
import { omniChatCompletion } from "../services/omniRouteClient";
import { recallRelevantMemories } from "../services/vectorMemory";
import { apiRateLimiter } from "../services/securityGuardrails";

export interface ActiveWindowInfo {
  app_name: string;
  process_name: string;
  window_title: string;
  context_hint: "vscode" | "grace_church" | "browser" | "general" | string;
}

export interface ScreenVisionResult {
  answer: string;
  windowInfo: ActiveWindowInfo;
  suggestedPatch?: string;
}

export function useScreenVision() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<ScreenVisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeActiveScreen = useCallback(async (userQuery: string): Promise<ScreenVisionResult> => {
    const rate = apiRateLimiter.checkAndConsume("screen_vision");
    if (!rate.allowed) {
      throw new Error(`Rate limit active. Please wait ${Math.ceil(rate.retryAfterMs / 1000)}s.`);
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      // 1. Inspect active foreground window & capture screen in RAM via Rust
      const [windowInfo, base64Jpeg] = await Promise.all([
        invoke<ActiveWindowInfo>("os_inspect_active_window").catch(
          (): ActiveWindowInfo => ({
            app_name: "Desktop",
            process_name: "explorer.exe",
            window_title: "Active Workspace",
            context_hint: "general",
          })
        ),
        invoke<string>("os_capture_active_screen_base64"),
      ]);

      // 2. Recall relevant semantic memories before answering
      const memories = await recallRelevantMemories(
        `${windowInfo.window_title} ${userQuery}`,
        4,
        0.45
      ).catch(() => []);
      const memoryContext = memories.length
        ? `\nRelevant User Memories:\n${memories.map((m) => `- ${m.content}`).join("\n")}`
        : "";

      // 3. Context-aware prompt specialization (VS Code vs Grace Church Management vs General)
      let domainDirective = "Explain what is visible on screen and solve the user's request concisely in their language (Tamil/Tanglish/English).";
      if (windowInfo.context_hint === "vscode") {
        domainDirective =
          "VS Code is active! Diagnose any visible TypeScript/Rust/code errors on screen and provide a concise 1-click patch inside a fenced code block.";
      } else if (windowInfo.context_hint === "grace_church") {
        domainDirective =
          "Grace Church Management is active! Assist with member records, offerings, prayer requests, or event schedules shown on screen.";
      }

      // If user explicitly asks Grace Church data query alongside screen
      if (windowInfo.context_hint === "grace_church" && /offering|birthday|prayer|காணிக்கை/i.test(userQuery)) {
        const churchRes = await handleGraceChurchCommand(userQuery);
        const result: ScreenVisionResult = { answer: churchRes.replyText, windowInfo };
        setLastResult(result);
        return result;
      }

      // 4. Send multimodal frame to Gemini Vision (or OmniRoute fallback)
      const cfg = loadAngelConfig();
      const geminiKey = (cfg.geminiKey || "").split(/[\n,]+/)[0]?.trim();
      let answerText = "";

      if (geminiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `[Active Window: ${windowInfo.app_name} — ${windowInfo.window_title}]\n${domainDirective}${memoryContext}\n\nUser Query: ${userQuery}`,
                  },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: base64Jpeg,
                    },
                  },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(20_000),
        });

        if (res.ok) {
          const data = await res.json();
          answerText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
      }

      if (!answerText) {
        const fallback = await omniChatCompletion([
          {
            role: "system",
            content: `Active Window: ${windowInfo.app_name} (${windowInfo.window_title}). ${domainDirective}${memoryContext}`,
          },
          { role: "user", content: userQuery },
        ]);
        answerText = fallback.text;
      }

      // Extract optional 1-click code patch if VS Code is active
      const codeMatch = answerText.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
      const result: ScreenVisionResult = {
        answer: answerText.trim(),
        windowInfo,
        suggestedPatch: codeMatch?.[1]?.trim(),
      };
      setLastResult(result);
      return result;
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
      throw err;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  return {
    isAnalyzing,
    lastResult,
    error,
    analyzeActiveScreen,
  };
}
