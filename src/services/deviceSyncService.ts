import { invoke } from "@tauri-apps/api/core";
import { RealtimeChannel } from "@supabase/supabase-js";
import { AngelWorkspaceProfile, getSupabaseClient, resolveLocalFallbackProfile } from "./supabaseAuth";
import { spawnStudio } from "./studioRouter";
import { sanitizeToolArguments } from "./securityGuardrails";

export interface IncomingCallEvent {
  id: string;
  callerNumber: string;
  callerName: string;
  isGraceMember: boolean;
  isSpam: boolean;
  spamLabel?: string;
  timestamp: string;
}

export interface CallTranscriptChunk {
  callId: string;
  speaker: "caller" | "angel";
  text: string;
  timestamp: string;
}

export type CallActionType = "picked_up" | "ai_screen" | "reject_auto_sms";

class DeviceSyncBridge {
  private channel: RealtimeChannel | null = null;
  private callListeners = new Set<(call: IncomingCallEvent) => void>();
  private transcriptListeners = new Set<(chunk: CallTranscriptChunk) => void>();
  private clipboardListeners = new Set<(msg: string) => void>();

  public onIncomingCall(cb: (call: IncomingCallEvent) => void): () => void {
    this.callListeners.add(cb);
    return () => {
      this.callListeners.delete(cb);
    };
  }

  public onTranscript(cb: (chunk: CallTranscriptChunk) => void): () => void {
    this.transcriptListeners.add(cb);
    return () => {
      this.transcriptListeners.delete(cb);
    };
  }

  public onClipboardToast(cb: (msg: string) => void): () => void {
    this.clipboardListeners.add(cb);
    return () => {
      this.clipboardListeners.delete(cb);
    };
  }

  public async lookupCallerIdentity(
    phoneNumber: string,
    profile?: AngelWorkspaceProfile
  ): Promise<{ callerName: string; isGraceMember: boolean; isSpam: boolean; spamLabel?: string }> {
    const cleanNum = phoneNumber.replace(/\s+/g, "");
    const activeProfile = profile || resolveLocalFallbackProfile();
    const client = getSupabaseClient();

    if (client && !activeProfile.userId.startsWith("local-")) {
      try {
        const { data: spam } = await client
          .from("spam_registry")
          .select("label, risk_score")
          .eq("user_id", activeProfile.userId)
          .eq("phone_number", cleanNum)
          .maybeSingle();

        if (spam) {
          return {
            callerName: spam.label || "Suspected Spam",
            isGraceMember: false,
            isSpam: true,
            spamLabel: spam.label,
          };
        }

        const { data: member } = await client
          .from("grace_members")
          .select("full_name")
          .ilike("phone", `%${cleanNum.slice(-8)}%`)
          .maybeSingle();

        if (member?.full_name) {
          return {
            callerName: `${member.full_name} (Grace Church)`,
            isGraceMember: true,
            isSpam: false,
          };
        }
      } catch {}
    }

    return { callerName: phoneNumber, isGraceMember: false, isSpam: false };
  }

  public connectRealtime(profile?: AngelWorkspaceProfile): () => void {
    const activeProfile = profile || resolveLocalFallbackProfile();
    const client = getSupabaseClient();
    if (!client || activeProfile.userId.startsWith("local-")) {
      return () => {};
    }

    const channelName = `device_sync:${activeProfile.userId}`;
    this.channel = client
      .channel(channelName)
      .on("broadcast", { event: "incoming_call" }, async ({ payload }) => {
        const num = String(payload?.callerNumber || "Unknown");
        const lookup = await this.lookupCallerIdentity(num, activeProfile);
        const evt: IncomingCallEvent = {
          id: String(payload?.callId || `call-${Date.now()}`),
          callerNumber: num,
          callerName: payload?.callerName || lookup.callerName,
          isGraceMember: lookup.isGraceMember,
          isSpam: lookup.isSpam,
          spamLabel: lookup.spamLabel,
          timestamp: new Date().toLocaleTimeString(),
        };
        this.callListeners.forEach((cb) => cb(evt));
      })
      .on("broadcast", { event: "call_transcript" }, ({ payload }) => {
        const chunk: CallTranscriptChunk = {
          callId: String(payload?.callId || ""),
          speaker: payload?.speaker === "angel" ? "angel" : "caller",
          text: String(payload?.text || ""),
          timestamp: new Date().toLocaleTimeString(),
        };
        this.transcriptListeners.forEach((cb) => cb(chunk));
      })
      .on("broadcast", { event: "clipboard_sync" }, async ({ payload }) => {
        const text = String(payload?.text || "");
        if (text) {
          await invoke("os_set_clipboard_text", { text }).catch(() => {});
          this.clipboardListeners.forEach((cb) =>
            cb(`Mobile Clipboard Synced (${text.slice(0, 36)}...)`)
          );
        }
      })
      .on("broadcast", { event: "file_handoff" }, async ({ payload }) => {
        const imageDataUrl = String(payload?.imageUrl || "");
        if (imageDataUrl) {
          await spawnStudio("anycraft", "Mobile photo handoff", imageDataUrl).catch(() => {});
          this.clipboardListeners.forEach((cb) => cb("Mobile Photo opened in AnyCraft Studio!"));
        }
      })
      .subscribe();

    return () => {
      if (this.channel) {
        client.removeChannel(this.channel);
        this.channel = null;
      }
    };
  }

  public async dispatchCallAction(
    call: IncomingCallEvent,
    action: CallActionType,
    customReplyText?: string,
    profile?: AngelWorkspaceProfile
  ): Promise<void> {
    const activeProfile = profile || resolveLocalFallbackProfile();
    const client = getSupabaseClient();

    const defaultSms =
      customReplyText ||
      "வணக்கம்! ராஜா இப்போது முக்கியமான வேலையில் இருக்கிறார். சிறிது நேரத்தில் உங்களைத் தொடர்பு கொள்வார். — Angel AI";

    if (this.channel) {
      await this.channel.send({
        type: "broadcast",
        event: "call_action",
        payload: {
          callId: call.id,
          callerNumber: call.callerNumber,
          action,
          replyText: defaultSms,
        },
      });
    }

    // Also trigger n8n / Evolution API WhatsApp callback if configured
    if (action === "reject_auto_sms") {
      const webhook = localStorage.getItem("angel_n8n_whatsapp_webhook") || "";
      if (webhook) {
        const check = sanitizeToolArguments("call_auto_whatsapp", {
          phone: call.callerNumber,
          message: defaultSms,
        });
        if (check.safe) {
          fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: call.callerNumber,
              message: defaultSms,
              source: "angel_call_bridge",
            }),
          }).catch(() => {});
        }
      }
    }

    if (client && !activeProfile.userId.startsWith("local-")) {
      const modeMap: Record<CallActionType, string> = {
        picked_up: "picked_up",
        ai_screen: "ai_screened",
        reject_auto_sms: "rejected_auto_sms",
      };
      await client
        .from("call_logs")
        .insert({
          user_id: activeProfile.userId,
          workspace_id: activeProfile.workspaceId,
          caller_number: call.callerNumber,
          caller_name: call.callerName,
          handling_mode: modeMap[action],
          auto_reply_sent: action === "reject_auto_sms" ? defaultSms : null,
        })
        .then();
    }
  }

  public async sendDesktopClipboardToMobile(text: string): Promise<boolean> {
    if (!this.channel || !text.trim()) return false;
    await this.channel.send({
      type: "broadcast",
      event: "clipboard_sync",
      payload: { text, source: "windows" },
    });
    return true;
  }

  public triggerTestIncomingCall(callerName = "Pastor Samuel (Grace Church)", callerNumber = "+91 98765 43210") {
    const evt: IncomingCallEvent = {
      id: `test-call-${Date.now()}`,
      callerNumber,
      callerName,
      isGraceMember: true,
      isSpam: false,
      timestamp: new Date().toLocaleTimeString(),
    };
    this.callListeners.forEach((cb) => cb(evt));
  }
}

export const deviceSyncService = new DeviceSyncBridge();
