import { useMemo, useState } from "react";
import type { Database, Tier, TripRequest } from "../engine/types";
import { daysBetween, isValidIsoDate, plural } from "../engine/util";
import { distributeNights } from "../engine/packages";

export function defaultRequest(): TripRequest {
  return {
    customerName: "",
    origin: "Ahmedabad",
    destinations: [
      { city: "Udaipur", nights: 0 },
      { city: "Jaisalmer", nights: 0 },
    ],
    members: 4,
    startDate: "2026-10-15",
    endDate: "2026-10-18",
    budget: 35000,
    acRequired: true,
    meals: { breakfast: true, lunch: false, dinner: false },
    preferredTier: "premium",
    notes: "",
  };
}

export function knownCities(db: Database): string[] {
  const set = new Set<string>();
  db.properties.forEach((p) => set.add(p.city));
  db.trains.forEach((t) => (set.add(t.from), set.add(t.to)));
  db.buses.forEach((b) => (set.add(b.from), set.add(b.to)));
  db.distances.forEach((d) => (set.add(d.from), set.add(d.to)));
  return [...set].filter(Boolean).sort();
}

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: "budget", label: "Budget (3★)" },
  { value: "premium", label: "Premium (4★)" },
  { value: "luxury", label: "Luxury (5★)" },
];

export function QuoteForm(props: { db: Database; initial?: TripRequest; onGenerate: (req: TripRequest) => void }) {
  const [req, setReq] = useState<TripRequest>(props.initial ?? defaultRequest());
  const cities = useMemo(() => knownCities(props.db), [props.db]);
  const set = <K extends keyof TripRequest>(k: K, v: TripRequest[K]) => setReq((r) => ({ ...r, [k]: v }));

  const totalNights = isValidIsoDate(req.startDate) && isValidIsoDate(req.endDate) ? daysBetween(req.startDate, req.endDate) : 0;
  const split = totalNights > 0 ? distributeNights(req) : { nights: [] as number[], error: undefined };

  const updateDest = (i: number, patch: Partial<TripRequest["destinations"][number]>) =>
    set("destinations", req.destinations.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const moveDest = (i: number, dir: -1 | 1) => {
    const list = [...req.destinations];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set("destinations", list);
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        props.onGenerate({ ...req, destinations: req.destinations.filter((d) => d.city.trim()) });
      }}
    >
      <datalist id="cities">
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="card stack">
        <h2>Customer & route</h2>
        <div className="grid grid-2">
          <label className="field">
            Customer name
            <input value={req.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="e.g. Patel family" />
          </label>
          <label className="field">
            Starting city
            <input list="cities" value={req.origin} onChange={(e) => set("origin", e.target.value)} required />
          </label>
        </div>

        <div className="stack">
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            Destinations in travel order. Nights 0 = auto split.
          </div>
          {req.destinations.map((d, i) => (
            <div key={i} className="dest-row">
              <label className="field">
                Stop {i + 1}
                <input list="cities" value={d.city} onChange={(e) => updateDest(i, { city: e.target.value })} />
              </label>
              <label className="field">
                Nights {d.nights === 0 && split.nights[i] ? <span>(auto: {split.nights[i]})</span> : null}
                <input type="number" min={0} value={d.nights} onChange={(e) => updateDest(i, { nights: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <div className="row" style={{ gap: "0.25rem" }}>
                <button type="button" className="btn small" onClick={() => moveDest(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className="btn small" onClick={() => moveDest(i, 1)} aria-label="Move down">↓</button>
                <button type="button" className="btn small danger" onClick={() => set("destinations", req.destinations.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
              </div>
            </div>
          ))}
          <div>
            <button type="button" className="btn small" onClick={() => set("destinations", [...req.destinations, { city: "", nights: 0 }])}>
              + Add destination
            </button>
          </div>
          <div className="muted">
            Route: {[req.origin, ...req.destinations.map((d) => d.city).filter(Boolean), req.origin].join(" → ")}
          </div>
        </div>
      </div>

      <div className="card stack">
        <h2>Trip details</h2>
        <div className="grid grid-2">
          <label className="field">
            Start date
            <input type="date" value={req.startDate} onChange={(e) => set("startDate", e.target.value)} required />
          </label>
          <label className="field">
            End date (back home)
            <input type="date" value={req.endDate} onChange={(e) => set("endDate", e.target.value)} required />
          </label>
          <label className="field">
            Members
            <input type="number" min={1} value={req.members} onChange={(e) => set("members", Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label className="field">
            Total budget (₹, 0 = no budget)
            <input type="number" min={0} step={500} value={req.budget} onChange={(e) => set("budget", Math.max(0, Number(e.target.value) || 0))} />
          </label>
          <label className="field">
            Preferred hotel category
            <select value={req.preferredTier} onChange={(e) => set("preferredTier", e.target.value as Tier)}>
              {TIER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {totalNights > 0 && (
          <div className={split.error ? "alert bad" : "muted"}>
            {split.error ?? `${plural(totalNights, "night")}, ${plural(totalNights + 1, "day")}`}
          </div>
        )}
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={req.acRequired} onChange={(e) => set("acRequired", e.target.checked)} /> AC required
          </label>
          <label className="check">
            <input type="checkbox" checked={req.meals.breakfast} onChange={(e) => set("meals", { ...req.meals, breakfast: e.target.checked })} /> Breakfast
          </label>
          <label className="check">
            <input type="checkbox" checked={req.meals.lunch} onChange={(e) => set("meals", { ...req.meals, lunch: e.target.checked })} /> Lunch
          </label>
          <label className="check">
            <input type="checkbox" checked={req.meals.dinner} onChange={(e) => set("meals", { ...req.meals, dinner: e.target.checked })} /> Dinner
          </label>
        </div>
        <label className="field">
          Notes for the itinerary (shown to AI, e.g. "senior citizens", "honeymoon", "Jain food")
          <textarea rows={2} value={req.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </div>

      <div className="row">
        <button className="btn primary" type="submit">
          Generate 3 package options
        </button>
        <button type="button" className="btn" onClick={() => setReq(defaultRequest())}>
          Reset to example
        </button>
      </div>
    </form>
  );
}
