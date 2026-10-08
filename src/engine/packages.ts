// Package generator: request → validated nights → stays → transport plans →
// itinerary → exact price, for Budget / Premium / Luxury.
import type {
  Activity,
  CabRate,
  Database,
  LegPlan,
  LineItem,
  PackageOption,
  QuoteResult,
  StayPlan,
  Tier,
  TripRequest,
} from "./types";
import { MEALS_IN_PLAN, TIERS } from "./types";
import { chooseStay } from "./hotel";
import { contingencyLine, computePrice, sumCost } from "./pricing";
import { chooseVehicle, findDistance, planPublicLeg, type LegRequest } from "./transport";
import { scheduleItinerary, type ScheduleResult } from "./itinerary";
import { addDays, daysBetween, inr, isValidIsoDate, plural, toHHMM, toMins } from "./util";

export const TIER_LABEL: Record<Tier, string> = { budget: "Budget", premium: "Premium", luxury: "Luxury" };
const MEAL_PLAN_LABEL = { EP: "Room only", CP: "Breakfast", MAP: "Breakfast & dinner", AP: "All meals" } as const;

export function validateRequest(req: TripRequest): string[] {
  const errors: string[] = [];
  if (!req.origin.trim()) errors.push("Starting city is required.");
  const dests = req.destinations.filter((d) => d.city.trim());
  if (!dests.length) errors.push("Add at least one destination.");
  if (!Number.isInteger(req.members) || req.members < 1) errors.push("Members must be at least 1.");
  if (!isValidIsoDate(req.startDate) || !isValidIsoDate(req.endDate)) {
    errors.push("Valid start and end dates are required.");
    return errors;
  }
  const total = daysBetween(req.startDate, req.endDate);
  if (total < 1) errors.push("End date must be after start date.");
  else if (dests.length && total < dests.length) errors.push(`${plural(total, "night")} is too short for ${plural(dests.length, "destination")}.`);
  if (dests.some((d) => d.nights < 0 || !Number.isInteger(d.nights))) errors.push("Nights must be whole numbers.");
  return errors;
}

/** Fixed nights stay as entered; the remaining nights are split across "auto" (0) destinations, extra nights to the earlier ones. */
export function distributeNights(req: TripRequest): { nights: number[]; error?: string } {
  const dests = req.destinations.filter((d) => d.city.trim());
  const total = daysBetween(req.startDate, req.endDate);
  const fixed = dests.reduce((s, d) => s + (d.nights > 0 ? d.nights : 0), 0);
  const autoCount = dests.filter((d) => d.nights <= 0).length;
  const remaining = total - fixed;
  if (autoCount === 0) {
    return remaining === 0
      ? { nights: dests.map((d) => d.nights) }
      : { nights: [], error: `Destination nights add up to ${fixed}, but the dates give ${total} nights.` };
  }
  if (remaining < autoCount) return { nights: [], error: `Not enough nights left for every destination (${remaining} for ${autoCount}).` };
  const base = Math.floor(remaining / autoCount);
  let extra = remaining - base * autoCount;
  return {
    nights: dests.map((d) => {
      if (d.nights > 0) return d.nights;
      const n = base + (extra > 0 ? 1 : 0);
      extra--;
      return n;
    }),
  };
}

function roadLeg(db: Database, req: LegRequest, cab: CabRate, count: number): LegPlan | undefined {
  const dist = findDistance(db.distances, req.from, req.to);
  if (!dist) return undefined;
  const departs = req.isLast ? "10:00" : db.settings.cabStartTime;
  const arrives = toMins(departs) + Math.round(dist.driveHours * 60) + 60;
  return {
    from: req.from,
    to: req.to,
    date: req.date,
    mode: "cab",
    departs,
    arrives: toHHMM(arrives),
    dayOffset: arrives >= 1440 ? 1 : 0,
    description: `Private ${cab.ac ? "AC " : ""}${cab.vehicle}${count > 1 ? ` × ${count}` : ""} (${dist.km} km, ~${dist.driveHours} hrs)`,
    km: dist.km,
  };
}

interface TransportPlan {
  kind: "public" | "private-cab";
  legs: LegPlan[];
  schedule: ScheduleResult;
  lines: LineItem[];
  cab?: { vehicle: CabRate; count: number };
}

function cabDays(schedule: ScheduleResult): { city: string; date: string }[] {
  const seen = new Map<string, { city: string; date: string }>();
  for (const s of schedule.scheduled) {
    if (s.activity.needsCab) seen.set(`${s.city}|${s.date}`, { city: s.city, date: s.date });
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function publicPlan(db: Database, req: TripRequest, tier: Tier, legReqs: LegRequest[], stays: StayPlan[]): TransportPlan | undefined {
  const legs: LegPlan[] = [];
  const lines: LineItem[] = [];
  for (const lr of legReqs) {
    const res = planPublicLeg(db, lr, req.members, tier, req.acRequired);
    if (!res) return undefined;
    legs.push(res.leg);
    lines.push(...res.lines);
  }
  const schedule = scheduleItinerary({
    startDate: req.startDate,
    origin: req.origin,
    stays,
    legs,
    activities: db.activities,
    tier,
    wantedMeals: req.meals,
    privateCab: false,
  });

  // Pickup/drop at both ends of every train or bus journey.
  const transfer = chooseVehicle(db.cabs, req.members, tier, req.acRequired, (c) => c.transferRate);
  const publicLegs = legs.filter((l) => l.mode !== "cab");
  if (transfer && publicLegs.length) {
    const n = publicLegs.length * 2;
    lines.push({
      category: "Transport",
      label: `Station pickup & drop transfers (${transfer.cab.vehicle})`,
      formula: `${inr(transfer.cab.transferRate)} × ${plural(n, "transfer")} × ${plural(transfer.count, "vehicle")}`,
      cost: transfer.cab.transferRate * n * transfer.count,
      rack: transfer.cab.transferRate * n * transfer.count,
    });
  }

  // Local sightseeing cab on each day that has activities needing a vehicle.
  const days = cabDays(schedule);
  if (days.length) {
    const local = chooseVehicle(db.cabs, req.members, tier, req.acRequired, (c) => c.localDayRate);
    if (local) {
      lines.push({
        category: "Transport",
        label: `Local sightseeing cab (${local.cab.vehicle})`,
        formula: `${inr(local.cab.localDayRate)} × ${plural(days.length, "day")} × ${plural(local.count, "vehicle")} (8 hr / 80 km)`,
        cost: local.cab.localDayRate * days.length * local.count,
        rack: local.cab.localDayRate * days.length * local.count,
      });
    }
  }
  return { kind: "public", legs, schedule, lines };
}

function privateCabPlan(db: Database, req: TripRequest, tier: Tier, legReqs: LegRequest[], stays: StayPlan[], totalDays: number): TransportPlan | undefined {
  const legKm = legReqs.map((lr) => findDistance(db.distances, lr.from, lr.to)?.km);
  if (legKm.some((k) => k === undefined)) return undefined;
  const driveKm = legKm.reduce<number>((s, k) => s + (k ?? 0), 0);
  const s = db.settings;

  // Vehicle choice needs the km, and the km depends on sightseeing days. Schedule once
  // with a placeholder to count cab days (scheduling doesn't depend on the vehicle).
  const probeCab = db.cabs[0];
  if (!probeCab) return undefined;
  const probeLegs = legReqs.map((lr) => roadLeg(db, lr, probeCab, 1)!);
  const probe = scheduleItinerary({
    startDate: req.startDate,
    origin: req.origin,
    stays,
    legs: probeLegs,
    activities: db.activities,
    tier,
    wantedMeals: req.meals,
    privateCab: true,
  });
  const localDays = cabDays(probe).length;
  const totalKm = driveKm + s.localKmPerCityDay * localDays;

  const fleet = chooseVehicle(db.cabs, req.members, tier, req.acRequired, (c) =>
    Math.max(totalKm, c.minKmPerDay * totalDays) * c.perKm + (c.driverAllowancePerDay + c.tollParkingPerDay) * totalDays,
  );
  if (!fleet) return undefined;
  const { cab, count } = fleet;
  const legs = legReqs.map((lr) => roadLeg(db, lr, cab, count)!);
  const schedule = scheduleItinerary({
    startDate: req.startDate,
    origin: req.origin,
    stays,
    legs,
    activities: db.activities,
    tier,
    wantedMeals: req.meals,
    privateCab: true,
  });
  const chargeKm = Math.max(totalKm, cab.minKmPerDay * totalDays);
  const lines: LineItem[] = [
    {
      category: "Transport",
      label: `Private ${cab.vehicle} for the full trip`,
      formula: `(max(${totalKm} km, ${cab.minKmPerDay} × ${totalDays} days) = ${chargeKm} km × ${inr(cab.perKm)} + (driver ${inr(cab.driverAllowancePerDay)} + toll/parking ${inr(cab.tollParkingPerDay)}) × ${totalDays} days) × ${plural(count, "vehicle")}`,
      cost: fleet.total,
      rack: fleet.total,
    },
  ];
  return { kind: "private-cab", legs, schedule, lines, cab: { vehicle: cab, count } };
}

function activityLines(scheduled: ScheduleResult["scheduled"], members: number): LineItem[] {
  return scheduled.map(({ activity: a }: { activity: Activity }) => {
    const units = a.pricing === "per-person" ? members : Math.ceil(members / Math.max(1, a.groupSize));
    const unitLabel = a.pricing === "per-person" ? plural(units, "person", "people") : `${plural(units, "group")} (up to ${a.groupSize})`;
    return {
      category: "Activities" as const,
      label: `${a.name}, ${a.city}`,
      formula: `${inr(a.b2b)} × ${unitLabel}`,
      cost: a.b2b * units,
      rack: a.b2c * units,
    };
  });
}

function buildOption(db: Database, req: TripRequest, tier: Tier, cities: string[], nights: number[]): PackageOption | string {
  const warnings: string[] = [];
  const stays: StayPlan[] = [];
  const stayLines: LineItem[] = [];
  let cursor = req.startDate;

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const { choices, warning } = chooseStay(db.properties, city, tier, req, cursor, nights[i], db.settings.tiers);
    if (!choices.length) return `No active property${req.acRequired ? " with AC rooms" : ""} in ${city} can host ${plural(req.members, "guest")}.`;
    if (warning) warnings.push(warning);
    const pick = choices[0];
    const checkOut = addDays(cursor, nights[i]);
    if (pick.property.rateValidTill && pick.property.rateValidTill < checkOut) {
      warnings.push(`Rates for ${pick.property.name} were valid till ${pick.property.rateValidTill}. Re-confirm before sending.`);
    }
    stays.push({
      city,
      checkInDate: cursor,
      checkOutDate: checkOut,
      nights: nights[i],
      property: pick.property,
      roomType: pick.room,
      rooms: pick.price.rooms,
      extraBeds: pick.price.extraBeds,
      mealPlan: pick.room.mealPlan,
      alternatives: choices.slice(1, 4).map((c) => ({ property: c.property, roomType: c.room, cost: c.price.total })),
    });
    stayLines.push(...pick.price.lines);
    cursor = checkOut;
  }

  const route = [req.origin, ...cities, req.origin];
  const legReqs: LegRequest[] = route.slice(0, -1).map((from, i) => ({
    from,
    to: route[i + 1],
    date: i === 0 ? req.startDate : stays[i - 1].checkOutDate,
    isFirst: i === 0,
    isLast: i === route.length - 2,
  }));
  const totalNights = nights.reduce((a, b) => a + b, 0);

  const pub = publicPlan(db, req, tier, legReqs, stays);
  const cab = privateCabPlan(db, req, tier, legReqs, stays, totalNights + 1);
  if (!pub && !cab) return `No train, bus or road route found for ${legReqs.map((l) => `${l.from} → ${l.to}`).join(", ")}. Add it in Admin → Transport.`;

  const pref = db.settings.tiers[tier].transport;
  let plan: TransportPlan;
  if (!pub) plan = cab!;
  else if (!cab) plan = pub;
  else if (pref === "prefer-public") plan = pub;
  else if (pref === "prefer-cab") plan = cab;
  else plan = sumCost(pub.lines) + sumCost(activityLines(pub.schedule.scheduled, req.members)) <= sumCost(cab.lines) + sumCost(activityLines(cab.schedule.scheduled, req.members)) ? pub : cab;

  for (const a of plan.schedule.unscheduled) warnings.push(`Not enough time for "${a.name}" (${a.city}); left out.`);

  const lines = [...stayLines, ...plan.lines, ...activityLines(plan.schedule.scheduled, req.members)];
  const other = contingencyLine(sumCost(lines), db.settings.contingencyPercent);
  if (other) lines.push(other);
  const price = computePrice(lines, req.members, tier, db.settings);

  const budgetStatus = req.budget > 0 ? (price.finalPrice <= req.budget ? "within" : "over") : "no-budget";
  const totalDays = plan.schedule.days.length;

  const inclusions = [
    ...stays.map(
      (s) =>
        `${plural(s.nights, "night")} at ${s.property.name}, ${s.city} (${s.property.stars}★ ${s.property.kind}) — ${plural(s.rooms, "room")} ${s.roomType.name}${s.extraBeds ? ` + ${plural(s.extraBeds, "extra bed")}` : ""}, ${MEAL_PLAN_LABEL[s.mealPlan]}`,
    ),
    ...(plan.kind === "private-cab" && plan.cab
      ? [`Private ${plan.cab.vehicle.ac ? "AC " : ""}${plan.cab.vehicle.vehicle}${plan.cab.count > 1 ? ` × ${plan.cab.count}` : ""} with driver for all transfers & sightseeing`]
      : [
          ...plan.legs.map((l) => `${l.from} → ${l.to}: ${l.description}`),
          "Station pickup & drop, and local sightseeing by cab",
        ]),
    ...plan.schedule.scheduled.map((s) => `${s.activity.name} (${s.city})`),
    ...(["breakfast", "lunch", "dinner"] as const)
      .filter((m) => req.meals[m] || stays.every((s) => MEALS_IN_PLAN[s.mealPlan].includes(m)))
      .map((m) => `Daily ${m}`),
    `GST (${db.settings.gstPercent}%)`,
  ];
  const exclusions = [
    "Anything not mentioned in inclusions",
    "Personal expenses: shopping, laundry, phone calls, tips",
    "Camera fees at monuments, unless mentioned",
    "Costs from flight/train delays, weather, road blocks or strikes",
    "Early check-in / late checkout unless confirmed by the hotel",
  ];

  return {
    id: `${tier}-${Date.now().toString(36)}`,
    tier,
    title: `OPALSTAYS – ${totalNights}N/${totalDays}D ${cities.join(" + ")} ${TIER_LABEL[tier]} Package`,
    totalNights,
    totalDays,
    stays,
    legs: plan.legs,
    transportPlan: plan.kind,
    cab: plan.cab,
    itinerary: plan.schedule.days,
    lineItems: lines,
    price,
    budgetStatus,
    budgetDiff: req.budget > 0 ? req.budget - price.finalPrice : 0,
    warnings,
    inclusions,
    exclusions,
  };
}

export function generateQuote(db: Database, req: TripRequest, tiers: Tier[] = TIERS): QuoteResult {
  const result: QuoteResult = { request: req, createdAt: new Date().toISOString(), options: [], errors: [] };
  result.errors.push(...validateRequest(req));
  if (result.errors.length) return result;

  const { nights, error } = distributeNights(req);
  if (error) {
    result.errors.push(error);
    return result;
  }
  const cities = req.destinations.filter((d) => d.city.trim()).map((d) => d.city.trim());

  for (const tier of tiers) {
    const opt = buildOption(db, req, tier, cities, nights);
    if (typeof opt === "string") result.errors.push(`${TIER_LABEL[tier]}: ${opt}`);
    else result.options.push(opt);
  }

  // Best fit: the highest tier inside budget; otherwise the customer's preference.
  const within = result.options.filter((o) => o.budgetStatus === "within");
  result.recommendedTier =
    req.budget > 0 && within.length
      ? within[within.length - 1].tier
      : result.options.find((o) => o.tier === req.preferredTier)?.tier ?? result.options[0]?.tier;
  return result;
}
