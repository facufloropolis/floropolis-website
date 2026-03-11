export type FarmId = "ecoroses" | "flodecol" | "magic-flowers" | "megaflor";

export type FarmCountry = "Ecuador" | "Colombia" | "USA" | "Mexico";

export interface FarmProofPoint {
  label: string;
  detail: string;
}

export interface FarmProfile {
  id: FarmId;
  name: string;
  country: FarmCountry;
  regionLabel: string;
  whatTheyGrow: string[];
  vibeLine: string;
  proof: FarmProofPoint[];
  sustainability: string[];
  website: string;
  shopCtaLabel: string;
  shopHref: string;
}

export const FARMS: FarmProfile[] = [
  {
    id: "ecoroses",
    name: "EcoRoses",
    country: "Ecuador",
    regionLabel: "Machachi region (near Quito) · high-altitude growing",
    whatTheyGrow: ["Premium roses", "Ranunculus", "Eryngium"],
    vibeLine:
      "Premium roses built around cold chain discipline — consistent stems that hold up when it matters.",
    proof: [
      {
        label: "Vase-life tech",
        detail: "Neuthox +xprt adds 4–5 extra days",
      },
      {
        label: "Certifications",
        detail: "Florverde · Carbon Neutral · Flor Ecuador · BASC",
      },
    ],
    sustainability: [
      "Water efficiency + automated irrigation",
      "Integrated pest & disease management",
      "Circular initiatives (compost + closed-loop programs)",
    ],
    website: "https://ecoroses.com.ec/",
    shopCtaLabel: "Shop EcoRoses roses",
    shopHref: "/shop/roses",
  },
  {
    id: "flodecol",
    name: "Flodecol",
    country: "Ecuador",
    regionLabel: "Otón (about 45 min from Quito) · 50 hectare farm",
    whatTheyGrow: ["Gypsophila (white + tinted)"],
    vibeLine:
      "World-class gypsophila at scale — the kind of clean, bright filler that makes arrangements feel finished.",
    proof: [
      { label: "Scale", detail: "50 ha · 5M stems/month · 30 countries" },
      { label: "Certifications", detail: "Rainforest Alliance · Florverde" },
    ],
    sustainability: ["Rainforest Alliance standards", "Florverde (FSF) standards", "Employee support programs"],
    website: "https://www.flodecol.com/",
    shopCtaLabel: "Shop gypsophila",
    shopHref:
      "https://eshops.kometsales.com/762172?search=gypsophila&utm_source=Website&utm_campaign=Shop-Gypsophila",
  },
  {
    id: "magic-flowers",
    name: "Magic Flowers",
    country: "Ecuador",
    regionLabel: "Ecuador coast · family-run tropical specialists",
    whatTheyGrow: ["Heliconias", "Gingers", "Anthuriums", "Tropical novelties", "Tropical bouquets", "Greens"],
    vibeLine:
      "A rare kind of tropical farm — part design studio, part conservation project, and fully obsessed with variety.",
    proof: [
      { label: "Family since 1991", detail: "Maria & Esteban Saenz · 60+ species" },
      { label: "Conservation", detail: "Reproducing endangered rainforest species" },
    ],
    sustainability: ["Conservation-driven propagation", "Traceability + process control", "Hand-harvested production"],
    website: "https://www.magic-flowers.com/",
    shopCtaLabel: "Shop tropicals",
    shopHref: "/shop/tropicals",
  },
  {
    id: "megaflor",
    name: "Megaflor",
    country: "Ecuador",
    regionLabel: "Tungurahua · 3,150m altitude",
    whatTheyGrow: ["Ranunculus", "Anemones", "Delphinium", "Eryngium", "Larkspur", "Molucella", "Scabiosa"],
    vibeLine:
      "High-altitude specialty stems with modern production — built for clean lines, strong heads, and event work.",
    proof: [
      { label: "3,150m altitude", detail: "Tungurahua · optimal light & climate" },
      { label: "Tech", detail: "Automated climate · propagation · cold chain" },
    ],
    sustainability: ["Tech-enabled efficiency (less waste)", "Propagation for plant health", "Cold chain handling"],
    website: "https://megaflor.com.ec/",
    shopCtaLabel: "Shop specialty stems",
    shopHref: "/shop/spring-collection",
  },
];

export interface SupplyChainStep {
  title: string;
  detail: string;
}

export const SUPPLY_CHAIN: SupplyChainStep[] = [
  { title: "Farm harvest & grading", detail: "Cut timing + strict selection so stems start strong." },
  { title: "Hydration + cold rooms", detail: "Proper hydration and controlled temps protect vase life." },
  { title: "Air freight", detail: "Fast lane to the US so flowers don't sit." },
  { title: "Miami hub", detail: "Quick transfer, tight handling, clear tracking." },
  { title: "48–72h to your door", detail: "Reliable delivery windows for real schedules." },
];

export interface MapPin {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  kind: "farm" | "hub" | "coming-soon";
}

/** Human-readable locations for the sourcing network list (easy to scan). */
export interface SourcingLocation {
  name: string;
  region: string;
  country: string;
  kind: "farm" | "hub" | "coming-soon";
}

export const SOURCING_NETWORK: SourcingLocation[] = [
  { name: "EcoRoses", region: "Machachi (Andes)", country: "Ecuador", kind: "farm" },
  { name: "Flodecol", region: "Otón, near Quito", country: "Ecuador", kind: "farm" },
  { name: "Magic Flowers", region: "Coast", country: "Ecuador", kind: "farm" },
  { name: "Megaflor", region: "Tungurahua", country: "Ecuador", kind: "farm" },
  { name: "Partner farms", region: "—", country: "Colombia", kind: "farm" },
  { name: "Miami", region: "Distribution hub", country: "USA", kind: "hub" },
  { name: "Partner farms", region: "—", country: "USA", kind: "coming-soon" },
  { name: "Partner farms", region: "—", country: "Mexico", kind: "coming-soon" },
];

export const MAP_PINS: MapPin[] = [
  { id: "ecoroses", label: "EcoRoses", sublabel: "Ecuador · Andes", x: 210, y: 170, kind: "farm" },
  { id: "flodecol", label: "Flodecol", sublabel: "Ecuador · near Quito", x: 235, y: 160, kind: "farm" },
  { id: "magic", label: "Magic Flowers", sublabel: "Ecuador · Coast", x: 190, y: 215, kind: "farm" },
  { id: "megaflor", label: "Megaflor", sublabel: "Ecuador · Tungurahua", x: 260, y: 185, kind: "farm" },
  { id: "colombia", label: "Colombia", sublabel: "Partner farms", x: 210, y: 120, kind: "farm" },
  { id: "miami", label: "Miami", sublabel: "Hub · USA", x: 470, y: 170, kind: "hub" },
  { id: "usa", label: "USA", sublabel: "Coming soon", x: 430, y: 80, kind: "coming-soon" },
  { id: "mexico", label: "Mexico", sublabel: "Coming soon", x: 380, y: 140, kind: "coming-soon" },
];

export interface TeamMember {
  name: string;
  /** Short one-liner (e.g. for cards) */
  line: string;
  /** Personal background — why they're here, real experience */
  bio: string;
}

export const TEAM: TeamMember[] = [
  {
    name: "Juan Javier",
    line: "Grew up on one of Ecuador's most successful rose farms.",
    bio:
      "Juan Javier's family owned and ran one of the largest and most successful rose farms in Ecuador. He was the commercial lead there for years and grew up in the business — he knows farms, varieties, cold chain, and what florists actually need when the box lands. That depth on the flower side is why Floropolis is built around real farm relationships and real accountability.",
  },
  {
    name: "Facundo",
    line: "Farm kid from Argentina who spent 15+ years in big tech.",
    bio:
      "Facundo grew up on farms in Argentina, then spent over 15 years at companies like Google and Twitter — building large strategy and commercial teams with a strong emphasis on putting the client first and doing things well. He brings that mix to Floropolis: operational discipline, scale thinking, and a focus on making the experience for florists actually work. The tech and cross-industry experience is what helps us build systems that don't get in the way of the product.",
  },
];

export const SUSTAINABILITY_RECEIPTS: { title: string; items: string[] }[] = [
  {
    title: "Certifications & standards (farm-level)",
    items: [
      "Florverde Sustainable Flowers (FSF)",
      "Rainforest Alliance",
      "Carbon Neutrality (Versa) — EcoRoses",
      "Flor Ecuador — EcoRoses",
      "BASC supply-chain security — EcoRoses",
    ],
  },
  {
    title: "Practices that show up in the product",
    items: [
      "Water efficiency + automated irrigation",
      "Integrated pest & disease management",
      "Cold-room hydration protocols",
      "Employee programs and community investment (varies by farm)",
    ],
  },
];
