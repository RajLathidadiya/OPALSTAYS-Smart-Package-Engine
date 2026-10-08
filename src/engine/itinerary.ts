// Rule-based day-by-day scheduler. Produces exact times from transport timings,
// hotel check-in/out rules and activity slots. The AI layer only rewrites the
// wording; it never moves these times or touches prices.
import type { Activity, ItineraryDay, ItineraryEntry, LegPlan, Meal, Slot, StayPlan, Tier } from "./types";
import { MEALS_IN_PLAN } from "./types";
import { addDays, ceilQuarter, daysBetween, sameCity, toHHMM, toMins } from "./util";

const SLOTS: Record<Slot, [number, number]> = {
  early: [toMins("06:00"), toMins("09:30")], // e.g. jungle safari
  morning: [toMins("09:30"), toMins("13:00")],
  afternoon: [toMins("14:00"), toMins("17:00")],
  sunset: [toMins("17:15"), toMins("19:00")],
  evening: [toMins("19:15"), toMins("21:00")],
};
const SLOT_OVERRUN = 45; // an activity may finish this many minutes after its slot ends
const GAP = 20; // travel buffer between activities
const DAY_START = toMins("06:00"); // only "early" activities use time before 09:30
const DAY_END = toMins("21:30");

export interface ScheduledActivity {
  activity: Activity;
  date: string;
  start: number;
  city: string;
}

export interface ScheduleResult {
  days: ItineraryDay[];
  scheduled: ScheduledActivity[];
  unscheduled: Activity[];
}

interface Window {
  date: string;
  start: number;
  end: number;
}

export function scheduleItinerary(opts: {
  startDate: string;
  origin: string;
  stays: StayPlan[];
  legs: LegPlan[]; // legs[i] arrives into stays[i]; last leg returns to origin
  activities: Activity[];
  tier: Tier;
  wantedMeals: Record<Meal, boolean>;
  privateCab: boolean;
}): ScheduleResult {
  const { startDate, origin, stays, legs, tier, wantedMeals, privateCab } = opts;
  const entries = new Map<string, ItineraryEntry[]>();
  const add = (date: string, mins: number, title: string, kind: ItineraryEntry["kind"], detail?: string) => {
    if (!entries.has(date)) entries.set(date, []);
    entries.get(date)!.push({ time: toHHMM(mins), title, kind, detail });
  };

  // ----- Travel, hotel and activity windows -----
  const windowsByStay: Window[][] = stays.map(() => []);

  legs.forEach((leg, i) => {
    const dep = toMins(leg.departs);
    const arr = toMins(leg.arrives);
    const arrDate = addDays(leg.date, leg.dayOffset);
    const prevStay = i > 0 ? stays[i - 1] : undefined;
    const nextStay = stays[i];
    const via = leg.train ? `${leg.description} from ${leg.train.fromStation}` : leg.description;

    // Leaving the previous place
    if (!prevStay) {
      if (!privateCab && leg.mode !== "cab") add(leg.date, dep - 60, `Pickup in ${origin} & transfer to ${leg.mode === "train" ? "station" : "bus stand"}`, "travel");
      add(leg.date, dep, `Depart ${leg.from} → ${leg.to}`, "travel", via);
    } else {
      const checkout = Math.min(toMins(prevStay.property.checkOut), dep - (leg.mode === "cab" ? 0 : 60));
      add(leg.date, checkout, `Checkout from ${prevStay.property.name}`, "hotel");
      if (leg.mode === "cab") {
        add(leg.date, dep, `Depart ${leg.from} → ${leg.to}`, "travel", via);
      } else {
        add(leg.date, dep - 60, `Transfer to ${leg.mode === "train" ? "station" : "bus stand"}`, "travel");
        add(leg.date, dep, `Depart ${leg.from} → ${leg.to}`, "travel", via);
      }
      // Morning sightseeing before a late departure
      const last = windowsByStay[i - 1];
      last.push({ date: leg.date, start: DAY_START, end: dep - (leg.mode === "cab" ? 30 : 75) });
    }

    // Arriving at the next place
    if (nextStay) {
      const reachHotel = ceilQuarter(arr + (leg.mode === "cab" ? 0 : 45));
      if (leg.mode !== "cab") add(arrDate, arr, `Arrive ${leg.to}${leg.train ? ` (${leg.train.toStation})` : ""}`, "travel", "Pickup by OPALSTAYS cab");
      const early = reachHotel < toMins(nextStay.property.checkIn);
      add(
        arrDate,
        leg.mode === "cab" ? arr : reachHotel,
        `${leg.mode === "cab" ? `Arrive ${leg.to} & check-in` : "Hotel check-in"}: ${nextStay.property.name}`,
        "hotel",
        early ? `Early check-in subject to availability (standard ${nextStay.property.checkIn})` : undefined,
      );
      windowsByStay[i].push({ date: arrDate, start: reachHotel + 60, end: DAY_END });
      for (let d = 1; d < nextStay.nights; d++) {
        windowsByStay[i].push({ date: addDays(nextStay.checkInDate, d), start: DAY_START, end: DAY_END });
      }
    } else {
      if (!privateCab && leg.mode !== "cab") add(arrDate, arr, `Arrive ${leg.to}${leg.train ? ` (${leg.train.toStation})` : ""}`, "travel", "Drop to home");
      else add(arrDate, arr, `Arrive ${leg.to}`, "travel", "Drop to home");
      add(arrDate, arr + 15, "Trip ends — thank you for travelling with OPALSTAYS", "free");
    }
  });

  // ----- Activities -----
  const busy = new Map<string, [number, number][]>();
  const scheduled: ScheduledActivity[] = [];
  const unscheduled: Activity[] = [];

  stays.forEach((stay, i) => {
    const pool = opts.activities
      .filter((a) => a.active && sameCity(a.city, stay.city) && a.tiers.includes(tier))
      .sort((a, b) => b.priority - a.priority);
    const windows = windowsByStay[i].filter((w) => w.end > w.start);

    for (const activity of pool) {
      const [slotStart, slotEnd] = SLOTS[activity.slot];
      // Spread activities: try the least busy day first.
      const ordered = [...windows].sort(
        (a, b) => (busy.get(a.date)?.length ?? 0) - (busy.get(b.date)?.length ?? 0) || a.date.localeCompare(b.date),
      );
      let placed = false;
      for (const w of ordered) {
        const dayBusy = busy.get(w.date) ?? [];
        const latestEnd = Math.min(slotEnd + SLOT_OVERRUN, w.end);
        const candidates = [Math.max(slotStart, w.start), ...dayBusy.map(([, e]) => e + GAP)]
          .map(ceilQuarter)
          .filter((t) => t >= Math.max(slotStart, w.start) && t < slotEnd)
          .sort((a, b) => a - b);
        const start = candidates.find(
          (t) =>
            t + activity.durationMins <= latestEnd &&
            dayBusy.every(([s, e]) => t + activity.durationMins + GAP <= s || t >= e + GAP),
        );
        if (start === undefined) continue;
        dayBusy.push([start, start + activity.durationMins]);
        busy.set(w.date, dayBusy);
        scheduled.push({ activity, date: w.date, start, city: stay.city });
        add(w.date, start, activity.name, "activity", activity.description || undefined);
        placed = true;
        break;
      }
      if (!placed) unscheduled.push(activity);
    }

    // ----- Meals (one per night of stay, matching the pricing engine) -----
    const inPlan = MEALS_IN_PLAN[stay.mealPlan];
    const where = (m: Meal) => (inPlan.includes(m) ? "at hotel" : "");
    for (let n = 0; n < stay.nights; n++) {
      const night = addDays(stay.checkInDate, n);
      const morning = addDays(night, 1);
      if (wantedMeals.breakfast || inPlan.includes("breakfast")) {
        // On a travel morning, breakfast comes before checkout.
        const leaving = legs.find((l) => l.date === morning);
        const latest = leaving ? toMins(leaving.departs) - (leaving.mode === "cab" ? 45 : 105) : toMins("08:30");
        // After an early activity (safari), breakfast follows it.
        const early = (busy.get(morning) ?? []).filter(([st]) => st < toMins("09:30"));
        const afterEarly = early.length ? Math.max(...early.map(([, e]) => e)) + 15 : 0;
        const time = afterEarly ? Math.min(afterEarly, latest) : Math.min(toMins("08:30"), latest);
        add(morning, Math.max(time, toMins("05:30")), time < toMins("06:30") ? "Packed breakfast" : `Breakfast ${where("breakfast")}`.trim(), "meal");
      }
      if (wantedMeals.lunch || inPlan.includes("lunch")) add(morning, toMins("13:15"), `Lunch ${where("lunch")}`.trim(), "meal");
      if (wantedMeals.dinner || inPlan.includes("dinner")) add(night, toMins("21:00"), `Dinner ${where("dinner")}`.trim(), "meal");
    }

    // Full days in a city with nothing planned become leisure time.
    for (let d = 1; d < stay.nights; d++) {
      const date = addDays(stay.checkInDate, d);
      if (!(busy.get(date)?.length)) add(date, toMins("10:00"), `Leisure day in ${stay.city}`, "free", "Explore local markets, cafés and hidden lanes at your own pace");
    }
  });

  // ----- Assemble days -----
  const lastLeg = legs[legs.length - 1];
  const lastDate = addDays(lastLeg.date, lastLeg.dayOffset);
  const totalDays = daysBetween(startDate, lastDate) + 1;
  const days: ItineraryDay[] = [];
  for (let d = 0; d < totalDays; d++) {
    const date = addDays(startDate, d);
    const legToday = legs.find((l) => l.date === date);
    const stayToday = stays.find((s) => date >= s.checkInDate && date < s.checkOutDate);
    const city = legToday ? `${legToday.from} → ${legToday.to}` : stayToday?.city ?? origin;
    const list = (entries.get(date) ?? []).sort((a, b) => toMins(a.time) - toMins(b.time));
    days.push({ day: d + 1, date, city, entries: list });
  }

  return { days, scheduled, unscheduled };
}
