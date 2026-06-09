// MOCKUP DATA — Deal Builder. Illustrative values only, no data wiring.
// v2 | 2026-06-09 | Job_PM (CPO)

export const DIM_DIVISOR = 6000; // FedEx dim-weight divisor (pricing_constants)
export const RATE_PER_KG = 6.5; // FedEx rate per chargeable kg
export const GPM_FLOOR = 0.05; // 5% — covers sales commission; the catalog floor

export type Heat = 'hot' | 'warm' | 'cold';

export interface ClientIntel {
  estado: string;
  heat: Heat;
  likes: string[];
  dislikes: string[];
  paysToday: string;
  currentSupplier: string;
  businessType: string;
  keyQuote: string;
}

export interface Client {
  id: string;
  name: string;
  city: string;
  source: string; // provenance: where this client record came from
  intel: ClientIntel;
}

// Mock client list. Virginia Beach Florist comes from a sample box.
export const CLIENTS: Client[] = [
  {
    id: 'c-vbf',
    name: 'Virginia Beach Florist',
    city: 'Virginia Beach, VA',
    source: 'sample_box',
    intel: {
      estado: 'Cliente activo · sample convertido',
      heat: 'hot',
      likes: ['Rosas red premium (Freedom)', 'Tallos 50-60cm', 'Entrega consistente los martes'],
      dislikes: ['Variedades novelty raras', 'Cajas mixtas desordenadas', 'Cambios de precio sorpresa'],
      paysToday: '$0.31/stem en red 40cm via mayorista local',
      currentSupplier: 'Mayer Wholesale (Miami)',
      businessType: 'Retail florist + eventos (bodas)',
      keyQuote: '"Si me garantizan red premium todas las semanas al mismo precio, les muevo todo el volumen."',
    },
  },
  {
    id: 'c-bb',
    name: 'Bloom & Branch Co.',
    city: 'Austin, TX',
    source: 'manual',
    intel: {
      estado: 'Lead calificado · 2 llamadas',
      heat: 'warm',
      likes: ['Garden roses', 'Paleta pastel', 'Foliage local'],
      dislikes: ['Minimos altos'],
      paysToday: '$0.42/stem garden roses importadas',
      currentSupplier: 'Mercado local + import spot',
      businessType: 'Studio boutique de eventos',
      keyQuote: '"Necesito calidad consistente para bodas, no me sirve el spot."',
    },
  },
  {
    id: 'c-pp',
    name: 'Petals & Posies',
    city: 'Denver, CO',
    source: 'manual',
    intel: {
      estado: 'Lead frio · 1 email',
      heat: 'cold',
      likes: ['Precio agresivo', 'Carnations'],
      dislikes: ['Premium caro'],
      paysToday: '$0.18/stem carnation estandar',
      currentSupplier: 'Big-box wholesale',
      businessType: 'Florist de barrio, alto volumen / bajo margen',
      keyQuote: '"Compro por precio. Mostrame que me ahorras plata."',
    },
  },
  {
    id: 'c-eg',
    name: 'Evergreen Events',
    city: 'Seattle, WA',
    source: 'manual',
    intel: {
      estado: 'Cliente activo · standing order quincenal',
      heat: 'hot',
      likes: ['Hydrangea', 'Greenery volumen', 'Tonos blancos/verdes'],
      dislikes: ['Rojos fuertes'],
      paysToday: '$0.95/stem hydrangea premium',
      currentSupplier: 'Floropolis (parcial) + import',
      businessType: 'Productora de eventos corporativos',
      keyQuote: '"El volumen de greenery es mi cuello de botella cada semana."',
    },
  },
  {
    id: 'c-wf',
    name: 'Wildflower Studio',
    city: 'Portland, OR',
    source: 'manual',
    intel: {
      estado: 'Lead calificado · sample pedido',
      heat: 'warm',
      likes: ['Ranunculus', 'Variedades de estacion', 'Storytelling de origen'],
      dislikes: ['Commodity sin gracia'],
      paysToday: '$0.55/stem ranunculus de temporada',
      currentSupplier: 'Farmers market + import boutique',
      businessType: 'Studio de diseno floral premium',
      keyQuote: '"Quiero variedades que mis competidores no tienen."',
    },
  },
  {
    id: 'c-rr',
    name: 'Rose & Rye',
    city: 'Nashville, TN',
    source: 'manual',
    intel: {
      estado: 'Cliente activo',
      heat: 'warm',
      likes: ['Spray roses', 'Texturas', 'Mezclas de color'],
      dislikes: ['Tallos cortos'],
      paysToday: '$0.34/stem spray roses',
      currentSupplier: 'Floropolis + local',
      businessType: 'Retail + suscripcion semanal a consumidor',
      keyQuote: '"La suscripcion me obliga a tener stock confiable."',
    },
  },
];

export const HEAT_STYLE: Record<Heat, { label: string; dot: string; chip: string }> = {
  hot: { label: 'Hot', dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  warm: { label: 'Warm', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  cold: { label: 'Cold', dot: 'bg-slate-400', chip: 'bg-slate-50 text-slate-600 border-slate-200' },
};

export type Disposition = 'one_off' | 'tier' | 'temp_promo';

export interface VarietyLine {
  id: string;
  variety: string;
  grade: string;
  stems: number;
  box: string;
  costPerStem: number; // catalog farm cost / stem
  floorPerStem: number; // catalog price floor / stem
  pricePerStem: number; // seller price (>= floor)
  disposition: 'catalogo' | Disposition;
  isNew?: boolean;
}

export const INITIAL_LINES: VarietyLine[] = [
  { id: 'l1', variety: 'Freedom Red', grade: '40cm', stems: 300, box: 'HB-Std', costPerStem: 0.22, floorPerStem: 0.23, pricePerStem: 0.29, disposition: 'catalogo' },
  { id: 'l2', variety: 'Mondial White', grade: '50cm', stems: 200, box: 'HB-Std', costPerStem: 0.27, floorPerStem: 0.28, pricePerStem: 0.34, disposition: 'catalogo' },
  { id: 'l3', variety: 'Playa Blanca', grade: '60cm', stems: 100, box: 'QB-Tall', costPerStem: 0.31, floorPerStem: 0.33, pricePerStem: 0.39, disposition: 'one_off', isNew: true },
];

export interface BoxPack {
  name: string;
  capacity: number;
  unit: string;
  used: number;
  contents: string;
  cost: number;
}

export const BOX_PACKS: BoxPack[] = [
  { name: 'HB-Std', capacity: 500, unit: 'stems', used: 500, contents: 'Freedom Red 300 + Mondial White 200', cost: 118.0 },
  { name: 'QB-Tall', capacity: 120, unit: 'stems', used: 100, contents: 'Playa Blanca 100', cost: 64.4 },
];

export function money(n: number) {
  return '$' + n.toFixed(2);
}
