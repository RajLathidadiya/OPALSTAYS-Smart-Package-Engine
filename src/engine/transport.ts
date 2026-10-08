// Transport: choosing trains/buses/cabs for each leg and pricing them exactly.
import type {
  BusRoute,
  CabRate,
  Database,
  Distance,
  LegPlan,
  LineItem,
  Tier,
  TierSettings,
  TrainClass,
  TrainRoute,
} from "./types";
import { AC_TRAIN_CLASSES } from "./types";
import { inr, plural, sameCity, toHHMM, toMins, weekday } from "./util";

export interface LegRequest {
  from: string;
  to: string;
  date: string;
  isFirst: boolean;
  isLast: boolean;
}

export function findDistance(distances: Distance[], from: string, to: string): Distance | undefined {
  return distances.find(
    (d) => (sameCity(d.from, from) && sameCity(d.to, to)) || (sameCity(d.from, to) && sameCity(d.to, from)),
  );
}

/** Preferred departure windows: arrive in daylight on the way out, enjoy the morning on the way home. */
function departureScore(departs: string, leg: LegRequest): number {
  const m = toMins(departs);
  if (leg.isLast) return m >= toMins("11:00") && m <= toMins("17:00") ? 0 : m >= toMins("07:00") ? 1 : 2;
  return m >= toMins("05:30") && m <= toMins("12:00") ? 0 : m <= toMins("15:00") ? 1 : 2;
}

/** Only the final journey home may arrive the next day; all other legs must arrive the same day. */
function arrivalAllowed(dayOffset: number, leg: LegRequest): boolean {
  return leg.isLast || dayOffset === 0;
}

export function pickTrainClass(train: TrainRoute, tier: TierSettings, acRequired: boolean): TrainClass | undefined {
  const allowed = (c: TrainClass) => train.fares[c] !== undefined && (!acRequired || AC_TRAIN_CLASSES.includes(c));
  return tier.trainClasses.find(allowed) ?? (Object.keys(train.fares) as TrainClass[]).find(allowed);
}

export function findTrain(
  trains: TrainRoute[],
  leg: LegRequest,
  tier: TierSettings,
  acRequired: boolean,
): { train: TrainRoute; cls: TrainClass } | undefined {
  const day = weekday(leg.date);
  const candidates = trains
    .filter((t) => sameCity(t.from, leg.from) && sameCity(t.to, leg.to))
    .filter((t) => t.runsOn.includes(day) && arrivalAllowed(t.dayOffset, leg))
    .map((t) => ({ train: t, cls: pickTrainClass(t, tier, acRequired) }))
    .filter((c): c is { train: TrainRoute; cls: TrainClass } => c.cls !== undefined)
    .sort(
      (a, b) =>
        departureScore(a.train.departs, leg) - departureScore(b.train.departs, leg) ||
        toMins(a.train.departs) - toMins(b.train.departs),
    );
  return candidates[0];
}

export function findBus(buses: BusRoute[], leg: LegRequest, acRequired: boolean): BusRoute | undefined {
  return buses
    .filter((b) => sameCity(b.from, leg.from) && sameCity(b.to, leg.to))
    .filter((b) => (!acRequired || b.ac) && arrivalAllowed(b.dayOffset, leg))
    .sort(
      (a, b) =>
        departureScore(a.departs, leg) - departureScore(b.departs, leg) || a.fare - b.fare,
    )[0];
}

/** Cheapest fleet of a single vehicle type that seats the group. */
export function chooseVehicle(
  cabs: CabRate[],
  members: number,
  tier: Tier,
  acRequired: boolean,
  costOf: (cab: CabRate) => number,
): { cab: CabRate; count: number; total: number } | undefined {
  const usable = cabs.filter((c) => !acRequired || c.ac);
  const forTier = usable.filter((c) => c.tiers.includes(tier));
  const pool = forTier.length ? forTier : usable;
  let best: { cab: CabRate; count: number; total: number } | undefined;
  for (const cab of pool) {
    if (cab.capacity < 1) continue;
    const count = Math.ceil(members / cab.capacity);
    const total = costOf(cab) * count;
    if (!best || total < best.total) best = { cab, count, total };
  }
  return best;
}

export function oneWayCabCost(cab: CabRate, km: number): number {
  return Math.max(km, cab.minKmPerDay) * cab.perKm + cab.driverAllowancePerDay + cab.tollParkingPerDay;
}

export interface PublicLegResult {
  leg: LegPlan;
  lines: LineItem[];
}

/** Train → bus → one-way cab, in that order, for one leg of a public-transport plan. */
export function planPublicLeg(
  db: Database,
  legReq: LegRequest,
  members: number,
  tierName: Tier,
  acRequired: boolean,
): PublicLegResult | undefined {
  const tier = db.settings.tiers[tierName];
  const route = `${legReq.from} → ${legReq.to}`;

  const train = findTrain(db.trains, legReq, tier, acRequired);
  if (train) {
    const fare = train.train.fares[train.cls]!;
    return {
      leg: {
        from: legReq.from,
        to: legReq.to,
        date: legReq.date,
        mode: "train",
        departs: train.train.departs,
        arrives: train.train.arrives,
        dayOffset: train.train.dayOffset,
        description: `Train ${train.train.trainNo} ${train.train.name} (${train.cls})`,
        train: train.train,
        trainClass: train.cls,
      },
      lines: [
        {
          category: "Train/Bus",
          label: `Train ${route} (${train.cls})`,
          formula: `${inr(fare)} × ${plural(members, "person", "people")} (${train.train.trainNo}, ${train.cls})`,
          cost: fare * members,
          rack: fare * members,
        },
      ],
    };
  }

  const bus = findBus(db.buses, legReq, acRequired);
  if (bus) {
    return {
      leg: {
        from: legReq.from,
        to: legReq.to,
        date: legReq.date,
        mode: "bus",
        departs: bus.departs,
        arrives: bus.arrives,
        dayOffset: bus.dayOffset,
        description: `${bus.operator} ${bus.busType}`,
        bus,
      },
      lines: [
        {
          category: "Train/Bus",
          label: `Bus ${route} (${bus.busType})`,
          formula: `${inr(bus.fare)} × ${plural(members, "seat")} (${bus.operator})`,
          cost: bus.fare * members,
          rack: bus.fare * members,
        },
      ],
    };
  }

  const dist = findDistance(db.distances, legReq.from, legReq.to);
  if (!dist) return undefined;
  const fleet = chooseVehicle(db.cabs, members, tierName, acRequired, (c) => oneWayCabCost(c, dist.km));
  if (!fleet) return undefined;
  const departs = legReq.isLast ? "12:00" : db.settings.cabStartTime;
  const arrivesMins = toMins(departs) + Math.round(dist.driveHours * 60) + 60; // +1h meal/rest stop
  const { cab, count } = fleet;
  return {
    leg: {
      from: legReq.from,
      to: legReq.to,
      date: legReq.date,
      mode: "cab",
      departs,
      arrives: toHHMM(arrivesMins),
      dayOffset: arrivesMins >= 1440 ? 1 : 0,
      description: `Private ${cab.ac ? "AC " : ""}${cab.vehicle}${count > 1 ? ` × ${count}` : ""} (${dist.km} km)`,
      km: dist.km,
    },
    lines: [
      {
        category: "Transport",
        label: `Cab ${route} (${cab.vehicle})`,
        formula: `(max(${dist.km}, ${cab.minKmPerDay}) km × ${inr(cab.perKm)} + driver ${inr(cab.driverAllowancePerDay)} + toll/parking ${inr(cab.tollParkingPerDay)}) × ${plural(count, "vehicle")}`,
        cost: fleet.total,
        rack: fleet.total,
      },
    ],
  };
}
