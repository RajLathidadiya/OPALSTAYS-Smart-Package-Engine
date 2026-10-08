import type { ReactNode } from "react";
import type { Tier, TrainClass } from "../../engine/types";
import { TIERS } from "../../engine/types";

export type Column<T> = {
  key: keyof T & string;
  label: string;
  width?: string;
} & (
  | { type: "text" | "number" | "time" | "date" | "bool" }
  | { type: "select"; options: string[] }
  | { type: "tiers" }
  | { type: "weekdays" }
  | { type: "fares" }
);

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];

export function faresToText(fares: Partial<Record<TrainClass, number>>): string {
  return Object.entries(fares)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
}

export function textToFares(text: string): Partial<Record<TrainClass, number>> {
  const out: Partial<Record<TrainClass, number>> = {};
  for (const part of text.split(/[,;]/)) {
    const [k, v] = part.split(":").map((x) => x.trim());
    const n = Number(v);
    if (k && Number.isFinite(n) && n >= 0) out[k.toUpperCase() as TrainClass] = n;
  }
  return out;
}

function Cell<T>({ col, value, onChange }: { col: Column<T>; value: unknown; onChange: (v: unknown) => void }) {
  switch (col.type) {
    case "number":
      return <input type="number" value={value as number} onChange={(e) => onChange(Number(e.target.value) || 0)} />;
    case "time":
      return <input type="time" value={value as string} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <input type="date" value={value as string} onChange={(e) => onChange(e.target.value)} />;
    case "bool":
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case "select":
      return (
        <select value={value as string} onChange={(e) => onChange(e.target.value)}>
          {col.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case "tiers": {
      const list = (value as Tier[]) ?? [];
      return (
        <div className="row" style={{ gap: "0.3rem", flexWrap: "nowrap" }}>
          {TIERS.map((t) => (
            <label key={t} className="check" title={t} style={{ fontSize: "0.75rem" }}>
              <input
                type="checkbox"
                checked={list.includes(t)}
                onChange={(e) => onChange(e.target.checked ? [...list, t] : list.filter((x) => x !== t))}
              />
              {t[0].toUpperCase()}
            </label>
          ))}
        </div>
      );
    }
    case "weekdays": {
      const list = (value as number[]) ?? [];
      return (
        <div className="row" style={{ gap: "0.15rem", flexWrap: "nowrap" }}>
          {WEEK.map((d, i) => (
            <label key={i} className="check" style={{ fontSize: "0.7rem", flexDirection: "column", gap: 0 }}>
              <input
                type="checkbox"
                checked={list.includes(i)}
                onChange={(e) => onChange(e.target.checked ? [...list, i].sort() : list.filter((x) => x !== i))}
              />
              {d}
            </label>
          ))}
        </div>
      );
    }
    case "fares":
      return (
        <input
          defaultValue={faresToText(value as Partial<Record<TrainClass, number>>)}
          placeholder="3A:780, 2A:1100"
          onBlur={(e) => onChange(textToFares(e.target.value))}
        />
      );
    default:
      return <input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function EditableTable<T extends { id: string }>(props: {
  title: string;
  hint?: ReactNode;
  rows: T[];
  columns: Column<T>[];
  onChange: (rows: T[]) => void;
  newRow: () => T;
}) {
  const update = (id: string, key: keyof T, v: unknown) => props.onChange(props.rows.map((r) => (r.id === id ? { ...r, [key]: v } : r)));
  return (
    <div className="card">
      <div className="row">
        <h3 style={{ margin: 0 }}>{props.title}</h3>
        <span className="badge">{props.rows.length}</span>
        <div className="spacer" />
        <button className="btn small" onClick={() => props.onChange([...props.rows, props.newRow()])}>
          + Add
        </button>
      </div>
      {props.hint && <div className="muted" style={{ fontSize: "0.85rem", margin: "0.4rem 0" }}>{props.hint}</div>}
      <div className="table-wrap">
        <table className="edit">
          <thead>
            <tr>
              {props.columns.map((c) => (
                <th key={c.key} style={{ minWidth: c.width }}>
                  {c.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id}>
                {props.columns.map((c) => (
                  <td key={c.key}>
                    <Cell col={c} value={r[c.key]} onChange={(v) => update(r.id, c.key, v)} />
                  </td>
                ))}
                <td>
                  <button
                    className="btn small danger"
                    onClick={() => confirm("Delete this row?") && props.onChange(props.rows.filter((x) => x.id !== r.id))}
                    aria-label="Delete"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
