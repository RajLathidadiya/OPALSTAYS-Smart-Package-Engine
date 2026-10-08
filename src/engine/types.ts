// Core data model for the OPALSTAYS Smart Package Engine.
// All money values are whole Indian rupees (integers).

export type Tier = "budget" | "premium" | "luxury";
export const TIERS: Tier[] = ["budget", "premium", "luxury"];

/** EP = room only, CP = breakfast, MAP = breakfast + dinner, AP = all meals */
export type MealPlan = "EP" | "CP" | "MAP" | "AP";
export type Meal = "breakfast" | "lunch" | "dinner";

export const MEALS_IN_PLAN: Record<MealPlan, Meal[]> = {
  EP: [],
  CP: ["breakfast"],
  MAP: ["breakfast", "dinner"],
  AP: ["breakfast", "lunch", "dinner"],
};

/** Recurring yearly season, e.g. from "10-20" to "11-05". Wraps over new year. */
export interface SeasonRate {
  id: string;
  name: string;
  from: string; // MM-DD
  to: string; // MM-DD (inclusive)
  days?: number[]; // only these nights of the week (0 = Sunday), e.g. [5, 6] = Fri & Sat nights; empty = every night
  b2b: number; // per room per night (OPALSTAYS cost)
  b2c: number; // per room per night (public / rack rate)
  extraBedB2b?: number;
  extraBedB2c?: number;
}

/**
 * Per-person ("sharing") pricing: the total price of one room/unit per night when
 * `guests` people share it. Rows with a `season` name apply during that season;
 * rows without one are the regular rate.
 */
export interface OccupancyRate {
  id: string;
  guests: number;
  b2b: number; // total per room per night
  b2c: number;
  season?: string;
}

export interface RoomType {
  id: string;
  name: string;
  pricing?: "per-room" | "per-person"; // default per-room
  occupancyRates?: OccupancyRate[]; // used when pricing = per-person
  ac: boolean;
  baseOccupancy: number; // guests included in room rate
  maxOccupancy: number; // incl. extra bed(s)
  b2b: number; // default per room per night
  b2c: number;
  extraBedB2b: number; // per extra guest per night
  extraBedB2c: number;
  mealPlan: MealPlan;
  seasons: SeasonRate[];
}

export type PropertyKind = "Hotel" | "Resort" | "Villa" | "Homestay" | "Camp" | "Heritage" | "Farmhouse";

export interface Property {
  id: string;
  name: string;
  kind: PropertyKind;
  city: string;
  area: string;
  stars: number;
  tier: Tier;
  checkIn: string; // HH:MM
  checkOut: string; // HH:MM
  priority: number; // higher = preferred when costs are similar
  active: boolean;
  rateValidTill: string; // YYYY-MM-DD, warn after this
  hotelGst?: boolean; // add hotel GST to cost (5% up to ₹7,500 per room-night, 18% above)
  mealRates?: Partial<Record<Meal, { b2b: number; b2c: number }>>; // this property's own extra-meal prices
  description: string;
  roomTypes: RoomType[];
}

export type TrainClass = "SL" | "3E" | "3A" | "2A" | "1A" | "CC" | "EC";
export const AC_TRAIN_CLASSES: TrainClass[] = ["3E", "3A", "2A", "1A", "CC", "EC"];

export interface TrainRoute {
  id: string;
  from: string;
  to: string;
  trainNo: string;
  name: string;
  fromStation: string;
  toStation: string;
  departs: string; // HH:MM
  arrives: string; // HH:MM
  dayOffset: number; // 0 = same day arrival, 1 = next day
  runsOn: number[]; // 0 = Sunday ... 6 = Saturday
  fares: Partial<Record<TrainClass, number>>; // per person, approximate
}

export interface BusRoute {
  id: string;
  from: string;
  to: string;
  operator: string;
  busType: string;
  ac: boolean;
  departs: string;
  arrives: string;
  dayOffset: number;
  fare: number; // per seat
}

export interface CabRate {
  id: string;
  vehicle: string;
  capacity: number; // passengers
  ac: boolean;
  tiers: Tier[]; // which package tiers may use this vehicle
  perKm: number; // outstation
  minKmPerDay: number; // outstation minimum billing
  driverAllowancePerDay: number;
  tollParkingPerDay: number;
  localDayRate: number; // 8 hr / 80 km city sightseeing
  transferRate: number; // one-way station/airport <-> hotel
}

export interface Distance {
  id: string;
  from: string;
  to: string;
  km: number;
  driveHours: number;
}

export type ActivityCategory =
  | "Sightseeing"
  | "Safari"
  | "Boating"
  | "Adventure"
  | "Cultural"
  | "Entry Ticket"
  | "Guide"
  | "Local Experience";

export type Slot = "early" | "morning" | "afternoon" | "sunset" | "evening";

export interface Activity {
  id: string;
  city: string;
  name: string;
  category: ActivityCategory;
  slot: Slot;
  durationMins: number;
  pricing: "per-person" | "per-group";
  groupSize: number; // used when pricing = per-group
  b2b: number;
  b2c: number;
  tiers: Tier[];
  priority: number; // higher = scheduled first
  needsCab: boolean; // needs local sightseeing vehicle that day
  active: boolean;
  description: string;
}

export interface TierSettings {
  markupPercent: number;
  minProfitPerPerson: number;
  trainClasses: TrainClass[]; // preference order
  transport: "cheapest" | "prefer-public" | "prefer-cab";
  foodPerMeal: Record<Meal, number>; // per person, used for meals not in hotel plan
}

export interface Settings {
  companyName: string;
  phone: string;
  email: string;
  gstPercent: number;
  gstMode: "on-total" | "on-margin";
  agentCommissionPercent: number; // paid to sub-agent out of selling price
  contingencyPercent: number; // "Other" buffer on base cost
  rounding: "x999" | "x99" | "x00" | "none";
  tiers: Record<Tier, TierSettings>;
  localKmPerCityDay: number; // private cab: km allowance in a city per day
  cabStartTime: string; // HH:MM default departure for road legs
  aiModel: string;
  aiEffort: "low" | "medium" | "high";
  terms: string[];
}

export interface Database {
  version: number;
  updatedAt: string;
  properties: Property[];
  trains: TrainRoute[];
  buses: BusRoute[];
  cabs: CabRate[];
  distances: Distance[];
  activities: Activity[];
  settings: Settings;
}

// ---------- Customer input ----------

export interface Destination {
  city: string;
  nights: number; // 0 = auto distribute
}

export interface TripRequest {
  customerName: string;
  origin: string;
  destinations: Destination[];
  members: number;
  startDate: string; // YYYY-MM-DD (departure from origin)
  endDate: string; // YYYY-MM-DD (back at origin)
  budget: number; // total for the group, 0 = no budget
  acRequired: boolean;
  meals: Record<Meal, boolean>;
  preferredTier: Tier;
  notes: string;
}

// ---------- Engine output ----------

export type CostCategory = "Hotel" | "Transport" | "Train/Bus" | "Activities" | "Food" | "Other";

export interface LineItem {
  category: CostCategory;
  label: string; // customer-safe description
  formula: string; // exact calculation (admin only)
  cost: number; // B2B cost
  rack: number; // B2C / public value for the same item
}

export interface StayPlan {
  city: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  property: Property;
  roomType: RoomType;
  rooms: number;
  extraBeds: number;
  sharing?: number[]; // per-person rooms: guests in each room, e.g. [4, 2]
  mealPlan: MealPlan;
  alternatives: { property: Property; roomType: RoomType; cost: number }[];
}

export type LegMode = "train" | "bus" | "cab";

export interface LegPlan {
  from: string;
  to: string;
  date: string;
  mode: LegMode;
  departs: string; // HH:MM
  arrives: string; // HH:MM
  dayOffset: number;
  description: string; // customer-safe
  train?: TrainRoute;
  trainClass?: TrainClass;
  bus?: BusRoute;
  km?: number;
}

export interface ItineraryEntry {
  time: string; // HH:MM
  title: string;
  detail?: string;
  kind: "travel" | "hotel" | "activity" | "meal" | "free";
}

export interface ItineraryDay {
  day: number;
  date: string;
  city: string;
  entries: ItineraryEntry[];
}

export interface PriceSummary {
  cost: number; // your actual cost
  markup: number; // margin before rounding
  roundingAdjustment: number;
  preTax: number; // taxable value
  gst: number;
  agentCommission: number;
  finalPrice: number; // customer pays
  perPerson: number;
  profit: number; // final - gst - cost - commission
  marginPercent: number; // profit / final
  rackValue: number; // what the same trip would cost at public rates
}

export interface PackageOption {
  id: string;
  tier: Tier;
  title: string;
  totalNights: number;
  totalDays: number;
  stays: StayPlan[];
  legs: LegPlan[];
  transportPlan: "public" | "private-cab";
  cab?: { vehicle: CabRate; count: number };
  itinerary: ItineraryDay[];
  lineItems: LineItem[];
  price: PriceSummary;
  budgetStatus: "no-budget" | "within" | "over";
  budgetDiff: number; // budget - finalPrice (negative = over)
  warnings: string[];
  inclusions: string[];
  exclusions: string[];
}

export interface QuoteResult {
  request: TripRequest;
  createdAt: string;
  options: PackageOption[];
  errors: string[];
  recommendedTier?: Tier;
}
