// sampleDerive.ts — pure derivation helpers over JJ's real qualification notes.
// v1 | 2026-06-10 | Job_PM (CPO)
//
// These are HEURISTICS over JJ's free-text notes (FloraCohortRow.reasoning) and the
// fields parsed from them (pricesTheyPay, productsInterest, boxPreference). They never
// fabricate numbers or signals: every claim traces back to text present in the notes or
// to a present field. If signal is absent, functions return null or an honest "poco
// senalamientos" summary. NULL-safe throughout.

import type { FloraCohortRow } from '@/lib/admin/sample-review';

// Extract the CONFIRMED ADDRESS block from JJ's notes.
// provenance is always 'jj': JJ manually entered this during qualification — NOT
// system-verified by any backend or CRM API.
export function parseConfirmedAddress(
  reasoning: string | null,
): { line: string; provenance: 'jj' } | null {
  if (!reasoning) return null;
  const match = reasoning.match(/confirmed address[:\s]+([^\n]+)/i);
  if (!match) return null;
  const line = match[1].trim();
  return line ? { line, provenance: 'jj' } : null;
}

// Extract the intended box type: "Box: X" line in reasoning, fallback to boxPreference.
export function parseBoxType(
  reasoning: string | null,
  boxPreference: string | null,
): string | null {
  if (reasoning) {
    const match = reasoning.match(/^box[:\s]+(.+)$/im);
    if (match) {
      const val = match[1].trim();
      if (val) return val;
    }
  }
  return boxPreference ?? null;
}

// One-sentence plain-Spanish rationale derived from REAL signals in the row.
// Draws on pricesTheyPay (volume + price), productsInterest, and floraScore.
// Never invents numbers not present in the source text.
export function deriveWhyGood(row: FloraCohortRow): string {
  const parts: string[] = [];

  if (row.pricesTheyPay) {
    parts.push(row.pricesTheyPay);
  }

  if (row.productsInterest && row.productsInterest !== row.pricesTheyPay) {
    // Trim to keep the sentence concise if it's long
    const prod =
      row.productsInterest.length > 80
        ? row.productsInterest.slice(0, 77) + '...'
        : row.productsInterest;
    parts.push(prod);
  }

  if (parts.length > 0) {
    return parts.join(' — ');
  }

  // Honest fallback when signal is thin
  if (row.floraScore != null) {
    return `Score FLORA ${row.floraScore} — sin datos de volumen o precio en las notas de JJ.`;
  }
  return 'Sin datos de volumen o precio en las notas de JJ.';
}

// What to put in the sample box: box type + products interest (concise).
// Honest and short — no invented contents.
export function deriveBoxProposal(row: FloraCohortRow): string {
  const boxType = parseBoxType(row.reasoning, row.boxPreference);

  if (boxType && row.productsInterest) {
    return `Caja ${boxType}: ${row.productsInterest}`;
  }
  if (boxType) {
    return `Caja ${boxType}`;
  }
  if (row.productsInterest) {
    return `Productos de interes: ${row.productsInterest}`;
  }
  return 'Tipo de caja sin definir en las notas — confirmar con JJ.';
}

// The win hypothesis this sample box TESTS, derived from real purchase-signal.
// Labeled as hypothesis — not a guaranteed outcome.
export function deriveHypothesis(row: FloraCohortRow): string {
  const boxType = parseBoxType(row.reasoning, row.boxPreference);

  if (row.pricesTheyPay) {
    const boxLabel = boxType ? ` (${boxType})` : '';
    return `Hipotesis: si la calidad de la muestra${boxLabel} supera lo que recibe hoy (${row.pricesTheyPay}), abre conversacion de standing order.`;
  }

  if (row.productsInterest) {
    const boxLabel = boxType ? ` de ${boxType}` : '';
    return `Hipotesis: la muestra${boxLabel} demuestra calidad en ${row.productsInterest} y genera interes de compra.`;
  }

  return `Hipotesis: la muestra genera interes suficiente para una conversacion de compra (poco senalamiento de volumen o precio en notas).`;
}

// Job's own send/hold/skip recommendation, INDEPENDENT of JJ's score.
// 'send'  = floraScore >= 75 (strong signal)
// 'hold'  = floraScore 67-74 OR decision contains NURTUR (nurturing stage)
// 'skip'  = everything else
// Reason is a single short clause — never restate the full rationale here.
export function deriveJobRecommendation(row: FloraCohortRow): {
  verdict: 'send' | 'hold' | 'skip';
  reason: string;
} {
  const score = row.floraScore ?? 0;
  const decisionStr = (row.decision ?? '').toUpperCase();

  if (decisionStr.includes('NURTUR')) {
    return { verdict: 'hold', reason: 'en etapa de nurturing segun JJ' };
  }
  if (score >= 75) {
    return { verdict: 'send', reason: `score ${score} — senales solidas` };
  }
  if (score >= 67) {
    return { verdict: 'hold', reason: `score ${score} — senal moderada, revisar` };
  }
  return { verdict: 'skip', reason: `score ${score} — por debajo del umbral` };
}
