// Hotel pricing: season-wise nightly rates, room configuration, exact stay cost.
import type { LineItem, Meal, Property, RoomType, Tier, TierSettings, TripRequest } from "./types";
import { MEALS_IN_PLAN, TIERS } from "./types";
import { addDays, inSeason, inr, plural, sameCity } from "./util";

export interface NightRate {
  date: string;
  season: string;
  b2b: number;
  b2c: number;
  extraBedB2b: number;
  extraBedB2c: number;
}

/** Rate for one night. The first matching season wins; otherwise the room's base rate. */
export function nightlyRate(room: RoomType, date: string): NightRate {
  const season = room.seasons.find((s) => inSeason(date, s.from, s.to));
  if (!season) {
    return {
      date,
      season: "Regular",
      b2b: room.b2b,
      b2c: room.b2c,
      extraBedB2b: room.extraBedB2b,
      extraBedB2c: room.extraBedB2c,
    };
  }
  return {
    date,
    season: season.name,
    b2b: season.b2b,
    b2c: season.b2c,
    extraBedB2b: season.extraBedB2b ?? room.extraBedB2b,
    extraBedB2c: season.extraBedB2c ?? room.extraBedB2c,
  };
}

export interface RoomConfig {
  rooms: number;
  extraBeds: number;
}

/** All valid ways to put `members` guests into this room type (fewest rooms first). */
export function roomConfigs(room: RoomType, members: number): RoomConfig[] {
  if (members < 1 || room.maxOccupancy < 1 || room.baseOccupancy < 1) return [];
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
  roomCost: number;
  roomRack: number;
  foodCost: number;
  total: number; // room + food (used for choosing)
  lines: LineItem[];
}

/** Group consecutive nights with identical rates so formulas read "₹2,500 × 2 rooms × 3 nights". */
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

  for (const seg of rateSegments(rates)) {
    const cost = seg.rate.b2b * config.rooms * seg.nights;
    const rack = seg.rate.b2c * config.rooms * seg.nights;
    roomCost += cost;
    roomRack += rack;
    lines.push({
      category: "Hotel",
      label: `${property.name}, ${property.city}: ${room.name}`,
      formula: `${inr(seg.rate.b2b)} × ${plural(config.rooms, "room")} × ${plural(seg.nights, "night")} (${seg.rate.season})`,
      cost,
      rack,
    });
    if (config.extraBeds > 0) {
      const ebCost = seg.rate.extraBedB2b * config.extraBeds * seg.nights;
      const ebRack = seg.rate.extraBedB2c * config.extraBeds * seg.nights;
      roomCost += ebCost;
      roomRack += ebRack;
      lines.push({
        category: "Hotel",
        label: `${property.name}: extra bed`,
        formula: `${inr(seg.rate.extraBedB2b)} × ${plural(config.extraBeds, "extra bed")} × ${plural(seg.nights, "night")} (${seg.rate.season})`,
        cost: ebCost,
        rack: ebRack,
      });
    }
  }

  // One breakfast/lunch/dinner per night of stay, for meals the hotel plan does not include.
  let foodCost = 0;
  for (const meal of mealsToBuy(room, wantedMeals)) {
    const rate = tier.foodPerMeal[meal];
    const cost = rate * members * nights;
    foodCost += cost;
    lines.push({
      category: "Food",
      label: `${meal[0].toUpperCase()}${meal.slice(1)} in ${property.city}`,
      formula: `${inr(rate)} × ${plural(members, "person", "people")} × ${plural(nights, meal)}`,
      cost,
      rack: cost,
    });
  }

  return {
    rooms: config.rooms,
    extraBeds: config.extraBeds,
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
      for (const config of roomConfigs(room, req.members)) {
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
