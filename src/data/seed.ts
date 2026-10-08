// SAMPLE DATA ONLY. Property names, train numbers, timings and fares below are
// illustrative placeholders to show how the engine works. Replace them with your
// real contracted rates and verified timetables in Admin → Database before quoting.
import type {
  Activity,
  BusRoute,
  CabRate,
  Database,
  Distance,
  Property,
  RoomType,
  SeasonRate,
  Settings,
  Tier,
  TrainRoute,
} from "../engine/types";

const ALL: Tier[] = ["budget", "premium", "luxury"];
const UP: Tier[] = ["premium", "luxury"];

function seasons(id: string, b2b: number, b2c: number): SeasonRate[] {
  // Festive and winter peaks cost more; summer is a low season.
  const pct = (v: number, p: number) => Math.round((v * p) / 100 / 50) * 50;
  return [
    { id: `${id}-diwali`, name: "Diwali peak", from: "10-25", to: "11-05", b2b: pct(b2b, 135), b2c: pct(b2c, 135) },
    { id: `${id}-winter`, name: "Winter peak", from: "12-20", to: "01-05", b2b: pct(b2b, 150), b2c: pct(b2c, 150) },
    { id: `${id}-summer`, name: "Summer low", from: "04-15", to: "06-30", b2b: pct(b2b, 80), b2c: pct(b2c, 80) },
  ];
}

function room(
  id: string,
  name: string,
  b2b: number,
  b2c: number,
  mealPlan: RoomType["mealPlan"],
  opts: Partial<RoomType> = {},
): RoomType {
  return {
    id,
    name,
    ac: true,
    baseOccupancy: 2,
    maxOccupancy: 3,
    b2b,
    b2c,
    extraBedB2b: Math.round((b2b * 0.3) / 50) * 50,
    extraBedB2c: Math.round((b2c * 0.3) / 50) * 50,
    mealPlan,
    seasons: seasons(id, b2b, b2c),
    ...opts,
  };
}

function property(p: Omit<Property, "checkIn" | "checkOut" | "active" | "rateValidTill"> & Partial<Property>): Property {
  return { checkIn: "14:00", checkOut: "11:00", active: true, rateValidTill: "2027-03-31", ...p };
}

const properties: Property[] = [
  // ---- Udaipur ----
  property({
    id: "udr-b1", name: "Lakeside Haveli Inn (sample)", kind: "Heritage", city: "Udaipur", area: "Gangaur Ghat",
    stars: 3, tier: "budget", priority: 5, description: "Restored haveli with rooftop lake views, walking distance to City Palace.",
    roomTypes: [
      room("udr-b1-std", "Standard AC Room", 2500, 3200, "CP"),
      room("udr-b1-fam", "Family Room (4 pax)", 4200, 5400, "CP", { baseOccupancy: 4, maxOccupancy: 5 }),
      room("udr-b1-nac", "Non-AC Room", 1700, 2200, "EP", { ac: false }),
    ],
  }),
  property({
    id: "udr-b2", name: "Fatehsagar View Hotel (sample)", kind: "Hotel", city: "Udaipur", area: "Fateh Sagar",
    stars: 3, tier: "budget", priority: 3, description: "Simple, clean rooms near Fateh Sagar lake.",
    roomTypes: [room("udr-b2-std", "Deluxe AC Room", 2300, 3000, "EP")],
  }),
  property({
    id: "udr-p1", name: "Aravalli Lake Resort (sample)", kind: "Resort", city: "Udaipur", area: "Lake Pichola",
    stars: 4, tier: "premium", priority: 5, description: "Lake-facing resort with pool and Rajasthani architecture.",
    roomTypes: [
      room("udr-p1-dlx", "Deluxe Room", 4500, 5800, "CP"),
      room("udr-p1-lv", "Lake View Room", 5600, 7200, "MAP"),
    ],
  }),
  property({
    id: "udr-l1", name: "Pichola Palace Retreat (sample)", kind: "Heritage", city: "Udaipur", area: "Lake Pichola",
    stars: 5, tier: "luxury", priority: 5, description: "Palace-style luxury stay with boat access and spa.",
    roomTypes: [
      room("udr-l1-pal", "Palace Room", 9500, 12500, "CP"),
      room("udr-l1-ste", "Lake Suite", 16000, 21000, "MAP"),
    ],
  }),
  // ---- Jaisalmer ----
  property({
    id: "jsm-b1", name: "Golden Fort Guest House (sample)", kind: "Hotel", city: "Jaisalmer", area: "Fort Road",
    stars: 3, tier: "budget", priority: 5, description: "Sandstone hotel with fort views from the rooftop.",
    roomTypes: [
      room("jsm-b1-std", "Standard AC Room", 2200, 2900, "CP"),
      room("jsm-b1-fam", "Family Room (4 pax)", 3800, 4900, "CP", { baseOccupancy: 4, maxOccupancy: 5 }),
    ],
  }),
  property({
    id: "jsm-p1", name: "Sam Dunes Swiss Camp (sample)", kind: "Camp", city: "Jaisalmer", area: "Sam Sand Dunes",
    stars: 4, tier: "premium", priority: 5, description: "AC Swiss tents at the dunes with folk evening and dinner.",
    checkIn: "13:00", checkOut: "10:00",
    roomTypes: [room("jsm-p1-tent", "AC Swiss Tent", 4000, 5500, "MAP")],
  }),
  property({
    id: "jsm-l1", name: "Thar Desert Palace (sample)", kind: "Heritage", city: "Jaisalmer", area: "Sam Road",
    stars: 5, tier: "luxury", priority: 5, description: "Luxury sandstone palace hotel with pool and desert views.",
    roomTypes: [room("jsm-l1-dlx", "Heritage Room", 8500, 11500, "MAP")],
  }),
  // ---- Jodhpur ----
  property({
    id: "jdh-b1", name: "Blue City Homestay (sample)", kind: "Homestay", city: "Jodhpur", area: "Navchokiya",
    stars: 3, tier: "budget", priority: 5, description: "Family-run homestay below Mehrangarh Fort.",
    roomTypes: [room("jdh-b1-std", "AC Room", 2000, 2700, "CP")],
  }),
  property({
    id: "jdh-p1", name: "Mehran Courtyard Hotel (sample)", kind: "Hotel", city: "Jodhpur", area: "Ratanada",
    stars: 4, tier: "premium", priority: 5, description: "Modern 4-star with a pool and rooftop restaurant.",
    roomTypes: [room("jdh-p1-dlx", "Deluxe Room", 4200, 5500, "CP")],
  }),
  property({
    id: "jdh-l1", name: "Umaid Heritage Villa (sample)", kind: "Villa", city: "Jodhpur", area: "Circuit House Road",
    stars: 5, tier: "luxury", priority: 5, description: "Private heritage villa with butler service.",
    roomTypes: [room("jdh-l1-ste", "Heritage Suite", 11000, 14500, "CP")],
  }),
  // ---- Mount Abu ----
  property({
    id: "abu-b1", name: "Nakki Lake Hotel (sample)", kind: "Hotel", city: "Mount Abu", area: "Nakki Lake",
    stars: 3, tier: "budget", priority: 5, description: "Budget hotel a short walk from Nakki Lake.",
    roomTypes: [room("abu-b1-std", "Deluxe Room", 2100, 2800, "CP")],
  }),
  property({
    id: "abu-p1", name: "Aravalli Hills Resort (sample)", kind: "Resort", city: "Mount Abu", area: "Sunset Point Road",
    stars: 4, tier: "premium", priority: 5, description: "Hill resort with gardens and valley views.",
    roomTypes: [room("abu-p1-dlx", "Cottage", 4300, 5600, "MAP")],
  }),
];

const daily = [0, 1, 2, 3, 4, 5, 6];

const trains: TrainRoute[] = [
  { id: "t1", from: "Ahmedabad", to: "Udaipur", trainNo: "SAMPLE-101", name: "Ahmedabad–Udaipur Day Express", fromStation: "Ahmedabad (ADI)", toStation: "Udaipur City (UDZ)", departs: "06:10", arrives: "11:20", dayOffset: 0, runsOn: daily, fares: { CC: 650, EC: 1300, "3A": 780, "2A": 1100 } },
  { id: "t2", from: "Ahmedabad", to: "Udaipur", trainNo: "SAMPLE-102", name: "Udaipur Night Mail", fromStation: "Asarva (ASV)", toStation: "Udaipur City (UDZ)", departs: "22:40", arrives: "05:25", dayOffset: 1, runsOn: daily, fares: { SL: 320, "3A": 820, "2A": 1150, "1A": 1900 } },
  { id: "t3", from: "Udaipur", to: "Ahmedabad", trainNo: "SAMPLE-103", name: "Udaipur–Ahmedabad Day Express", fromStation: "Udaipur City (UDZ)", toStation: "Ahmedabad (ADI)", departs: "14:50", arrives: "20:05", dayOffset: 0, runsOn: daily, fares: { CC: 650, EC: 1300, "3A": 780, "2A": 1100 } },
  { id: "t4", from: "Jaisalmer", to: "Ahmedabad", trainNo: "SAMPLE-104", name: "Jaisalmer–Sabarmati Express", fromStation: "Jaisalmer (JSM)", toStation: "Sabarmati (SBIB)", departs: "13:45", arrives: "05:40", dayOffset: 1, runsOn: daily, fares: { SL: 450, "3A": 1150, "2A": 1650, "1A": 2750 } },
  { id: "t5", from: "Ahmedabad", to: "Jodhpur", trainNo: "SAMPLE-105", name: "Marudhar Day Express", fromStation: "Ahmedabad (ADI)", toStation: "Jodhpur (JU)", departs: "06:30", arrives: "14:15", dayOffset: 0, runsOn: daily, fares: { SL: 330, "3A": 870, "2A": 1230 } },
  { id: "t6", from: "Jodhpur", to: "Jaisalmer", trainNo: "SAMPLE-106", name: "Jodhpur–Jaisalmer Express", fromStation: "Jodhpur (JU)", toStation: "Jaisalmer (JSM)", departs: "06:00", arrives: "11:20", dayOffset: 0, runsOn: daily, fares: { SL: 230, "3A": 610, "2A": 860 } },
  { id: "t7", from: "Jodhpur", to: "Ahmedabad", trainNo: "SAMPLE-107", name: "Jodhpur–Ahmedabad Express", fromStation: "Jodhpur (JU)", toStation: "Ahmedabad (ADI)", departs: "15:10", arrives: "23:05", dayOffset: 0, runsOn: daily, fares: { SL: 330, "3A": 870, "2A": 1230 } },
  { id: "t8", from: "Jaisalmer", to: "Jodhpur", trainNo: "SAMPLE-108", name: "Jaisalmer–Jodhpur Express", fromStation: "Jaisalmer (JSM)", toStation: "Jodhpur (JU)", departs: "16:30", arrives: "21:50", dayOffset: 0, runsOn: daily, fares: { SL: 230, "3A": 610, "2A": 860 } },
];

const buses: BusRoute[] = [
  { id: "b1", from: "Udaipur", to: "Jaisalmer", operator: "Desert Travels (sample)", busType: "AC Seater", ac: true, departs: "07:00", arrives: "17:30", dayOffset: 0, fare: 1100 },
  { id: "b2", from: "Udaipur", to: "Jaisalmer", operator: "Desert Travels (sample)", busType: "AC Sleeper", ac: true, departs: "20:30", arrives: "07:00", dayOffset: 1, fare: 1300 },
  { id: "b3", from: "Udaipur", to: "Jodhpur", operator: "Marwar Travels (sample)", busType: "AC Seater", ac: true, departs: "08:00", arrives: "13:30", dayOffset: 0, fare: 650 },
  { id: "b4", from: "Ahmedabad", to: "Mount Abu", operator: "GSRTC Volvo (sample)", busType: "Volvo AC Seater", ac: true, departs: "07:00", arrives: "12:00", dayOffset: 0, fare: 550 },
  { id: "b5", from: "Mount Abu", to: "Udaipur", operator: "RSRTC (sample)", busType: "AC Seater", ac: true, departs: "09:30", arrives: "13:30", dayOffset: 0, fare: 420 },
  { id: "b6", from: "Udaipur", to: "Ahmedabad", operator: "GSRTC Volvo (sample)", busType: "Volvo AC Seater", ac: true, departs: "15:00", arrives: "20:30", dayOffset: 0, fare: 600 },
];

const cabs: CabRate[] = [
  { id: "c1", vehicle: "Sedan (Dzire/Etios)", capacity: 4, ac: true, tiers: ["budget", "premium"], perKm: 12, minKmPerDay: 250, driverAllowancePerDay: 300, tollParkingPerDay: 200, localDayRate: 2200, transferRate: 700 },
  { id: "c2", vehicle: "SUV (Ertiga)", capacity: 6, ac: true, tiers: ALL, perKm: 15, minKmPerDay: 250, driverAllowancePerDay: 300, tollParkingPerDay: 250, localDayRate: 2800, transferRate: 900 },
  { id: "c3", vehicle: "Innova Crysta", capacity: 6, ac: true, tiers: UP, perKm: 19, minKmPerDay: 250, driverAllowancePerDay: 400, tollParkingPerDay: 250, localDayRate: 3500, transferRate: 1200 },
  { id: "c4", vehicle: "Tempo Traveller (12 seats)", capacity: 12, ac: true, tiers: ALL, perKm: 26, minKmPerDay: 250, driverAllowancePerDay: 500, tollParkingPerDay: 400, localDayRate: 5000, transferRate: 1800 },
];

const distances: Distance[] = [
  { id: "d1", from: "Ahmedabad", to: "Udaipur", km: 260, driveHours: 4.5 },
  { id: "d2", from: "Udaipur", to: "Jaisalmer", km: 490, driveHours: 9 },
  { id: "d3", from: "Jaisalmer", to: "Ahmedabad", km: 620, driveHours: 11 },
  { id: "d4", from: "Ahmedabad", to: "Jodhpur", km: 450, driveHours: 8 },
  { id: "d5", from: "Jodhpur", to: "Jaisalmer", km: 285, driveHours: 5 },
  { id: "d6", from: "Udaipur", to: "Jodhpur", km: 250, driveHours: 5 },
  { id: "d7", from: "Ahmedabad", to: "Mount Abu", km: 225, driveHours: 4.5 },
  { id: "d8", from: "Mount Abu", to: "Udaipur", km: 165, driveHours: 3.5 },
];

function act(a: Omit<Activity, "active" | "groupSize" | "pricing" | "needsCab"> & Partial<Activity>): Activity {
  return { active: true, groupSize: 1, pricing: "per-person", needsCab: true, ...a };
}

const activities: Activity[] = [
  // Udaipur
  act({ id: "a-udr-1", city: "Udaipur", name: "City Palace & Museum", category: "Sightseeing", slot: "morning", durationMins: 150, b2b: 350, b2c: 400, tiers: ALL, priority: 10, description: "Grand palace complex overlooking Lake Pichola." }),
  act({ id: "a-udr-2", city: "Udaipur", name: "Lake Pichola Sunset Boat Ride", category: "Boating", slot: "sunset", durationMins: 60, b2b: 550, b2c: 700, tiers: ALL, priority: 9, description: "Sunset cruise past Jag Mandir and the Lake Palace." }),
  act({ id: "a-udr-3", city: "Udaipur", name: "Saheliyon ki Bari & Fateh Sagar", category: "Sightseeing", slot: "afternoon", durationMins: 90, b2b: 50, b2c: 50, tiers: ALL, priority: 7, description: "Royal garden of fountains, then a lakeside stroll." }),
  act({ id: "a-udr-4", city: "Udaipur", name: "Dharohar Folk Dance Show, Bagore ki Haveli", category: "Cultural", slot: "evening", durationMins: 75, b2b: 150, b2c: 200, tiers: ALL, priority: 8, needsCab: false, description: "Rajasthani folk dances and puppetry." }),
  act({ id: "a-udr-5", city: "Udaipur", name: "Sajjangarh Monsoon Palace Sunset", category: "Sightseeing", slot: "sunset", durationMins: 90, b2b: 300, b2c: 350, tiers: ALL, priority: 6, description: "Hilltop palace with panoramic sunset views." }),
  act({ id: "a-udr-6", city: "Udaipur", name: "Licensed Guide: Old City Walk", category: "Guide", slot: "morning", durationMins: 90, pricing: "per-group", groupSize: 10, b2b: 1200, b2c: 1500, tiers: UP, priority: 8, needsCab: false, description: "Jagdish Temple, ghats and artisan lanes with a local guide." }),
  act({ id: "a-udr-7", city: "Udaipur", name: "Rajasthani Cooking Class", category: "Local Experience", slot: "afternoon", durationMins: 120, b2b: 1300, b2c: 1700, tiers: UP, priority: 5, needsCab: false, description: "Cook dal-baati and gatte ki sabzi with a local family." }),
  act({ id: "a-udr-8", city: "Udaipur", name: "Private Lakeside Candle-light Dinner", category: "Local Experience", slot: "evening", durationMins: 120, pricing: "per-group", groupSize: 6, b2b: 6000, b2c: 8000, tiers: ["luxury"], priority: 9, needsCab: false, description: "Private dinner set up by the lake." }),
  // Jaisalmer
  act({ id: "a-jsm-1", city: "Jaisalmer", name: "Jaisalmer Fort & Jain Temples", category: "Sightseeing", slot: "morning", durationMins: 150, b2b: 100, b2c: 150, tiers: ALL, priority: 10, description: "Living sandstone fort and its intricately carved temples." }),
  act({ id: "a-jsm-2", city: "Jaisalmer", name: "Sam Sand Dunes Camel Safari", category: "Safari", slot: "sunset", durationMins: 120, b2b: 600, b2c: 800, tiers: ALL, priority: 10, description: "Camel ride over the dunes at sunset." }),
  act({ id: "a-jsm-3", city: "Jaisalmer", name: "Rajasthani Cultural Program & Dinner", category: "Cultural", slot: "evening", durationMins: 105, b2b: 800, b2c: 1000, tiers: ALL, priority: 9, needsCab: false, description: "Kalbeliya dance and folk music under the stars." }),
  act({ id: "a-jsm-4", city: "Jaisalmer", name: "Patwon ki Haveli & Gadisar Lake", category: "Sightseeing", slot: "afternoon", durationMins: 120, b2b: 100, b2c: 150, tiers: ALL, priority: 7, description: "Carved havelis and the old royal reservoir." }),
  act({ id: "a-jsm-5", city: "Jaisalmer", name: "Dune Jeep Safari", category: "Adventure", slot: "afternoon", durationMins: 90, pricing: "per-group", groupSize: 6, b2b: 2500, b2c: 3200, tiers: UP, priority: 8, description: "Dune bashing in an open 4x4." }),
  act({ id: "a-jsm-6", city: "Jaisalmer", name: "Kuldhara Abandoned Village", category: "Sightseeing", slot: "afternoon", durationMins: 60, b2b: 50, b2c: 50, tiers: ALL, priority: 4, description: "The legendary deserted village." }),
  // Jodhpur
  act({ id: "a-jdh-1", city: "Jodhpur", name: "Mehrangarh Fort", category: "Sightseeing", slot: "morning", durationMins: 150, b2b: 200, b2c: 250, tiers: ALL, priority: 10, description: "One of India's largest forts with sweeping blue-city views." }),
  act({ id: "a-jdh-2", city: "Jodhpur", name: "Jaswant Thada & Clock Tower Market", category: "Sightseeing", slot: "afternoon", durationMins: 120, b2b: 50, b2c: 50, tiers: ALL, priority: 8, description: "Marble cenotaph, then spices and textiles at Sardar Market." }),
  act({ id: "a-jdh-3", city: "Jodhpur", name: "Flying Fox Zipline", category: "Adventure", slot: "afternoon", durationMins: 90, b2b: 1900, b2c: 2300, tiers: UP, priority: 6, description: "Six ziplines over the fort's ramparts." }),
  // Mount Abu
  act({ id: "a-abu-1", city: "Mount Abu", name: "Dilwara Jain Temples", category: "Sightseeing", slot: "morning", durationMins: 120, b2b: 0, b2c: 0, tiers: ALL, priority: 10, description: "Marble temples famed for their carving." }),
  act({ id: "a-abu-2", city: "Mount Abu", name: "Nakki Lake Boating", category: "Boating", slot: "afternoon", durationMins: 60, b2b: 150, b2c: 200, tiers: ALL, priority: 8, needsCab: false, description: "Paddle boats on the hill-top lake." }),
  act({ id: "a-abu-3", city: "Mount Abu", name: "Sunset Point", category: "Sightseeing", slot: "sunset", durationMins: 60, b2b: 0, b2c: 0, tiers: ALL, priority: 9, description: "Classic sunset over the Aravallis." }),
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
