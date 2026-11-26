/**
 * Capacitor / Native Android CallScreeningBridge Specification & TypeScript Wrapper.
 * Connects Android's native `InCallService` / `CallScreeningService` (Kotlin)
 * to Supabase Realtime `device_sync:<user_id>` for desktop call handoff & AI screening.
 */

export interface AndroidCallPayload {
  callId: string;
  callerNumber: string;
  callerName?: string;
  isSilentMode: boolean;
}

export interface AndroidCallBridgePlugin {
  registerCallListener(): Promise<{ registered: boolean }>;
  answerWithAiStream(options: { callId: string; greetingTa: string }): Promise<{ active: boolean }>;
  rejectAndSendSms(options: { callId: string; phoneNumber: string; message: string }): Promise<{ sent: boolean }>;
  sendToDesktopClipboard(options: { text: string }): Promise<{ ok: boolean }>;
}

export function getCapacitorCallBridge(): AndroidCallBridgePlugin | null {
  const win = window as unknown as {
    Capacitor?: { Plugins?: { AngelCallBridge?: AndroidCallBridgePlugin } };
  };
  return win?.Capacitor?.Plugins?.AngelCallBridge || null;
}

export async function invokeAndroidScreeningAction(
  action: "ai_screen" | "reject_auto_sms",
  callId: string,
  phoneNumber: string,
  tamilPrompt: string
): Promise<boolean> {
  const bridge = getCapacitorCallBridge();
  if (!bridge) return false;

  if (action === "ai_screen") {
    const res = await bridge.answerWithAiStream({ callId, greetingTa: tamilPrompt });
    return res.active;
  }
  const res = await bridge.rejectAndSendSms({
    callId,
    phoneNumber,
    message: tamilPrompt,
  });
  return res.sent;
}
