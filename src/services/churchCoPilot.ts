import { getSupabaseClient, resolveLocalFallbackProfile } from "./supabaseAuth";
import { storeVectorMemory } from "./vectorMemory";
import { omniChatCompletion } from "./omniRouteClient";
import { sanitizeToolArguments } from "./securityGuardrails";

export interface ChurchSummaryResult {
  replyText: string;
  data?: Record<string, unknown>;
}

/**
 * Grace Church Management Co-Pilot Service
 * Connects directly to Grace Church Supabase schema (grace_offerings, grace_members, grace_prayer_requests)
 * with graceful fallback and n8n / Evolution API WhatsApp greeting drafting.
 */
export async function handleGraceChurchCommand(userQuery: string): Promise<ChurchSummaryResult> {
  const clean = userQuery.trim();
  const lower = clean.toLowerCase();
  const profile = resolveLocalFallbackProfile();
  const client = getSupabaseClient();

  // 1. Sunday Offering Summaries
  if (lower.includes("offering") || clean.includes("காணிக்கை") || lower.includes("sunday")) {
    if (client) {
      try {
        const { data, error } = await client
          .from("grace_offerings")
          .select("amount, offering_date, category")
          .order("offering_date", { ascending: false })
          .limit(10);

        if (!error && data && data.length > 0) {
          const total = data.reduce((sum, row: any) => sum + Number(row.amount || 0), 0);
          return {
            replyText: `Grace Church சமீபத்திய ${data.length} காணிக்கை பதிவுகளின் மொத்தம் ₹${total.toLocaleString("en-IN")}.`,
            data: { offerings: data, total },
          };
        }
      } catch {}
    }
  }

  // 2. Upcoming Family Birthdays / Anniversaries
  if (lower.includes("birthday") || lower.includes("anniversary") || clean.includes("பிறந்தநாள்")) {
    if (client) {
      try {
        const { data, error } = await client
          .from("grace_members")
          .select("full_name, phone, birth_date, anniversary_date")
          .limit(20);
        if (!error && data && data.length > 0) {
          return {
            replyText: `Grace Church-ல் ${data.length} உறுப்பினர்கள் விவரங்கள் பெறப்பட்டன. WhatsApp வாழ்த்துச் செய்தி அனுப்ப தயார்!`,
            data: { members: data },
          };
        }
      } catch {}
    }
  }

  // 3. Log Prayer Request (syncs with pgvector semantic memory + Supabase table)
  if (lower.includes("prayer") || clean.includes("ஜெப")) {
    await storeVectorMemory(`Grace Church Prayer Note: ${clean}`, "grace_church", { source: "copilot" }, profile);
    if (client) {
      try {
        await client.from("grace_prayer_requests").insert({
          user_id: profile.userId,
          request_text: clean,
          status: "active",
        });
      } catch {}
    }
    return {
      replyText: `ஜெபக் குறிப்பு Grace Church Prayer Register மற்றும் Semantic Memory-ல் சேமிக்கப்பட்டது ராஜா.`,
    };
  }

  // 4. Draft & Dispatch Automated WhatsApp Greetings via n8n / Evolution API
  if (lower.includes("whatsapp") || lower.includes("greeting") || clean.includes("வாழ்த்து")) {
    const draftRes = await omniChatCompletion([
      {
        role: "system",
        content:
          "You are Grace Church Management's warm pastoral assistant. Draft a short, loving Tamil + English WhatsApp birthday/anniversary greeting with an encouraging Bible verse.",
      },
      { role: "user", content: clean },
    ]);

    const webhookUrl = localStorage.getItem("angel_n8n_whatsapp_webhook") || "";
    if (webhookUrl) {
      const check = sanitizeToolArguments("whatsapp_webhook", { message: draftRes.text, webhookUrl });
      if (check.safe) {
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: draftRes.text, source: "angel_grace_church_copilot" }),
        }).catch(() => {});
      }
    }

    return {
      replyText: draftRes.text,
      data: { whatsappDraft: draftRes.text, webhookConfigured: Boolean(webhookUrl) },
    };
  }

  // 5. General Grace Church Management Co-Pilot Query
  const aiRes = await omniChatCompletion([
    {
      role: "system",
      content:
        "You are Angel AI, Grace Church Management Co-Pilot for Raja. Assist with church administration, member care, events, offerings, and Tamil/English announcements concisely.",
    },
    { role: "user", content: clean },
  ]);

  return { replyText: aiRes.text };
}
