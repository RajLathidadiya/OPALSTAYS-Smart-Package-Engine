// Final price calculation: cost → markup → GST → rounding → profit.
// Pure, deterministic integer arithmetic. Never delegated to AI.
import type { LineItem, PriceSummary, Settings, Tier } from "./types";

export function roundPrice(value: number, mode: Settings["rounding"]): number {
  const v = Math.ceil(value);
  switch (mode) {
    case "x999":
      return Math.ceil((v + 1) / 1000) * 1000 - 1;
    case "x99":
      return Math.ceil((v + 1) / 100) * 100 - 1;
    case "x00":
      return Math.ceil(v / 100) * 100;
    default:
      return v;
  }
}

export function sumCost(lines: LineItem[]): number {
  return lines.reduce((s, l) => s + l.cost, 0);
}

export function sumRack(lines: LineItem[]): number {
  return lines.reduce((s, l) => s + l.rack, 0);
}

export function contingencyLine(baseCost: number, percent: number): LineItem | undefined {
  const cost = Math.round((baseCost * percent) / 100);
  if (cost <= 0) return undefined;
  return {
    category: "Other",
    label: "Contingency (tolls, tips, water, small extras)",
    formula: `${percent}% × base cost`,
    cost,
    rack: cost,
  };
}

/**
 * cost         = sum of line items (B2B)
 * markup       = max(cost × markup%, minProfitPerPerson × members)
 * final        = round(cost + markup + GST)   (GST on total or on margin)
 * gst          = recomputed from the rounded final so the invoice adds up exactly
 * commission   = preTax × agentCommission%
 * profit       = preTax − cost − commission
 */
export function computePrice(lines: LineItem[], members: number, tier: Tier, settings: Settings): PriceSummary {
  const cost = sumCost(lines);
  const rackValue = sumRack(lines);
  const t = settings.tiers[tier];
  const markup = Math.max(Math.round((cost * t.markupPercent) / 100), t.minProfitPerPerson * members);
  const g = settings.gstPercent / 100;

  let finalPrice: number;
  let preTax: number;
  let gst: number;
  let unrounded: number;

  if (settings.gstMode === "on-margin") {
    unrounded = Math.round(cost + markup * (1 + g));
    finalPrice = roundPrice(unrounded, settings.rounding);
    const margin = Math.round((finalPrice - cost) / (1 + g));
    preTax = cost + margin;
    gst = finalPrice - preTax;
  } else {
    unrounded = Math.round((cost + markup) * (1 + g));
    finalPrice = roundPrice(unrounded, settings.rounding);
    preTax = Math.round(finalPrice / (1 + g));
    gst = finalPrice - preTax;
  }

  const agentCommission = Math.round((preTax * settings.agentCommissionPercent) / 100);
  const profit = preTax - cost - agentCommission;

  return {
    cost,
    markup,
    roundingAdjustment: finalPrice - unrounded,
    preTax,
    gst,
    agentCommission,
    finalPrice,
    perPerson: Math.round(finalPrice / Math.max(1, members)),
    profit,
    marginPercent: finalPrice > 0 ? Math.round((profit / finalPrice) * 1000) / 10 : 0,
    rackValue,
  };
}
