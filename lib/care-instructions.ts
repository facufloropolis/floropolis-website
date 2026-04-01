// Care instructions by flower category
// Written by Job_PM 2026-03-31 — generic per category, no variety-specific data needed
// Displayed on PDP below product specs

export type CareInstruction = {
  steps: string[];
  vaseLife: string;
  tip?: string;
};

export const CARE_INSTRUCTIONS: Record<string, CareInstruction> = {
  "Rose": {
    steps: [
      "Re-cut stems at 45° under running water",
      "Remove all foliage below waterline",
      "Hydrate in clean water + flower food for 4–6 hours before arranging",
      "Keep at 34–38°F (1–3°C) overnight",
    ],
    vaseLife: "7–12 days",
    tip: "Roses arrive in tight bud — allow 24–48h at room temp to open fully.",
  },
  "Ranunculus": {
    steps: [
      "Re-cut stems at 45° — stems are hollow, cut gently",
      "Use clean water only (no flower food — sensitive to salts)",
      "Hydrate in shallow water at 34–38°F for 2–4 hours",
      "Keep away from direct sunlight and heat",
    ],
    vaseLife: "7–10 days",
    tip: "Ranunculus continue to open after harvest — order tight buds for longer display life.",
  },
  "Anemone": {
    steps: [
      "Re-cut stems at 45° immediately upon arrival",
      "Hydrate in cold water for 4 hours before use",
      "Keep refrigerated at 34–38°F when not in use",
      "Avoid ethylene (keep away from fruit)",
    ],
    vaseLife: "5–8 days",
    tip: "Anemones are light-sensitive — blooms open in light and close in darkness. Great for events.",
  },
  "Delphinium": {
    steps: [
      "Re-cut stems at 45° and immediately place in water",
      "Hydrate in warm water (70°F) + flower food for 2 hours",
      "Keep upright — stems are fragile and can crack if laid flat",
      "Refrigerate at 36–40°F for storage",
    ],
    vaseLife: "5–8 days",
    tip: "Remove spent florets from the bottom of the spike to extend display life of upper blooms.",
  },
  "Tropicals": {
    steps: [
      "Re-cut stems at 45° with a sharp blade",
      "Hydrate in clean water at room temperature (60–70°F) — tropicals are cold-sensitive",
      "Do NOT refrigerate below 55°F — causes chilling injury",
      "Wipe leaves with a damp cloth to restore shine",
    ],
    vaseLife: "10–21 days",
    tip: "Tropicals last significantly longer than cold-climate flowers — ideal for events with long setup windows.",
  },
  "Greens & Foliage": {
    steps: [
      "Re-cut stems and hydrate in clean water for 4–6 hours",
      "Mist leaves lightly after conditioning",
      "Refrigerate at 36–40°F",
      "Remove any yellowing leaves before use",
    ],
    vaseLife: "7–14 days",
    tip: "Most greens last longer than flowers — condition separately and add to arrangements last.",
  },
  "Gypsophila": {
    steps: [
      "Re-cut stems and hydrate in water + flower food for 2–4 hours",
      "Keep in cool location at 36–40°F",
      "Avoid wetting flowers — spray only stems",
    ],
    vaseLife: "5–10 days",
    tip: "Baby's breath can be dried upside down for permanent arrangements.",
  },
  "Craspedia": {
    steps: [
      "Re-cut stems and hydrate in clean water for 2 hours",
      "Refrigerate at 36–40°F",
      "Minimal water needed — stems can rot if submerged too deep",
    ],
    vaseLife: "10–14 days",
    tip: "Billy balls dry beautifully — hang upside down in a dry space for permanent décor.",
  },
  "Scabiosa": {
    steps: [
      "Re-cut stems at 45° immediately upon arrival",
      "Hydrate in cold water + flower food for 4 hours",
      "Keep refrigerated at 34–38°F",
      "Remove lower leaves below waterline",
    ],
    vaseLife: "5–8 days",
  },
  "Larkspur": {
    steps: [
      "Re-cut stems and hydrate in water + flower food for 2–4 hours",
      "Keep refrigerated at 36–40°F",
      "Handle gently — florets detach easily when dry",
    ],
    vaseLife: "5–7 days",
    tip: "Condition in a cool room overnight before arranging for best petal retention.",
  },
  "Thistle": {
    steps: [
      "Re-cut stems and hydrate in clean water",
      "Wear gloves when handling — spines are sharp",
      "Refrigerate at 36–40°F",
    ],
    vaseLife: "10–14 days",
    tip: "Thistles dry well in water — let water evaporate naturally for dried arrangements.",
  },
  "Bells of Ireland": {
    steps: [
      "Re-cut stems and remove lower leaves",
      "Hydrate in cold water for 4–6 hours",
      "Keep refrigerated at 36–40°F",
      "Remove bells from lower 1/3 of stem before arranging",
    ],
    vaseLife: "7–10 days",
  },
  "Bouquets": {
    steps: [
      "Re-cut all stems 1–2 inches upon arrival",
      "Remove any packaging material and lower foliage",
      "Hydrate in clean water + flower food for 4–6 hours",
      "Keep refrigerated until delivery or use",
    ],
    vaseLife: "5–8 days",
    tip: "Change water every 2 days and re-cut stems to maximize vase life.",
  },
  "Mixed Boxes": {
    steps: [
      "Sort varieties upon arrival — each type may need different care",
      "Re-cut all stems and hydrate in clean water",
      "Condition cold-sensitive varieties separately from refrigerated flowers",
    ],
    vaseLife: "Varies by variety",
    tip: "See individual variety care instructions for specific handling of each flower type.",
  },
};

export function getCareInstructions(category: string): CareInstruction | null {
  return CARE_INSTRUCTIONS[category] ?? null;
}
