// Hotel pricing: season-wise nightly rates, room configuration, exact stay cost.
import type { LineItem, Meal, Property, RoomType, Tier, TierSettings, TripRequest } from "./types";
import { MEALS_IN_PLAN, TIERS } from "./types";
import { addDays, inSeason, inr, plural, sameCity, weekday } from "./util";

export interface NightRate {
  date: string;
  season: string;
  b2b: number;
  b2c: number;
  extraBedB2b: number;
  extraBedB2c: number;
  /** Per-person rooms: total price of one room for k guests (k = smallest listed size that fits). */
  occupancy: (guests: number) => { b2b: number; b2c: number; size: number } | undefined;
}

/** Regular rate rows plus, if a season is active, that season's rows on top. */
function occupancyTable(room: RoomType, season?: string) {
  const table = new Map<number, { b2b: number; b2c: number }>();
  for (const r of room.occupancyRates ?? []) if (!r.season) table.set(r.guests, r);
  if (season) for (const r of room.occupancyRates ?? []) if (r.season === season) table.set(r.guests, r);
  const sizes = [...table.keys()].filter((g) => g > 0).sort((a, b) => a - b);
  return (guests: number) => {
    const size = sizes.find((g) => g >= guests);
    if (size === undefined) return undefined;
    const r = table.get(size)!;
    return { b2b: r.b2b, b2c: r.b2c, size };
  };
}

export function isPerPerson(room: RoomType): boolean {
  return room.pricing === "per-person";
}

/** Rate for one night. The first matching season wins; otherwise the room's base rate. */
export function nightlyRate(room: RoomType, date: string): NightRate {
  const day = weekday(date);
  const season = room.seasons.find((s) => inSeason(date, s.from, s.to) && (!s.days?.length || s.days.includes(day)));
  if (!season) {
    return {
      date,
      season: "Regular",
      b2b: room.b2b,
      b2c: room.b2c,
      extraBedB2b: room.extraBedB2b,
      extraBedB2c: room.extraBedB2c,
      occupancy: occupancyTable(room),
    };
  }
  return {
    date,
    season: season.name,
    b2b: season.b2b,
    b2c: season.b2c,
    extraBedB2b: season.extraBedB2b ?? room.extraBedB2b,
    extraBedB2c: season.extraBedB2c ?? room.extraBedB2c,
    occupancy: occupancyTable(room, season.name),
  };
}

export interface RoomConfig {
  rooms: number;
  extraBeds: number;
  sharing?: number[]; // per-person rooms: guests in each room
}

/** Largest group one per-person room can take. */
function maxSharing(room: RoomType): number {
  return Math.max(0, ...(room.occupancyRates ?? []).map((r) => r.guests));
}

/**
 * Cheapest split of the group into per-person rooms over the given nights
 * (e.g. 6 guests → [4, 2] or [6]). Ties go to fewer rooms.
 */
function bestSharing(room: RoomType, members: number, rates: NightRate[]): number[] | undefined {
  const max = maxSharing(room);
  if (max < 1) return undefined;
  const roomCost = (k: number) => {
    let total = 0;
    for (const r of rates) {
      const o = r.occupancy(k);
      if (!o) return Infinity;
      total += o.b2b;
    }
    return total;
  };
  const best: { cost: number; rooms: number[] }[] = [{ cost: 0, rooms: [] }];
  for (let n = 1; n <= members; n++) {
    let pick: { cost: number; rooms: number[] } = { cost: Infinity, rooms: [] };
    for (let k = 1; k <= Math.min(max, n); k++) {
      const prev = best[n - k];
      const cost = prev.cost + roomCost(k);
      if (cost < pick.cost || (cost === pick.cost && prev.rooms.length + 1 < pick.rooms.length)) {
        pick = { cost, rooms: [...prev.rooms, k] };
      }
    }
    best.push(pick);
  }
  const result = best[members];
  return Number.isFinite(result.cost) ? result.rooms.sort((a, b) => b - a) : undefined;
}

/** All valid ways to put `members` guests into this room type (fewest rooms first). */
export function roomConfigs(room: RoomType, members: number, checkIn?: string, nights = 1): RoomConfig[] {
  if (members < 1) return [];
  if (isPerPerson(room)) {
    const rates = Array.from({ length: Math.max(1, nights) }, (_, i) => nightlyRate(room, addDays(checkIn ?? "2026-01-15", i)));
    const sharing = bestSharing(room, members, rates);
    return sharing ? [{ rooms: sharing.length, extraBeds: 0, sharing }] : [];
  }
  if (room.maxOccupancy < 1 || room.baseOccupancy < 1) return [];
  const minRooms = Math.ceil(members / room.maxOccupancy);
  const maxRooms = Math.ceil(members / room.baseOccupancy);
  const configs: RoomConfig[] = [];
  for (let rooms = minRooms; rooms <= maxRooms; rooms++) {
    configs.push({ rooms, extraBeds: Math.max(0, members - rooms * room.baseOccupancy) });
  }
  return configs;
}

export interface StayPrice {
  rooms: number;
  extraBeds: number;
  sharing?: number[];
  roomCost: number;
  roomRack: number;
  foodCost: number;
  total: number; // room + hotel GST + food (used for choosing)
  lines: LineItem[];
}

/** Group consecutive nights with the same season so formulas read "₹2,500 × 2 rooms × 3 nights". */
function rateSegments(rates: NightRate[]) {
  const segments: { rate: NightRate; nights: number }[] = [];
  for (const r of rates) {
    const last = segments[segments.length - 1];
    if (last && last.rate.b2b === r.b2b && last.rate.extraBedB2b === r.extraBedB2b && last.rate.season === r.season) {
      last.nights++;
    } else {
      segments.push({ rate: r, nights: 1 });
    }
  }
  return segments;
}

/** Indian GST on hotel rooms: 5% up to ₹7,500 per room per night, 18% above. */
export function hotelGstRate(perRoomNight: number): number {
  return perRoomNight > 7500 ? 18 : 5;
}

/** Meals the customer wants that this room's meal plan does not cover. */
export function mealsToBuy(room: RoomType, wanted: Record<Meal, boolean>): Meal[] {
  const included = MEALS_IN_PLAN[room.mealPlan];
  return (Object.keys(wanted) as Meal[]).filter((m) => wanted[m] && !included.includes(m));
}

export function priceStay(
  property: Property,
  room: RoomType,
  config: RoomConfig,
  checkIn: string,
  nights: number,
  members: number,
  wantedMeals: Record<Meal, boolean>,
  tier: TierSettings,
): StayPrice {
  const rates = Array.from({ length: nights }, (_, i) => nightlyRate(room, addDays(checkIn, i)));
  const lines: LineItem[] = [];
  let roomCost = 0;
  let roomRack = 0;
  const gst = { cost: 0, rack: 0, slabs: new Set<number>() };
  const addGst = (cost: number, rack: number, perRoomNight: number) => {
    if (!property.hotelGst) return;
    const rate = hotelGstRate(perRoomNight);
    gst.slabs.add(rate);
    gst.cost += (cost * rate) / 100;
    gst.rack += (rack * rate) / 100;
  };
  const label = `${property.name}, ${property.city}: ${room.name}`;

  for (const seg of rateSegments(rates)) {
    const season = `${plural(seg.nights, "night")} (${seg.rate.season})`;
    if (config.sharing) {
      // Per-person pricing: one line per room size, e.g. "₹5,940 × 1 room (3 sharing) × 2 nights".
      const counts = new Map<number, number>();
      for (const k of config.sharing) counts.set(k, (counts.get(k) ?? 0) + 1);
      for (const [k, n] of counts) {
        const o = seg.rate.occupancy(k)!;
        const cost = o.b2b * n * seg.nights;
        const rack = o.b2c * n * seg.nights;
        roomCost += cost;
        roomRack += rack;
        addGst(cost, rack, o.b2b);
        lines.push({
          category: "Hotel",
          label,
          formula: `${inr(o.b2b)} × ${plural(n, "room")} (${k} sharing${o.size !== k ? `, charged as ${o.size}` : ""}) × ${season}`,
          cost,
          rack,
        });
      }
      continue;
    }
    const cost = seg.rate.b2b * config.rooms * seg.nights;
    const rack = seg.rate.b2c * config.rooms * seg.nights;
    roomCost += cost;
    roomRack += rack;
    addGst(cost, rack, seg.rate.b2b);
    lines.push({ category: "Hotel", label, formula: `${inr(seg.rate.b2b)} × ${plural(config.rooms, "room")} × ${season}`, cost, rack });
    if (config.extraBeds > 0) {
      const ebCost = seg.rate.extraBedB2b * config.extraBeds * seg.nights;
      const ebRack = seg.rate.extraBedB2c * config.extraBeds * seg.nights;
      roomCost += ebCost;
      roomRack += ebRack;
      addGst(ebCost, ebRack, seg.rate.b2b);
      lines.push({
        category: "Hotel",
        label: `${property.name}: extra bed`,
        formula: `${inr(seg.rate.extraBedB2b)} × ${plural(config.extraBeds, "extra bed")} × ${season}`,
        cost: ebCost,
        rack: ebRack,
      });
    }
  }

  const gstCost = Math.round(gst.cost);
  if (gstCost > 0) {
    roomCost += gstCost;
    roomRack += Math.round(gst.rack);
    lines.push({
      category: "Hotel",
      label: `${property.name}: hotel GST`,
      formula: `${[...gst.slabs].sort((a, b) => a - b).join("% / ")}% GST on room tariff`,
      cost: gstCost,
      rack: Math.round(gst.rack),
    });
  }

  // One breakfast/lunch/dinner per night of stay, for meals the hotel plan does not include.
  let foodCost = 0;
  for (const meal of mealsToBuy(room, wantedMeals)) {
    const own = property.mealRates?.[meal];
    const rate = own && own.b2b > 0 ? own.b2b : tier.foodPerMeal[meal];
    const rackRate = own && own.b2b > 0 ? own.b2c || own.b2b : rate;
    const cost = rate * members * nights;
    foodCost += cost;
    lines.push({
      category: "Food",
      label: `${meal[0].toUpperCase()}${meal.slice(1)} in ${property.city}`,
      formula: `${inr(rate)} × ${plural(members, "person", "people")} × ${plural(nights, meal)}${own && own.b2b > 0 ? " (hotel rate)" : ""}`,
      cost,
      rack: rackRate * members * nights,
    });
  }

  return {
    rooms: config.rooms,
    extraBeds: config.extraBeds,
    sharing: config.sharing,
    roomCost,
    roomRack,
    foodCost,
    total: roomCost + foodCost,
    lines,
  };
}

export interface StayChoice {
  property: Property;
  room: RoomType;
  price: StayPrice;
}

/** Cheapest valid (property, room type, room configuration) for one tier in one city. */
export function bestStaysForTier(
  properties: Property[],
  city: string,
  tierName: Tier,
  req: TripRequest,
  checkIn: string,
  nights: number,
  tier: TierSettings,
): StayChoice[] {
  const choices: StayChoice[] = [];
  for (const property of properties) {
    if (!property.active || property.tier !== tierName || !sameCity(property.city, city)) continue;
    let best: StayChoice | undefined;
    for (const room of property.roomTypes) {
      if (req.acRequired && !room.ac) continue;
      for (const config of roomConfigs(room, req.members, checkIn, nights)) {
        const price = priceStay(property, room, config, checkIn, nights, req.members, req.meals, tier);
        if (!best || price.total < best.price.total) best = { property, room, price };
      }
    }
    if (best) choices.push(best);
  }
  // Higher priority first when within 5% of each other; otherwise cheapest first.
  return choices.sort((a, b) => {
    const diff = a.price.total - b.price.total;
    const close = Math.abs(diff) <= 0.05 * Math.min(a.price.total, b.price.total);
    if (close && a.property.priority !== b.property.priority) return b.property.priority - a.property.priority;
    return diff;
  });
}

/**
 * Pick a stay for the requested tier. If the city has no property in that tier,
 * fall back to the nearest tier and return a warning.
 */
export function chooseStay(
  properties: Property[],
  city: string,
  tierName: Tier,
  req: TripRequest,
  checkIn: string,
  nights: number,
  tierSettings: Record<Tier, TierSettings>,
): { choices: StayChoice[]; usedTier: Tier; warning?: string } {
  const idx = TIERS.indexOf(tierName);
  const order = [idx, idx - 1, idx + 1, idx - 2, idx + 2].filter((i) => i >= 0 && i < TIERS.length);
  for (const i of order) {
    const t = TIERS[i];
    const choices = bestStaysForTier(properties, city, t, req, checkIn, nights, tierSettings[tierName]);
    if (choices.length) {
      return {
        choices,
        usedTier: t,
        warning: t === tierName ? undefined : `No ${tierName} property in ${city} fits; used a ${t} property instead.`,
      };
    }
  }
  return { choices: [], usedTier: tierName };
}
