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
  destinations: [{ city: "Sasan Gir", nights: 0 }],
  members: 4,
  startDate: "2026-11-20",
  endDate: "2026-11-23",
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
    const two = { ...request, destinations: [{ city: "Sasan Gir", nights: 0 }, { city: "Somnath", nights: 0 }] };
    expect(distributeNights(two).nights).toEqual([2, 1]);
    expect(distributeNights({ ...two, destinations: [{ city: "Sasan Gir", nights: 1 }, { city: "Somnath", nights: 0 }] }).nights).toEqual([1, 2]);
    expect(distributeNights({ ...two, destinations: [{ city: "Sasan Gir", nights: 1 }, { city: "Somnath", nights: 1 }] }).error).toBeDefined();
  });

  it("builds Budget / Premium / Luxury options for the sample trip", () => {
    const q = generateQuote(seedDatabase(), request);
    expect(q.errors).toEqual([]);
    expect(q.options.map((o) => o.tier)).toEqual(["budget", "premium", "luxury"]);
    for (const o of q.options) {
      const sum = o.lineItems.reduce((s, l) => s + l.cost, 0);
      expect(o.price.cost).toBe(sum);
      expect(o.price.cost + o.price.profit + o.price.gst + o.price.agentCommission).toBe(o.price.finalPrice);
      expect(o.stays.map((s) => s.city)).toEqual(["Sasan Gir"]);
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

describe("Sasan Gir rate sheet", () => {
  const db = seedDatabase();
  const prop = (id: string) => db.properties.find((p) => p.id === id)!;
  const tier = defaultSettings.tiers.budget;
  const noMeals = { breakfast: false, lunch: false, dinner: false };

  it("B2B is 10% below B2C on every rate", () => {
    for (const p of db.properties)
      for (const r of p.roomTypes) {
        expect(r.b2b).toBe(Math.round(r.b2c * 0.9));
        for (const o of r.occupancyRates ?? []) expect(o.b2b).toBe(Math.round(o.b2c * 0.9));
        for (const s of r.seasons) expect(s.b2b).toBe(Math.round(s.b2c * 0.9));
      }
  });

  it("Shree Van: 6 people off season share one room at ₹1,100/person (B2C)", () => {
    const room = prop("shreevan").roomTypes[0];
    const [config] = roomConfigs(room, 6, "2026-11-20", 2);
    expect(config.sharing).toEqual([6]);
    const p = priceStay(prop("shreevan"), room, config, "2026-11-20", 2, 6, noMeals, tier);
    expect(p.lines[0].rack).toBe(1100 * 6 * 2);
    expect(p.lines[0].cost).toBe(5940 * 2);
    // + 5% hotel GST on the B2B tariff
    expect(p.roomCost).toBe(5940 * 2 + Math.round(5940 * 2 * 0.05));
  });

  it("Shree Van: season nights use the season sharing rate", () => {
    const room = prop("shreevan").roomTypes[0];
    const [config] = roomConfigs(room, 2, "2026-12-24", 1);
    const p = priceStay(prop("shreevan"), room, config, "2026-12-24", 1, 2, noMeals, tier);
    expect(p.lines[0].rack).toBe(4950);
    expect(p.lines[0].formula).toContain("(Season)");
  });

  it("Aaranya: 8 people split into the cheapest rooms", () => {
    const room = prop("aaranya").roomTypes[0];
    const [config] = roomConfigs(room, 8, "2026-11-20", 1);
    expect(config.sharing!.reduce((a, b) => a + b, 0)).toBe(8);
    // 6+2 = 9900+6050 = 15950; 4+4 = 15840; 5+3 = 15400 (B2C) → cheapest is 5+3
    expect(config.sharing).toEqual([5, 3]);
  });

  it("Wild Calm: Friday and Saturday nights are weekend rates, 18% GST above ₹7,500", () => {
    const p = prop("wildcalm");
    const room = p.roomTypes.find((r) => r.name === "Calm Cub (CP)")!;
    // Thu 19, Fri 20, Sat 21 Nov 2026
    const price = priceStay(p, room, { rooms: 1, extraBeds: 0 }, "2026-11-19", 3, 2, noMeals, tier);
    const hotel = price.lines.filter((l) => l.category === "Hotel" && !l.label.includes("GST"));
    expect(hotel.map((l) => l.rack)).toEqual([7861, 8647 * 2]);
    const gst = price.lines.find((l) => l.label.includes("GST"))!;
    expect(gst.formula).toContain("5% / 18%");
  });

  it("Gokul: extra dinner uses the hotel's own rate", () => {
    const p = prop("gokul");
    const room = p.roomTypes.find((r) => r.id === "gokul-sharing")!;
    const price = priceStay(p, room, { rooms: 1, extraBeds: 0, sharing: [4] }, "2026-11-20", 1, 4, { breakfast: false, lunch: false, dinner: true }, tier);
    const dinner = price.lines.find((l) => l.category === "Food")!;
    expect(dinner.cost).toBe(248 * 4);
  });
});
