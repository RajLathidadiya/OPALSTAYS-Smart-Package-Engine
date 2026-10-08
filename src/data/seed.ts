// OPALSTAYS rate database: Sasan Gir properties.
// Hotel rates are the B2C (customer) rates from the property, + GST.
// OPALSTAYS' B2B cost is 10% below B2C everywhere (see b2b()).
// Seasons, meal plans marked "assumed", activity prices and road distances are
// approximate: confirm them and edit in Admin → Database.
import type {
  Activity,
  BusRoute,
  CabRate,
  Database,
  Distance,
  MealPlan,
  OccupancyRate,
  Property,
  RoomType,
  SeasonRate,
  Settings,
  Tier,
  TrainRoute,
} from "../engine/types";

const ALL: Tier[] = ["budget", "premium", "luxury"];
const UP: Tier[] = ["premium", "luxury"];

/** OPALSTAYS gets 10% off every B2C rate. */
export const B2B_DISCOUNT = 0.1;
export const b2b = (b2c: number) => Math.round(b2c * (1 - B2B_DISCOUNT));

/** "Season" dates for properties that quote Season / Off season. Everything else is off season. */
const SEASON_WINDOWS = [
  { name: "Season", from: "10-20", to: "11-10" }, // Diwali holidays
  { name: "Season", from: "12-20", to: "01-05" }, // Christmas & New Year
];

function seasonWindows(id: string, b2cRate = 0, extraBedB2c?: number): SeasonRate[] {
  return SEASON_WINDOWS.map((w, i) => ({
    id: `${id}-s${i}`,
    ...w,
    b2b: b2b(b2cRate),
    b2c: b2cRate,
    ...(extraBedB2c !== undefined ? { extraBedB2b: b2b(extraBedB2c), extraBedB2c } : {}),
  }));
}

/** Per-room pricing (rate per room per night). */
function perRoom(
  id: string,
  name: string,
  b2cRate: number,
  mealPlan: MealPlan,
  opts: { extraBed?: number; maxOccupancy?: number; seasons?: SeasonRate[]; ac?: boolean } = {},
): RoomType {
  const extraBed = opts.extraBed ?? 0;
  return {
    id,
    name,
    pricing: "per-room",
    occupancyRates: [],
    ac: opts.ac ?? true,
    baseOccupancy: 2,
    maxOccupancy: opts.maxOccupancy ?? (extraBed > 0 ? 3 : 2),
    b2b: b2b(b2cRate),
    b2c: b2cRate,
    extraBedB2b: b2b(extraBed),
    extraBedB2c: extraBed,
    mealPlan,
    seasons: opts.seasons ?? [],
  };
}

/**
 * Per-person ("sharing") pricing. Each row: [guests in the room, B2C rate per person, season?].
 * Stored as the room total, e.g. 3 sharing at ₹2,200/person = ₹6,600 per night.
 */
function perPerson(
  id: string,
  name: string,
  rows: [number, number, string?][],
  mealPlan: MealPlan,
  opts: { ac?: boolean; seasonal?: boolean } = {},
): RoomType {
  const occupancyRates: OccupancyRate[] = rows.map(([guests, perHead, season], i) => ({
    id: `${id}-o${i}`,
    guests,
    b2c: perHead * guests,
    b2b: b2b(perHead * guests),
    ...(season ? { season } : {}),
  }));
  return {
    id,
    name,
    pricing: "per-person",
    occupancyRates,
    ac: opts.ac ?? true,
    baseOccupancy: 1,
    maxOccupancy: Math.max(...rows.map((r) => r[0])),
    b2b: 0,
    b2c: 0,
    extraBedB2b: 0,
    extraBedB2c: 0,
    mealPlan,
    seasons: opts.seasonal ? seasonWindows(id) : [],
  };
}

/** Same per-person rate for every group size in a range. */
const range = (from: number, to: number, perHead: number, season?: string): [number, number, string?][] =>
  Array.from({ length: to - from + 1 }, (_, i) => [from + i, perHead, season]);

function property(p: Omit<Property, "checkIn" | "checkOut" | "active" | "rateValidTill" | "city" | "hotelGst"> & Partial<Property>): Property {
  return { city: "Sasan Gir", checkIn: "12:00", checkOut: "11:00", active: true, rateValidTill: "", hotelGst: true, ...p };
}

/** Room type × meal plan grid, e.g. Wild Calm "Courtyard Room (CP)". */
function planGrid(
  prefix: string,
  rooms: [string, Partial<Record<MealPlan, number>>][],
  opts: (room: string, plan: MealPlan) => Parameters<typeof perRoom>[4],
): RoomType[] {
  return rooms.flatMap(([room, plans]) =>
    (Object.entries(plans) as [MealPlan, number][]).map(([plan, rate]) =>
      perRoom(`${prefix}-${room.toLowerCase().replace(/[^a-z]+/g, "-")}-${plan.toLowerCase()}`, `${room} (${plan})`, rate, plan, opts(room, plan)),
    ),
  );
}

// ---------- Wild Calm: weekday rates, weekend = Fri & Sat nights ----------
const WILD_CALM_WEEKDAY: [string, Record<"CP" | "MAP" | "AP", number>][] = [
  ["Courtyard Room", { CP: 5683, MAP: 6914, AP: 8524 }],
  ["Calm Cub", { CP: 7861, MAP: 10537, AP: 12560 }],
  ["Wild Cub", { CP: 9899, MAP: 11495, AP: 13518 }],
  ["Calm Nest", { CP: 10644, MAP: 12240, AP: 14263 }],
  ["Wild Nest", { CP: 11708, MAP: 13305, AP: 15326 }],
];
const WILD_CALM_WEEKEND: Record<string, Record<"CP" | "MAP" | "AP", number>> = {
  "Courtyard Room": { CP: 6251, MAP: 7605, AP: 10537 },
  "Calm Cub": { CP: 8647, MAP: 11591, AP: 13815 },
  "Wild Cub": { CP: 10889, MAP: 12645, AP: 14869 },
  "Calm Nest": { CP: 11708, MAP: 13464, AP: 15688 },
  "Wild Nest": { CP: 12879, MAP: 14636, AP: 16860 },
};
const WILD_CALM_MATTRESS = { CP: 2661, MAP: 3634, AP: 4673 };

// ---------- Glorious Gir: Off season (regular) and Season ----------
const GLORIOUS_OFF: [string, Record<MealPlan, number>][] = [
  ["Standard First Floor", { EP: 2200, CP: 2640, MAP: 3300, AP: 3960 }],
  ["Premium Room", { EP: 3850, CP: 4290, MAP: 4950, AP: 5610 }],
  ["Super Deluxe Room", { EP: 2420, CP: 3190, MAP: 3850, AP: 4510 }],
  ["Deluxe Room", { EP: 2420, CP: 2860, MAP: 3520, AP: 4180 }],
];
const GLORIOUS_SEASON: Record<string, Record<MealPlan, number>> = {
  "Standard First Floor": { EP: 2640, CP: 3080, MAP: 3740, AP: 4400 },
  "Premium Room": { EP: 4730, CP: 5170, MAP: 5830, AP: 6490 },
  "Super Deluxe Room": { EP: 2970, CP: 3850, MAP: 4510, AP: 5170 },
  "Deluxe Room": { EP: 3080, CP: 3410, MAP: 4070, AP: 4730 },
};

const properties: Property[] = [
  property({
    id: "aaranya", name: "Aaranya Gir Resort", kind: "Resort", area: "Sasan Gir", stars: 0, tier: "premium", priority: 5,
    description: "Resort stay near the Gir forest, rooms for couples, families and groups.",
    roomTypes: [
      // Meal plan not given in the rate sheet: assumed room only (EP).
      perPerson("aaranya-room", "Room", [[2, 3025], [3, 2200], [4, 1980], [5, 1760], [6, 1650]], "EP"),
    ],
  }),
  property({
    id: "aaranya-dorm", name: "Aaranya Gir Resort (A/C Dormitory)", kind: "Resort", area: "Sasan Gir", stars: 0, tier: "budget", priority: 1,
    description: "A/C dormitory for groups at Aaranya Gir Resort.",
    roomTypes: [perPerson("aaranya-dorm-bed", "A/C Dormitory", range(1, 20, 1650), "EP")],
  }),
  property({
    id: "kanaiya", name: "Kanaiya Farm", kind: "Farmhouse", area: "Sasan Gir", stars: 0, tier: "budget", priority: 5,
    description: "Farm stay amid mango orchards near Sasan Gir.",
    roomTypes: [
      perPerson("kanaiya-ac", "AC Room", [[2, 1925], ...range(3, 4, 1430), [2, 2475, "Season"], ...range(3, 4, 1650, "Season")], "EP", { seasonal: true }),
      perPerson("kanaiya-nonac", "Non-AC Room", range(2, 4, 1320), "EP", { ac: false }),
    ],
  }),
  property({
    id: "vanvagdo", name: "Van Vagdo Prakruti Nivas", kind: "Farmhouse", area: "Sasan Gir", stars: 0, tier: "budget", priority: 5,
    description: "Nature stay close to the forest. Children 0–5 free, 6–10 years ₹1,100.",
    roomTypes: [perPerson("vanvagdo-room", "Cottage", [[2, 2200], [3, 1925], [4, 1650]], "EP")],
  }),
  property({
    id: "gokul", name: "Gokul Farm House", kind: "Farmhouse", area: "Sasan Gir", stars: 0, tier: "budget", priority: 5,
    description: "Farm house stay with home-style food.",
    mealRates: { lunch: { b2b: b2b(275), b2c: 275 }, dinner: { b2b: b2b(275), b2c: 275 } },
    roomTypes: [
      perRoom("gokul-deluxe", "Deluxe Room", 2750, "MAP", { extraBed: 1100, seasons: seasonWindows("gokul-deluxe", 4950, 1100) }),
      perPerson("gokul-sharing", "Group / Sharing", [...range(3, 6, 1540), ...range(3, 6, 1650, "Season")], "EP", { seasonal: true }),
    ],
  }),
  property({
    id: "shreevan", name: "Shree Van Resort", kind: "Resort", area: "Sasan Gir", stars: 0, tier: "budget", priority: 5,
    description: "Resort with rooms for couples and large families.",
    roomTypes: [
      perPerson(
        "shreevan-room",
        "Room",
        [
          [2, 1760], ...range(3, 4, 1540), [5, 1375], ...range(6, 7, 1100),
          [2, 2475, "Season"], ...range(3, 4, 2200, "Season"), [5, 1980, "Season"], ...range(6, 7, 1650, "Season"),
        ],
        "EP",
        { seasonal: true },
      ),
    ],
  }),
  property({
    id: "kesar", name: "Kesar Villa", kind: "Villa", area: "Sasan Gir", stars: 0, tier: "budget", priority: 5,
    description: "Simple AC rooms in a villa near Sasan.",
    roomTypes: [perPerson("kesar-ac", "AC Room", range(2, 4, 1375), "EP")],
  }),
  property({
    id: "wildcalm", name: "Wild Calm – Sasan Gir", kind: "Resort", area: "Sasan Gir", stars: 0, tier: "luxury", priority: 5,
    description: "Boutique luxury resort with courtyard rooms, cubs and nests.",
    roomTypes: planGrid("wildcalm", WILD_CALM_WEEKDAY, (room, plan) => {
      const weekend = WILD_CALM_WEEKEND[room][plan as "CP" | "MAP" | "AP"];
      const mattress = WILD_CALM_MATTRESS[plan as "CP" | "MAP" | "AP"];
      return {
        extraBed: mattress,
        seasons: [{ id: `wildcalm-${room}-${plan}-we`, name: "Weekend", from: "01-01", to: "12-31", days: [5, 6], b2b: b2b(weekend), b2c: weekend }],
      };
    }),
  }),
  property({
    id: "glorious", name: "Glorious Gir Resort", kind: "Resort", area: "Sasan Gir", stars: 0, tier: "premium", priority: 5,
    description: "Resort with standard, deluxe, super deluxe and premium rooms.",
    roomTypes: planGrid("glorious", GLORIOUS_OFF, (room, plan) => ({ seasons: seasonWindows(`glorious-${room}-${plan}`, GLORIOUS_SEASON[room][plan]) })),
  }),
];

const trains: TrainRoute[] = [];
const buses: BusRoute[] = [];

const cabs: CabRate[] = [
  { id: "c1", vehicle: "Sedan (Dzire/Etios)", capacity: 4, ac: true, tiers: ["budget", "premium"], perKm: 12, minKmPerDay: 250, driverAllowancePerDay: 300, tollParkingPerDay: 200, localDayRate: 2200, transferRate: 700 },
  { id: "c2", vehicle: "SUV (Ertiga)", capacity: 6, ac: true, tiers: ALL, perKm: 15, minKmPerDay: 250, driverAllowancePerDay: 300, tollParkingPerDay: 250, localDayRate: 2800, transferRate: 900 },
  { id: "c3", vehicle: "Innova Crysta", capacity: 6, ac: true, tiers: UP, perKm: 19, minKmPerDay: 250, driverAllowancePerDay: 400, tollParkingPerDay: 250, localDayRate: 3500, transferRate: 1200 },
  { id: "c4", vehicle: "Tempo Traveller (12 seats)", capacity: 12, ac: true, tiers: ALL, perKm: 26, minKmPerDay: 250, driverAllowancePerDay: 500, tollParkingPerDay: 400, localDayRate: 5000, transferRate: 1800 },
];

// Approximate road distances to Sasan Gir (verify).
const distances: Distance[] = [
  { id: "d1", from: "Ahmedabad", to: "Sasan Gir", km: 360, driveHours: 7 },
  { id: "d2", from: "Rajkot", to: "Sasan Gir", km: 165, driveHours: 3.5 },
  { id: "d3", from: "Vadodara", to: "Sasan Gir", km: 450, driveHours: 8 },
  { id: "d4", from: "Surat", to: "Sasan Gir", km: 580, driveHours: 10 },
  { id: "d5", from: "Junagadh", to: "Sasan Gir", km: 60, driveHours: 1.5 },
  { id: "d6", from: "Somnath", to: "Sasan Gir", km: 45, driveHours: 1 },
  { id: "d7", from: "Diu", to: "Sasan Gir", km: 95, driveHours: 2.5 },
  { id: "d8", from: "Dwarka", to: "Sasan Gir", km: 290, driveHours: 6 },
];

function act(a: Omit<Activity, "active" | "groupSize" | "pricing" | "needsCab"> & Partial<Activity>): Activity {
  return { active: true, groupSize: 1, pricing: "per-person", needsCab: true, ...a };
}

// Approximate activity prices (verify). The sanctuary is closed 16 June – 15 October.
const activities: Activity[] = [
  act({
    id: "a-gir-1", city: "Sasan Gir", name: "Gir Jungle Trail – Lion Safari (Gypsy)", category: "Safari", slot: "early", durationMins: 180,
    pricing: "per-group", groupSize: 6, b2b: 4800, b2c: 5500, tiers: ALL, priority: 10, needsCab: false,
    description: "Open gypsy safari from Sinh Sadan with permit and guide (up to 6 people). Permits must be booked in advance.",
  }),
  act({
    id: "a-gir-2", city: "Sasan Gir", name: "Devalia Safari Park", category: "Safari", slot: "afternoon", durationMins: 90,
    b2b: 200, b2c: 250, tiers: ["budget"], priority: 9,
    description: "Gir Interpretation Zone bus safari: lions, leopards and deer in a fenced park.",
  }),
  act({
    id: "a-gir-3", city: "Sasan Gir", name: "Somnath Temple & Evening Aarti", category: "Sightseeing", slot: "sunset", durationMins: 150,
    b2b: 0, b2c: 0, tiers: ALL, priority: 7,
    description: "Leave by 16:00 for Somnath Jyotirlinga by the sea (45 km); evening aarti at 19:00.",
  }),
  act({
    id: "a-gir-4", city: "Sasan Gir", name: "Private Jeep Safari at Devalia", category: "Safari", slot: "afternoon", durationMins: 90,
    pricing: "per-group", groupSize: 6, b2b: 3000, b2c: 3500, tiers: UP, priority: 9.5,
    description: "Private gypsy instead of the bus at Devalia Safari Park.",
  }),
];

export const defaultSettings: Settings = {
  companyName: "OPALSTAYS",
  phone: "+91 00000 00000",
  email: "hello@opalstays.example",
  gstPercent: 5,
  gstMode: "on-total",
  agentCommissionPercent: 0,
  contingencyPercent: 3,
  rounding: "x999",
  localKmPerCityDay: 60,
  cabStartTime: "07:30",
  aiModel: "claude-opus-5-5",
  aiEffort: "medium",
  tiers: {
    budget: { markupPercent: 12, minProfitPerPerson: 800, trainClasses: ["3A", "3E", "CC", "2A", "SL"], transport: "cheapest", foodPerMeal: { breakfast: 150, lunch: 250, dinner: 300 } },
    premium: { markupPercent: 16, minProfitPerPerson: 1200, trainClasses: ["2A", "CC", "3A", "EC"], transport: "cheapest", foodPerMeal: { breakfast: 250, lunch: 400, dinner: 500 } },
    luxury: { markupPercent: 22, minProfitPerPerson: 2000, trainClasses: ["1A", "EC", "2A"], transport: "prefer-cab", foodPerMeal: { breakfast: 350, lunch: 600, dinner: 800 } },
  },
  terms: [
    "Prices are valid for 7 days and subject to availability at the time of booking.",
    "Train and bus seats are confirmed only after ticketing; timings may change by the operator.",
    "50% advance to confirm, balance 7 days before travel.",
    "Cancellation charges as per hotel and transport policies.",
  ],
};

export function seedDatabase(): Database {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    properties: structuredClone(properties),
    trains: structuredClone(trains),
    buses: structuredClone(buses),
    cabs: structuredClone(cabs),
    distances: structuredClone(distances),
    activities: structuredClone(activities),
    settings: structuredClone(defaultSettings),
  };
}
