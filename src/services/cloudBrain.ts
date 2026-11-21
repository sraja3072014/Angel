import { GoogleGenAI } from "@google/genai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";

export interface AngelConfig {
  geminiKey: string;
  supabaseUrl: string;
  supabaseKey: string;
  preferredMic: string;
  avMode: "copilot" | "standalone";
}

export interface MemoryFact {
  category: string;
  mem_key: string;
  mem_value: string;
  updated_at?: string;
  device_origin?: "windows" | "android";
}

export interface RelayCommand {
  id?: string;
  command_text: string;
  device_target: "windows" | "android";
  status: "pending" | "executed";
  created_at?: string;
}

export interface LearnedRule {
  id: string;
  rule_key: string;
  rule_value: string;
  category: "preference" | "security" | "custom_skill" | "habit";
  updated_at: string;
}

export interface CloudBrainConfig {
  geminiApiKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  primaryModel: string;
}

const CONFIG_STORAGE_KEY = "angel_tauri_config_v3";
const MEMORY_STORAGE_KEY = "angel_ram_memory_v3";

export function loadAngelConfig(): AngelConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    geminiKey: "",
    supabaseUrl: "",
    supabaseKey: "",
    preferredMic: "realme Buds Wireless 5 ANC",
    avMode: "copilot",
  };
}

export function saveAngelConfig(cfg: AngelConfig) {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
}

export interface GeminiAskOptions {
  screenBase64?: string;
  onChunk?: (partialText: string) => void;
  onFirstSentence?: (firstSentence: string) => void;
}

export class CloudBrainService {
  private memoryCache: Record<string, MemoryFact> = {};
  private supabase: SupabaseClient | null = null;
  private isListeningRelay = false;

  constructor() {
    try {
      const savedMem = localStorage.getItem(MEMORY_STORAGE_KEY);
      if (savedMem) this.memoryCache = JSON.parse(savedMem);
    } catch {}
    this.initSupabase();
  }

  public initSupabase(): boolean {
    const cfg = loadAngelConfig();
    if (cfg.supabaseUrl && cfg.supabaseKey) {
      try {
        this.supabase = createClient(cfg.supabaseUrl.trim(), cfg.supabaseKey.trim());
        return true;
      } catch {
        this.supabase = null;
      }
    }
    return false;
  }

  public async syncWithSupabase(): Promise<{ ok: boolean; message: string; success?: boolean }> {
    if (!this.initSupabase() || !this.supabase) {
      return { ok: false, success: false, message: "Local Mode: Supabase URL/Key கொடுக்கப்படவில்லை." };
    }
    try {
      const localItems = Object.values(this.memoryCache);
      if (localItems.length > 0) {
        await this.supabase.from("angel_memory").upsert(localItems, { onConflict: "mem_key" });
      }
      const { data, error } = await this.supabase.from("angel_memory").select("*").limit(50);
      if (error) throw error;
      if (data) {
        data.forEach((row: MemoryFact) => {
          const existing = this.memoryCache[row.mem_key];
          // Conflict-safe timestamp comparison
          if (!existing || (row.updated_at && (!existing.updated_at || row.updated_at > existing.updated_at))) {
            this.memoryCache[row.mem_key] = row;
          }
        });
        localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(this.memoryCache));
      }
      return { ok: true, success: true, message: `✅ Supabase Cloud Synced (${Object.keys(this.memoryCache).length} facts)` };
    } catch (err: any) {
      return { ok: false, success: false, message: `Sync Error: ${err?.message || "Connection failed"}` };
    }
  }

  public saveFact(category: string, key: string, value: string) {
    const fact: MemoryFact = {
      category,
      mem_key: key,
      mem_value: value,
      updated_at: new Date().toISOString(),
      device_origin: "windows",
    };
    this.memoryCache[key] = fact;
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(this.memoryCache));
    if (this.supabase) {
      this.supabase.from("angel_memory").upsert(fact, { onConflict: "mem_key" }).then(() => {});
    }
  }

  public removeFact(key: string) {
    delete this.memoryCache[key];
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(this.memoryCache));
  }

  public getConfig(): CloudBrainConfig {
    const cfg = loadAngelConfig();
    return {
      geminiApiKey: cfg.geminiKey,
      supabaseUrl: cfg.supabaseUrl,
      supabaseAnonKey: cfg.supabaseKey,
      primaryModel: "gemini-3.5-flash-lite",
    };
  }

  public saveConfig(cfg: Partial<CloudBrainConfig>) {
    const existing = loadAngelConfig();
    saveAngelConfig({
      ...existing,
      geminiKey: cfg.geminiApiKey ?? existing.geminiKey,
      supabaseUrl: cfg.supabaseUrl ?? existing.supabaseUrl,
      supabaseKey: cfg.supabaseAnonKey ?? existing.supabaseKey,
    });
    this.initSupabase();
  }

  public getLearnedRules(): LearnedRule[] {
    return Object.values(this.memoryCache).map((f) => ({
      id: f.mem_key,
      rule_key: f.mem_key,
      rule_value: f.mem_value,
      category: (f.category as any) || "preference",
      updated_at: f.updated_at || new Date().toISOString(),
    }));
  }

  public removeLearnedRule(id: string) {
    this.removeFact(id);
  }

  /**
   * Cross-Device Command Relay: Polls for commands sent from Android mobile
   */
  public startMobileRelayListener(onCommandReceived: (command: string) => void) {
    if (this.isListeningRelay || !this.supabase) return;
    this.isListeningRelay = true;

    setInterval(async () => {
      if (!this.supabase) return;
      try {
        const { data } = await this.supabase
          .from("angel_device_relay")
          .select("*")
          .eq("device_target", "windows")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1);

        if (data && data.length > 0) {
          const item = data[0];
          await this.supabase
            .from("angel_device_relay")
            .update({ status: "executed" })
            .eq("id", item.id);

          onCommandReceived(item.command_text);
        }
      } catch {}
    }, 5000);
  }

  /**
   * Send a command to Android mobile device
   */
  public async sendMobileCommand(commandText: string): Promise<boolean> {
    if (!this.supabase) return false;
    try {
      await this.supabase.from("angel_device_relay").insert({
        command_text: commandText,
        device_target: "android",
        status: "pending",
        created_at: new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    }
  }

  public async forgeSkill(description: string): Promise<{ success: boolean; message: string }> {
    const cfg = loadAngelConfig();
    if (!cfg.geminiKey) {
      return { success: false, message: "Gemini API Key needed to forge new skills." };
    }
    const ai = new GoogleGenAI({ apiKey: cfg.geminiKey });
    try {
      const forgePrompt = `Create a safe Windows CLI/PowerShell micro-skill JSON for this request: "${description}".
Return ONLY valid JSON with exact keys:
{"name": "Skill Name", "trigger": "short voice trigger phrase", "command_type": "powershell", "script": "safe one-line command", "description": "what it does"}
Never use destructive commands (rm, del, format).`;

      const res = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: forgePrompt,
      });
      const cleanJson = (res.text || "").replace(/```json|```/g, "").trim();
      const skillObj = JSON.parse(cleanJson);
      const savedMsg = await invoke<string>("forge_new_skill", { skill: skillObj });
      return { success: true, message: savedMsg };
    } catch (err: any) {
      return { success: false, message: `Skill Forge error: ${err?.message || err}` };
    }
  }

  /**
   * Streaming Gemini Multimodal & Screen Vision Brain
   */
  public async askGemini(
    userPrompt: string,
    options?: GeminiAskOptions
  ): Promise<string> {
    const cfg = loadAngelConfig();
    if (!cfg.geminiKey) {
      return "Welcome Raja! Click the Settings button at the top right to enter your Gemini API Key.";
    }

    const ai = new GoogleGenAI({ apiKey: cfg.geminiKey });
    const ladder = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"];

    // 1. Skill Forge trigger check
    if (/create skill|new skill|forge skill|புதிய திறன்|பிளகின் உருவாக்கு/i.test(userPrompt)) {
      const forgeRes = await this.forgeSkill(userPrompt);
      return forgeRes.message;
    }

    // 2. Check for Screen Vision AI query ("look at my screen", "what error is on my screen", etc.)
    let screenImageBase64 = options?.screenBase64;
    const isScreenVisionQuery =
      /look at (?:my )?screen|what(?:'s| is) on my screen|see my screen|screen error|error on my screen|summarize this page|திரை|திரையைப் பார்|என்ன இருக்கு/i.test(
        userPrompt
      );

    if (!screenImageBase64 && isScreenVisionQuery) {
      try {
        screenImageBase64 = await invoke<string>("capture_screen_base64");
      } catch (e) {
        console.warn("Screen Vision capture note:", e);
      }
    }

    // 3. Multi-Action OS Automation & Conversational Brain System Instruction
    const systemInstruction = `You are Angel, an ultra-fast sovereign Windows 11 desktop AI companion built for Raja.
Reply concisely and naturally in the EXACT language the user uses (Tamil, English, or Tanglish).
When analyzing a provided screen capture, precisely point out what is displayed, diagnose any visible error dialogs, or summarize the active window.

CRITICAL SYSTEM ACTION CAPABILITY:
You can execute single or multiple sequential native OS actions by placing [ACTION:...] tags at the very end of your response.
When the user asks for multi-step tasks, chain all corresponding action tags sequentially.

Available Action Tags:
- Set Master Volume (0-100%): [ACTION:SET_VOLUME|80] or [ACTION:CONTROL_VOLUME|mute] or [ACTION:CONTROL_VOLUME|up]
- Take Desktop Screenshot: [ACTION:SCREENSHOT]
- Open App or Website: [ACTION:OPEN_TARGET|firefox https://www.youtube.com/results?search_query=tamil+songs] or [ACTION:OPEN_TARGET|notepad] or [ACTION:OPEN_TARGET|calc]
- Set Screen Brightness (0-100%): [ACTION:SET_BRIGHTNESS|75]
- Control Media Playback: [ACTION:MEDIA|play_pause] or [ACTION:MEDIA|next] or [ACTION:MEDIA|prev]
- Search User Files: [ACTION:SEARCH_FILES|project]

Multi-Action Sequential Execution Examples:
1. User: "Set volume to 80%, take a screenshot, and open Firefox with YouTube"
   Assistant: "Sure Raja, adjusting volume to 80%, capturing your screen, and launching Firefox with YouTube now. [ACTION:SET_VOLUME|80] [ACTION:SCREENSHOT] [ACTION:OPEN_TARGET|firefox https://www.youtube.com]"

2. User: "ஒலியளவை 60% ஆக்கி நோட்பேட் திற"
   Assistant: "சரி ராஜா, ஒலியளவை 60% ஆக மாற்றி Notepad-ஐ திறக்கிறேன். [ACTION:SET_VOLUME|60] [ACTION:OPEN_TARGET|notepad]"`;

    // Construct content parts (multimodal if screen capture is present)
    const contentParts: any[] = [{ text: userPrompt }];
    if (screenImageBase64) {
      contentParts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: screenImageBase64,
        },
      });
    }

    for (const model of ladder) {
      try {
        let accumulated = "";
        let firstSentenceSpoken = false;

        // Streaming Gemini response
        const responseStream = await ai.models.generateContentStream({
          model,
          contents: contentParts,
          config: { systemInstruction },
        });

        for await (const chunk of responseStream) {
          const chunkText = chunk.text || "";
          accumulated += chunkText;

          // Progressive display update
          const displayClean = accumulated.replace(/\[ACTION:[^\]]+\]/g, "").trim();
          options?.onChunk?.(displayClean);

          // Fast-start speech: speak first sentence as soon as it completes
          if (!firstSentenceSpoken && options?.onFirstSentence) {
            const sentenceMatch = displayClean.match(/^(.*?[.!?\n])\s+/);
            if (sentenceMatch && sentenceMatch[1].length > 18) {
              firstSentenceSpoken = true;
              options.onFirstSentence(sentenceMatch[1].trim());
            }
          }
        }

        const fullText = accumulated.trim();

        if (/remember|ஞாபகம்|நினைவில்/i.test(userPrompt)) {
          this.saveFact("learned_rule", `rule_${Date.now()}`, userPrompt);
        }

        // Execute Multiple Sequential Action Tags in order
        const actionMatches = [...fullText.matchAll(/\[ACTION:([^\|\]]+)(?:\|([^\]]+))?\]/g)];
        for (const match of actionMatches) {
          const actionType = match[1]?.trim().toUpperCase();
          const actionParam = match[2]?.trim() || "";

          try {
            switch (actionType) {
              case "OPEN_TARGET":
                if (actionParam) {
                  await invoke("open_system_target", { target: actionParam });
                }
                break;
              case "SET_VOLUME":
              case "CONTROL_VOLUME": {
                const vol = parseInt(actionParam, 10);
                if (!isNaN(vol)) {
                  try {
                    await invoke("control_system_volume", { action: "set", level: vol });
                  } catch {
                    await invoke("set_system_volume", { levelPercent: vol });
                  }
                } else if (actionParam) {
                  await invoke("control_system_volume", { action: actionParam, level: null });
                }
                break;
              }
              case "SET_BRIGHTNESS": {
                const bright = parseInt(actionParam, 10);
                if (!isNaN(bright)) {
                  await invoke("set_screen_brightness", { percent: bright });
                }
                break;
              }
              case "MEDIA":
              case "MEDIA_PLAYBACK":
              case "CONTROL_MEDIA":
                if (actionParam) {
                  try {
                    await invoke("control_media_playback", { action: actionParam });
                  } catch {
                    await invoke("media_control", { action: actionParam });
                  }
                }
                break;
              case "SCREENSHOT":
              case "TAKE_SCREENSHOT":
                try {
                  await invoke("take_desktop_screenshot");
                } catch {
                  await invoke("capture_screen_to_pictures");
                }
                break;
              case "SEARCH_FILES":
                if (actionParam) {
                  await invoke("search_user_files", {
                    keyword: actionParam,
                    query: actionParam,
                    searchDir: null,
                  });
                }
                break;
            }
          } catch (e) {
            console.warn("Failed to execute action:", actionType, actionParam, e);
          }
        }

        const cleanReply = fullText.replace(/\[ACTION:[^\]]+\]/g, "").trim();

        // If first sentence wasn't triggered (e.g. short response), trigger now
        if (!firstSentenceSpoken && options?.onFirstSentence && cleanReply) {
          options.onFirstSentence(cleanReply);
        }

        return cleanReply;
      } catch {
        continue;
      }
    }
    return "மன்னிக்கவும் ராஜா, இப்போது Cloud மாடல்களைத் தொடர்பு கொள்ள முடியவில்லை.";
  }
}

export const cloudBrain = new CloudBrainService();
