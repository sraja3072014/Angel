export interface WorkshopPart {
  id: string;
  name: string;
  status: string;
  code: string;
  completed: boolean;
  error?: string;
}

export interface WorkshopBuildState {
  id: string;
  title: string;
  prompt: string;
  parts: WorkshopPart[];
  spokenSummary?: string;
  thumbnail?: string;
  timestamp: string;
  floorplanData?: any;
}

const STORAGE_BUILDS_KEY = "angel_workshop_builds";

/**
 * Detect if user prompt is asking to physically build, model, or design a 3D object
 */
export function detectPhysicalBuildPrompt(prompt: string): boolean {
  const p = prompt.toLowerCase().trim();

  // Explicit software / UI exemptions
  if (
    /landing page|website|web app|frontend|react component|portfolio|html|css|tailwind|api route|backend|database|dashboard|login page/i.test(
      p
    )
  ) {
    return false;
  }

  // Explicit 3D commands
  if (
    /3d workshop|open workshop|in 3d|model in 3d|3d print|render in 3d|explode model|3d model|3d-யில்|முப்பரிமாணம்/i.test(
      p
    )
  ) {
    return true;
  }

  // Physical object design/build triggers
  const physicalKeywords = [
    "watch",
    "engine",
    "jet engine",
    "drone",
    "quadcopter",
    "camera",
    "robot",
    "robotic arm",
    "turbine",
    "wind turbine",
    "gearbox",
    "pc",
    "gaming pc",
    "computer",
    "lamp",
    "desk lamp",
    "speaker",
    "car",
    "supercar",
    "sports car",
    "chair",
    "ergonomic chair",
    "table",
    "desk",
    "house",
    "villa",
    "apartment",
    "floorplan",
    "floor plan",
    "room",
    "interior",
    "headphone",
    "headphones",
    "guitar",
    "electric guitar",
    "bicycle",
    "clock",
    "telescope",
    "microscope",
    "rocket",
    "satellite",
    "spacecraft",
    "prosthetic",
    "mechanical",
  ];

  const buildVerbs = [
    "build",
    "make",
    "design",
    "create",
    "construct",
    "model",
    "generate",
    "craft",
    "உருவாக்கு",
    "வடிவமை",
  ];

  const hasVerb = buildVerbs.some((v) => p.includes(v));
  const hasNoun = physicalKeywords.some((n) => p.includes(n));

  return hasVerb && hasNoun;
}

/**
 * System instruction provided to the LLM for streaming 3D procedural builds
 */
export const WORKSHOP_BUILDER_SYSTEM_PROMPT = `You are Angel AI's 3D Mechanical & Architectural Master Builder.
You generate production-quality, physically detailed 3D assemblies for the Angel AI 3D Workshop using Three.js and the W Builder Kit API.

STRICT STREAMING OUTPUT PROTOCOL:
You must output your build using this EXACT structured token format with zero markdown conversational commentary before or between blocks:

//@title <Clean English Build Title>
//@part <kebab-part-name> | <Short 4-6 word status summary>
(async () => {
  const g = new THREE.Group();
  // Construct Three.js geometry, materials, and meshes
  // Always use W.metal('steel'|'titanium'|'brass'|'copper'|'black'), W.glass(), or W.plastic(hex)
  W.add(g, {
    name: "<Human Readable Part Title>",
    label: "<Brief 2-3 word technical label>",
    explode: [x, y, z], // 3D explode direction vector, e.g. [0, 1.8, 0] or [1.2, 0, 0]
    description: "<Clear 1-2 sentence mechanical explanation of purpose and physics>"
  });
})();
//@end

//@part <next-part-name> | <Short status>
...
//@end

//@say <One concise Tamil/English spoken completion sentence for Angel AI voice>

AVAILABLE BUILDER KIT APIS:
- THREE: Standard Three.js library (Scene, Mesh, Group, BufferGeometry, Materials, etc.)
- W.add(meshOrGroup, { name, label, explode: [x, y, z], description })
- W.metal('steel' | 'titanium' | 'brass' | 'copper' | 'black')
- W.glass()
- W.plastic(0x38bdf8)
- W.throttle({ label, start: 0.2, sound: true }) -> registers power/spool physics
- W.floorplan({ rooms: [{ name, x, z, w, d, floor: 'wood'|'tile'|'carpet' }], doors: [...], windows: [...] })
- W.furniture(kind: 'sofa'|'bed'|'table'|'desk'|'bath'|'chair', { x, y, z, rotation })
- W.onTick(delta => { /* rotate rotors, spin fans, update dynamic elements */ })

RULES:
1. Always build 4 to 8 distinct interlocking parts so the assembly can be pulled apart ("Pull It Apart" / Exploded view).
2. Give every part an expressive explode vector [x, y, z] pointing away from the center.
3. Clean code only inside //@part ... //@end. Never use outer markdown fences like \`\`\`javascript inside the parts.`;

/**
 * Parse streaming LLM chunks into structured workshop parts
 */
export function parseWorkshopProtocolStream(rawText: string): {
  title?: string;
  parts: WorkshopPart[];
  inProgressPart?: { name: string; status: string; code: string };
  spokenSummary?: string;
} {
  let title: string | undefined;
  const titleMatch = rawText.match(/\/\/@title\s+([^\r\n]+)/);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  let spokenSummary: string | undefined;
  const sayMatch = rawText.match(/\/\/@say\s+([^\r\n]+)/);
  if (sayMatch) {
    spokenSummary = sayMatch[1].trim();
  }

  const parts: WorkshopPart[] = [];
  const partRegex = /\/\/@part\s+([a-zA-Z0-9_-]+)\s*\|\s*([^\r\n]+)([\s\S]*?)\/\/@end/g;
  let match: RegExpExecArray | null;

  while ((match = partRegex.exec(rawText)) !== null) {
    const name = match[1].trim();
    const status = match[2].trim();
    const code = match[3].trim();
    parts.push({
      id: name,
      name,
      status,
      code,
      completed: true,
    });
  }

  // Check if there is an in-progress unclosed part
  let inProgressPart: { name: string; status: string; code: string } | undefined;
  const lastPartStart = rawText.lastIndexOf("//@part");
  if (lastPartStart !== -1) {
    const afterStart = rawText.slice(lastPartStart);
    if (!afterStart.includes("//@end")) {
      const headerLineMatch = afterStart.match(/\/\/@part\s+([a-zA-Z0-9_-]+)\s*\|\s*([^\r\n]+)/);
      if (headerLineMatch) {
        const name = headerLineMatch[1].trim();
        const status = headerLineMatch[2].trim();
        const headerEnd = headerLineMatch[0].length;
        const code = afterStart.slice(headerEnd).trim();
        inProgressPart = { name, status, code };
      }
    }
  }

  return { title, parts, inProgressPart, spokenSummary };
}

/**
 * Generate repair prompt for a single failed part
 */
export function generatePartRepairPrompt(
  partName: string,
  errorMsg: string,
  originalCode: string
): string {
  return `The following 3D part threw a runtime JavaScript error in Three.js on the stage:
Part Name: ${partName}
Error Message: ${errorMsg}
Original Code:
${originalCode}

Fix the error and return ONLY the corrected single part block:
//@part ${partName} | Repaired ${partName}
(async () => {
  // Corrected Three.js body
})();
//@end`;
}

/**
 * Generate incremental editing prompt without restarting the build
 */
export function generateIncrementalEditPrompt(
  currentBuildTitle: string,
  existingParts: Array<{ name: string; description: string }>,
  editRequest: string
): string {
  const partsSummary = existingParts.map((p) => `- ${p.name}: ${p.description}`).join("\n");

  return `We have an existing 3D build open on the stage titled "${currentBuildTitle}".
Existing Parts:
${partsSummary}

User Modification Request: "${editRequest}"

INSTRUCTION:
DO NOT restart the build. Output ONLY the modified or newly added part(s) using //@part <kebab-name> ... //@end blocks.
If updating an existing part, use its exact existing name so it replaces in-place.
Finish with //@say <short confirmation spoken line>.`;
}

/**
 * Saved Builds Shelf LocalStorage helpers
 */
export function getSavedWorkshopBuilds(): WorkshopBuildState[] {
  try {
    const raw = localStorage.getItem(STORAGE_BUILDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWorkshopBuild(build: WorkshopBuildState): void {
  try {
    const existing = getSavedWorkshopBuilds();
    const filtered = existing.filter((b) => b.id !== build.id);
    const updated = [build, ...filtered].slice(0, 20); // Keep last 20 builds
    localStorage.setItem(STORAGE_BUILDS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Could not save workshop build:", err);
  }
}

export function deleteSavedWorkshopBuild(id: string): void {
  try {
    const existing = getSavedWorkshopBuilds();
    const updated = existing.filter((b) => b.id !== id);
    localStorage.setItem(STORAGE_BUILDS_KEY, JSON.stringify(updated));
  } catch {}
}
