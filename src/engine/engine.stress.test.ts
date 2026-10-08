import { it, expect } from "vitest";
import { seedDatabase } from "../data/seed";
import { generateQuote } from "./packages";
import type { TripRequest } from "./types";
import { addDays } from "./util";

const cities = ["Udaipur", "Jaisalmer", "Jodhpur", "Mount Abu"];
it("stress", () => {
  const db = seedDatabase();
  const issues: string[] = [];
  let n = 0;
  for (const members of [1, 2, 3, 5, 6, 7, 13, 20])
    for (const start of ["2026-10-15", "2026-10-30", "2026-12-28", "2027-05-10"])
      for (const len of [1, 2, 3, 4, 6])
        for (const route of [[0], [1], [2], [3], [0, 1], [2, 1], [3, 0], [0, 2, 1], [3, 0, 2, 1]])
          for (const ac of [true, false]) {
            if (len < route.length) continue;
            const req: TripRequest = { customerName: "", origin: "Ahmedabad", destinations: route.map((i) => ({ city: cities[i], nights: 0 })), members, startDate: start, endDate: addDays(start, len), budget: 50000, acRequired: ac, meals: { breakfast: true, lunch: members % 2 === 0, dinner: true }, preferredTier: "premium", notes: "" };
            const q = generateQuote(db, req);
            n++;
            for (const o of q.options) {
              const p = o.price;
              if (p.cost + p.profit + p.gst + p.agentCommission !== p.finalPrice) issues.push("sum " + JSON.stringify(req));
              if (p.profit <= 0) issues.push("profit<=0");
              if (!Number.isInteger(p.finalPrice) || Number.isNaN(p.cost)) issues.push("nan");
              // itinerary times sorted & days contiguous
              o.itinerary.forEach((d, i) => { if (d.day !== i + 1) issues.push("day order"); });
              // stays sum nights
              if (o.stays.reduce((s, x) => s + x.nights, 0) !== len) issues.push("nights");
              // overlapping activities
              for (const d of o.itinerary) {
                const acts = d.entries.filter((e) => e.kind === "activity").map((e) => e.time);
                if (new Set(acts).size !== acts.length) issues.push("dup time " + d.date);
              }
              // intermediate legs must arrive same day
              o.legs.slice(0, -1).forEach((l) => { if (l.dayOffset) issues.push(`overnight mid leg ${l.from}-${l.to} ${l.mode}`); });
              // vehicle capacity
              if (o.cab && o.cab.count * o.cab.vehicle.capacity < members) issues.push("cab cap");
              for (const s of o.stays) if (s.rooms * s.roomType.maxOccupancy < members) issues.push("room cap");
            }
            if (q.errors.length && !q.options.length) issues.push("no options: " + q.errors[0]);
          }
  const uniq = [...new Set(issues)];
  expect(uniq).toEqual([]);
});
