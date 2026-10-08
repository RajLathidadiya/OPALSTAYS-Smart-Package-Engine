import { describe, expect, it } from "vitest";
import { seedDatabase, defaultSettings } from "../data/seed";
import { nightlyRate, priceStay, roomConfigs } from "./hotel";
import { computePrice, roundPrice } from "./pricing";
import { distributeNights, generateQuote, validateRequest } from "./packages";
import type { LineItem, RoomType, TripRequest } from "./types";
import { inSeason } from "./util";

const room: RoomType = {
  id: "r",
  name: "Standard",
  ac: true,
  baseOccupancy: 2,
  maxOccupancy: 3,
  b2b: 2500,
  b2c: 3200,
  extraBedB2b: 800,
  extraBedB2c: 1000,
  mealPlan: "CP",
  seasons: [{ id: "s", name: "Peak", from: "10-25", to: "11-05", b2b: 3400, b2c: 4300 }],
};

const request: TripRequest = {
  customerName: "Test",
  origin: "Ahmedabad",
  destinations: [
    { city: "Udaipur", nights: 0 },
    { city: "Jaisalmer", nights: 0 },
  ],
  members: 4,
  startDate: "2026-10-15",
  endDate: "2026-10-18",
  budget: 35000,
  acRequired: true,
  meals: { breakfast: true, lunch: false, dinner: false },
  preferredTier: "premium",
  notes: "",
};

describe("hotel pricing", () => {
  it("₹2,500 × 2 rooms × 3 nights = ₹15,000 exactly", () => {
    const tier = defaultSettings.tiers.budget;
    const p = priceStay({ name: "H", city: "X" } as never, room, { rooms: 2, extraBeds: 0 }, "2026-10-01", 3, 4, request.meals, tier);
    expect(p.roomCost).toBe(15000);
    expect(p.foodCost).toBe(0); // breakfast is in the CP plan
    expect(p.lines[0].formula).toBe("₹2,500 × 2 rooms × 3 nights (Regular)");
  });

  it("splits nights across seasons", () => {
    const tier = defaultSettings.tiers.budget;
    // 23, 24 regular; 25 peak
    const p = priceStay({ name: "H", city: "X" } as never, room, { rooms: 1, extraBeds: 0 }, "2026-10-23", 3, 2, request.meals, tier);
    expect(p.roomCost).toBe(2500 * 2 + 3400);
    expect(p.lines).toHaveLength(2);
  });

  it("charges food for meals the plan doesn't include", () => {
    const tier = defaultSettings.tiers.budget;
    const meals = { breakfast: true, lunch: false, dinner: true };
    const p = priceStay({ name: "H", city: "X" } as never, room, { rooms: 2, extraBeds: 0 }, "2026-10-01", 2, 4, meals, tier);
    expect(p.foodCost).toBe(300 * 4 * 2);
  });

  it("season windows wrap over new year", () => {
    expect(inSeason("2026-12-31", "12-20", "01-05")).toBe(true);
    expect(inSeason("2027-01-03", "12-20", "01-05")).toBe(true);
    expect(inSeason("2027-01-06", "12-20", "01-05")).toBe(false);
    expect(nightlyRate(room, "2026-10-30").b2b).toBe(3400);
  });

  it("room configurations for 5 guests", () => {
    expect(roomConfigs(room, 5)).toEqual([
      { rooms: 2, extraBeds: 1 },
      { rooms: 3, extraBeds: 0 },
    ]);
  });
});

describe("price summary", () => {
  const lines: LineItem[] = [{ category: "Hotel", label: "x", formula: "", cost: 31000, rack: 36000 }];

  it("rounds to x999", () => {
    expect(roundPrice(36140, "x999")).toBe(36999);
    expect(roundPrice(36999, "x999")).toBe(36999);
    expect(roundPrice(36140, "x99")).toBe(36199);
    expect(roundPrice(36140, "x00")).toBe(36200);
  });

  it("final = cost + profit + GST + commission, exactly", () => {
    for (const gstMode of ["on-total", "on-margin"] as const) {
      const settings = { ...defaultSettings, gstMode, agentCommissionPercent: 2 };
      const p = computePrice(lines, 4, "budget", settings);
      expect(p.cost + p.profit + p.gst + p.agentCommission).toBe(p.finalPrice);
      expect(p.finalPrice % 1000).toBe(999);
      expect(p.profit).toBeGreaterThan(0);
    }
  });

  it("respects minimum profit per person", () => {
    const small: LineItem[] = [{ category: "Hotel", label: "x", formula: "", cost: 1000, rack: 1000 }];
    const p = computePrice(small, 4, "budget", { ...defaultSettings, rounding: "none" });
    expect(p.markup).toBe(800 * 4);
  });
});

describe("package generator", () => {
  it("validates input", () => {
    expect(validateRequest({ ...request, endDate: "2026-10-15" })).toContain("End date must be after start date.");
    expect(validateRequest({ ...request, members: 0 })).toContain("Members must be at least 1.");
  });

  it("distributes nights, extra nights to earlier stops", () => {
    expect(distributeNights(request).nights).toEqual([2, 1]);
    expect(distributeNights({ ...request, destinations: [{ city: "Udaipur", nights: 1 }, { city: "Jaisalmer", nights: 0 }] }).nights).toEqual([1, 2]);
    expect(distributeNights({ ...request, destinations: [{ city: "Udaipur", nights: 1 }, { city: "Jaisalmer", nights: 1 }] }).error).toBeDefined();
  });

  it("builds Budget / Premium / Luxury options for the sample trip", () => {
    const q = generateQuote(seedDatabase(), request);
    expect(q.errors).toEqual([]);
    expect(q.options.map((o) => o.tier)).toEqual(["budget", "premium", "luxury"]);
    for (const o of q.options) {
      const sum = o.lineItems.reduce((s, l) => s + l.cost, 0);
      expect(o.price.cost).toBe(sum);
      expect(o.price.cost + o.price.profit + o.price.gst + o.price.agentCommission).toBe(o.price.finalPrice);
      expect(o.stays.map((s) => s.city)).toEqual(["Udaipur", "Jaisalmer"]);
      expect(o.itinerary[0].entries.length).toBeGreaterThan(0);
    }
    expect(q.options[0].price.finalPrice).toBeLessThan(q.options[2].price.finalPrice);
  });

  it("is deterministic", () => {
    const a = generateQuote(seedDatabase(), request);
    const b = generateQuote(seedDatabase(), request);
    expect(a.options.map((o) => o.price)).toEqual(b.options.map((o) => o.price));
  });
});
