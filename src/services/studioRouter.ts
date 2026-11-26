import { invoke } from "@tauri-apps/api/core";

export type StudioType = "anycraft" | "motion" | "threed" | "games";

export interface StudioRouteIntent {
  matched: boolean;
  studioType?: StudioType;
  reason?: string;
}

/**
 * Conversational Intent Router detecting visual media editing, video/animation creation,
 * 3D modeling, or interactive board games from voice, text, or dropped files.
 */
export function detectStudioIntent(prompt: string, droppedFilePath?: string): StudioRouteIntent {
  const lower = (prompt || "").toLowerCase();

  if (droppedFilePath && /\.(png|jpe?g|webp|bmp|gif)$/i.test(droppedFilePath)) {
    return { matched: true, studioType: "anycraft", reason: "Image file dropped onto Angel" };
  }

  if (
    /remove\s*background|change\s*outfit|inpaint|mask|photo\s*edit|anycraft|பேக்ரவுண்ட்\s*ரிமூவ்|உடை\s*மாற்று/i.test(
      prompt
    )
  ) {
    return { matched: true, studioType: "anycraft", reason: "Image / Outfit / Background editing intent" };
  }

  if (
    /motion\s*studio|create\s*(a\s*)?(video|animation|reel|promo)|church\s*(event\s*)?slide|வீடியோ|அனிமேஷன்/i.test(
      lower
    )
  ) {
    return { matched: true, studioType: "motion", reason: "Motion / Video announcement creation intent" };
  }

  if (
    /3d\s*(model|viewport|studio|preview|mesh)|image\s*to\s*3d|முப்பரிமாண/i.test(lower)
  ) {
    return { matched: true, studioType: "threed", reason: "3D modeling / viewport preview intent" };
  }

  return { matched: false };
}

export async function spawnStudio(
  studioType: StudioType,
  initialPrompt?: string,
  imagePath?: string
): Promise<string> {
  return invoke<string>("spawn_studio_window", {
    studioType,
    initialPrompt: initialPrompt || null,
    imagePath: imagePath || null,
  });
}

export async function syncStudioState(
  targetWindow: string,
  eventName: string,
  payload: Record<string, unknown>
): Promise<void> {
  await invoke("broadcast_studio_state", {
    targetWindow,
    eventName,
    payloadJson: JSON.stringify(payload),
  });
}
