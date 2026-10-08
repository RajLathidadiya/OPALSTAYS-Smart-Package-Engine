import { TIER_LABEL } from "../engine/packages";
import { formatDate, inr } from "../engine/util";
import type { SavedQuote } from "../store/db";

const STATUSES: SavedQuote["status"][] = ["draft", "sent", "confirmed", "lost"];

export function HistoryPage(props: {
  quotes: SavedQuote[];
  onOpen: (id: string) => void;
  onUpdate: (q: SavedQuote) => void;
  onDelete: (id: string) => void;
}) {
  const confirmed = props.quotes.filter((q) => q.status === "confirmed");
  const confirmedProfit = confirmed.reduce((s, q) => s + (q.result.options.find((o) => o.tier === q.chosenTier)?.price.profit ?? 0), 0);

  if (!props.quotes.length) return <div className="card muted">No saved quotes yet. Generated quotes are saved here automatically.</div>;

  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi"><div className="l">Quotes</div><div className="v">{props.quotes.length}</div></div>
        <div className="kpi"><div className="l">Confirmed</div><div className="v">{confirmed.length}</div></div>
        <div className="kpi"><div className="l">Confirmed profit</div><div className="v">{inr(confirmedProfit)}</div></div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Saved</th>
              <th>Customer / route</th>
              <th>Travel</th>
              <th>Chosen option</th>
              <th className="r">Price</th>
              <th className="r">Profit</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.quotes.map((q) => {
              const r = q.result.request;
              const chosen = q.result.options.find((o) => o.tier === q.chosenTier);
              return (
                <tr key={q.id}>
                  <td className="num">{q.savedAt.slice(0, 10)}</td>
                  <td>
                    <strong>{r.customerName || "—"}</strong>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>{[r.origin, ...r.destinations.map((d) => d.city)].join(" → ")} · {r.members} pax</div>
                  </td>
                  <td className="num">{formatDate(r.startDate)}</td>
                  <td>
                    <select
                      value={q.chosenTier ?? ""}
                      onChange={(e) => props.onUpdate({ ...q, chosenTier: (e.target.value || undefined) as SavedQuote["chosenTier"] })}
                    >
                      <option value="">—</option>
                      {q.result.options.map((o) => (
                        <option key={o.tier} value={o.tier}>{TIER_LABEL[o.tier]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="r num">{chosen ? inr(chosen.price.finalPrice) : "—"}</td>
                  <td className="r num">{chosen ? inr(chosen.price.profit) : "—"}</td>
                  <td>
                    <select value={q.status} onChange={(e) => props.onUpdate({ ...q, status: e.target.value as SavedQuote["status"] })}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className="row" style={{ gap: "0.25rem", flexWrap: "nowrap" }}>
                      <button className="btn small" onClick={() => props.onOpen(q.id)}>Open</button>
                      <button className="btn small danger" onClick={() => confirm("Delete this quote?") && props.onDelete(q.id)} aria-label="Delete">✕</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: "0.85rem" }}>
        Saved quotes keep the prices from when they were made. Edit the trip and generate again to re-price with today's rates.
      </div>
    </div>
  );
}
