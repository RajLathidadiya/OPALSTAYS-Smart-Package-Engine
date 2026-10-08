import { useState } from "react";
import type { Property, PropertyKind, RoomType, SeasonRate, Tier } from "../../engine/types";
import { TIERS } from "../../engine/types";
import { inr, uid } from "../../engine/util";
import { EditableTable } from "./EditableTable";

const KINDS: PropertyKind[] = ["Hotel", "Resort", "Villa", "Homestay", "Camp", "Heritage"];

function newRoom(): RoomType {
  return { id: uid("room"), name: "Standard Room", ac: true, baseOccupancy: 2, maxOccupancy: 3, b2b: 2000, b2c: 2600, extraBedB2b: 600, extraBedB2c: 800, mealPlan: "CP", seasons: [] };
}

function newProperty(): Property {
  return {
    id: uid("prop"), name: "New property", kind: "Hotel", city: "", area: "", stars: 3, tier: "budget",
    checkIn: "14:00", checkOut: "11:00", priority: 5, active: true, rateValidTill: "", description: "", roomTypes: [newRoom()],
  };
}

export function PropertiesEditor(props: { rows: Property[]; onChange: (rows: Property[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const update = (p: Property) => props.onChange(props.rows.map((x) => (x.id === p.id ? p : x)));
  const visible = props.rows.filter((p) => `${p.name} ${p.city} ${p.tier}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="stack">
      <div className="row">
        <input placeholder="Search by name, city or tier" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ flex: 1 }} />
        <button
          className="btn primary"
          onClick={() => {
            const p = newProperty();
            props.onChange([...props.rows, p]);
            setOpen(p.id);
          }}
        >
          + Add property
        </button>
      </div>
      <div className="muted" style={{ fontSize: "0.85rem" }}>
        B2B = what OPALSTAYS pays (your cost). B2C = public/rack rate. Rates are per room per night. Seasons repeat every year (MM-DD).
      </div>
      {visible.map((p) => (
        <div key={p.id} className="card">
          <div className="row" style={{ cursor: "pointer" }} onClick={() => setOpen(open === p.id ? null : p.id)}>
            <strong>{p.name}</strong>
            <span className="muted">{p.city}</span>
            <span className="badge brand">{p.tier}</span>
            <span className="badge">{p.stars}★ {p.kind}</span>
            {!p.active && <span className="badge bad">inactive</span>}
            {p.rateValidTill && p.rateValidTill < new Date().toISOString().slice(0, 10) && <span className="badge bad">rates expired</span>}
            <div className="spacer" />
            <span className="muted num">from {inr(Math.min(...p.roomTypes.map((r) => r.b2b), Infinity))}</span>
            <span>{open === p.id ? "▲" : "▼"}</span>
          </div>
          {open === p.id && <PropertyForm property={p} onChange={update} onDelete={() => confirm(`Delete ${p.name}?`) && props.onChange(props.rows.filter((x) => x.id !== p.id))} />}
        </div>
      ))}
    </div>
  );
}

function PropertyForm({ property: p, onChange, onDelete }: { property: Property; onChange: (p: Property) => void; onDelete: () => void }) {
  const set = <K extends keyof Property>(k: K, v: Property[K]) => onChange({ ...p, [k]: v });
  const setRoom = (r: RoomType) => set("roomTypes", p.roomTypes.map((x) => (x.id === r.id ? r : x)));

  return (
    <div className="stack" style={{ marginTop: "0.75rem" }}>
      <div className="grid grid-2">
        <label className="field">Name<input value={p.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label className="field">City<input value={p.city} onChange={(e) => set("city", e.target.value)} /></label>
        <label className="field">Area<input value={p.area} onChange={(e) => set("area", e.target.value)} /></label>
        <label className="field">Type
          <select value={p.kind} onChange={(e) => set("kind", e.target.value as PropertyKind)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        </label>
        <label className="field">Stars<input type="number" min={1} max={5} value={p.stars} onChange={(e) => set("stars", Number(e.target.value) || 0)} /></label>
        <label className="field">Package tier
          <select value={p.tier} onChange={(e) => set("tier", e.target.value as Tier)}>{TIERS.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label className="field">Check-in<input type="time" value={p.checkIn} onChange={(e) => set("checkIn", e.target.value)} /></label>
        <label className="field">Checkout<input type="time" value={p.checkOut} onChange={(e) => set("checkOut", e.target.value)} /></label>
        <label className="field">Priority (higher = preferred)<input type="number" value={p.priority} onChange={(e) => set("priority", Number(e.target.value) || 0)} /></label>
        <label className="field">Rates valid till<input type="date" value={p.rateValidTill} onChange={(e) => set("rateValidTill", e.target.value)} /></label>
      </div>
      <label className="field">Description (shown to customer)<textarea rows={2} value={p.description} onChange={(e) => set("description", e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={p.active} onChange={(e) => set("active", e.target.checked)} /> Active (use in packages)</label>

      <EditableTable<RoomType>
        title="Room types"
        rows={p.roomTypes}
        onChange={(rows) => set("roomTypes", rows.map((r) => ({ ...r, seasons: r.seasons ?? [] })))}
        newRow={newRoom}
        columns={[
          { key: "name", label: "Room", type: "text", width: "10rem" },
          { key: "ac", label: "AC", type: "bool" },
          { key: "baseOccupancy", label: "Base pax", type: "number", width: "4rem" },
          { key: "maxOccupancy", label: "Max pax", type: "number", width: "4rem" },
          { key: "b2b", label: "B2B ₹", type: "number", width: "5.5rem" },
          { key: "b2c", label: "B2C ₹", type: "number", width: "5.5rem" },
          { key: "extraBedB2b", label: "Extra bed B2B", type: "number", width: "5rem" },
          { key: "extraBedB2c", label: "Extra bed B2C", type: "number", width: "5rem" },
          { key: "mealPlan", label: "Meals", type: "select", options: ["EP", "CP", "MAP", "AP"] },
        ]}
      />
      <div className="muted" style={{ fontSize: "0.8rem" }}>Meals: EP = room only, CP = breakfast, MAP = breakfast + dinner, AP = all meals.</div>

      {p.roomTypes.map((r) => (
        <EditableTable<SeasonRate>
          key={r.id}
          title={`Season rates: ${r.name}`}
          hint="First matching season wins. Leave empty to always use the base rate."
          rows={r.seasons}
          onChange={(rows) => setRoom({ ...r, seasons: rows })}
          newRow={() => ({ id: uid("season"), name: "Peak", from: "12-20", to: "01-05", b2b: r.b2b, b2c: r.b2c })}
          columns={[
            { key: "name", label: "Season", type: "text", width: "8rem" },
            { key: "from", label: "From (MM-DD)", type: "text", width: "5.5rem" },
            { key: "to", label: "To (MM-DD)", type: "text", width: "5.5rem" },
            { key: "b2b", label: "B2B ₹", type: "number", width: "5.5rem" },
            { key: "b2c", label: "B2C ₹", type: "number", width: "5.5rem" },
          ]}
        />
      ))}

      <div>
        <button className="btn danger" onClick={onDelete}>Delete property</button>
      </div>
    </div>
  );
}
