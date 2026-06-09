// Pure FedEx box-cost estimator (dim weight, chargeable kg, per-unit freight). No DB.
// v1 | 2026-06-09 | Job_PM (CPO)

import type { FedexEstimate } from './types';

export const DIM_DIVISOR = 6000; // mirror pricing_constants fedex dim divisor (cm^3/kg)
export const RATE_PER_KG = 6.5; // mirror pricing_constants fedex USD/chargeable-kg

export function estimateBoxCost(i: {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  realKg?: number;
  capacity: number;
}): FedexEstimate {
  const dimKg = (i.lengthCm * i.widthCm * i.heightCm) / DIM_DIVISOR;
  const chargeableKg = Math.max(i.realKg || 0, dimKg);
  const boxFreight = chargeableKg * RATE_PER_KG;
  const costPerUnit = i.capacity > 0 ? boxFreight / i.capacity : 0;
  return { dimKg, chargeableKg, boxFreight, costPerUnit };
}
