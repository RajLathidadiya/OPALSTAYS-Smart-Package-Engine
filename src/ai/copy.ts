// Customer-facing package copy: shared types, the customer-safe view of a
// package, and the offline template used when AI is off.
import type { PackageOption, TripRequest } from "../engine/types";
import { TIER_LABEL, propertyType } from "../engine/packages";

export interface AiCopy {
  title: string;
  tagline: string;
  overview: string;
  days: { day: number; heading: string; story: string }[];
  highlights: string[];
  tips: string[];
  alternatives: string[];
}

export type CopyLanguage = "English" | "Gujarati" | "Hindi";

/** Strip everything internal before the package leaves the browser. */
export function customerSafePackage(opt: PackageOption, req: TripRequest) {
  return {
    package: `${TIER_LABEL[opt.tier]} — ${opt.totalNights} nights / ${opt.totalDays} days`,
    travellers: req.members,
    from: req.origin,
    dates: { start: req.startDate, end: req.endDate },
    customerNotes: req.notes || undefined,
    stays: opt.stays.map((s) => ({
      city: s.city,
      nights: s.nights,
      hotel: s.property.name,
      type: propertyType(s.property),
      about: s.property.description,
      room: s.roomType.name,
    })),
    transport:
      opt.transportPlan === "private-cab" && opt.cab
        ? `Private ${opt.cab.vehicle.vehicle} with driver for the whole trip`
        : opt.legs.map((l) => `${l.from} → ${l.to}: ${l.description}`),
    timetable: opt.itinerary.map((d) => ({
      day: d.day,
      date: d.date,
      place: d.city,
      entries: d.entries.map((e) => `${e.time} ${e.title}`),
    })),
  };
}

/** Rule-based copy used when no API key is set, so the app works fully offline. */
export function templateCopy(opt: PackageOption, req: TripRequest): AiCopy {
  const cities = opt.stays.map((s) => s.city);
  return {
    title: opt.title,
    tagline: `${cities.join(", ")} for ${req.members} traveller${req.members > 1 ? "s" : ""}, planned end to end.`,
    overview: `A ${opt.totalNights}-night journey from ${req.origin} through ${cities.join(" and ")}, with handpicked stays, comfortable transfers and the experiences each place is known for. Every day is timed so you travel relaxed and see the best of each city.`,
    days: opt.itinerary.map((d) => {
      const acts = d.entries.filter((e) => e.kind === "activity").map((e) => e.title);
      const travel = d.entries.find((e) => e.kind === "travel");
      return {
        day: d.day,
        heading: d.city,
        story: acts.length
          ? `${travel ? `${travel.title}. ` : ""}Today: ${acts.join(", ")}.`
          : travel
            ? `${travel.title}.`
            : `A relaxed day in ${d.city}.`,
      };
    }),
    highlights: opt.itinerary.flatMap((d) => d.entries.filter((e) => e.kind === "activity").map((e) => e.title)).slice(0, 6),
    tips: [
      "Carry a light jacket for desert evenings and comfortable walking shoes for forts.",
      "Keep a government photo ID handy for trains and hotel check-in.",
      "Carry some cash for small shops and local markets.",
    ],
    alternatives: [],
  };
}
