import type { PackageOption, Tier } from "../engine/types";
import { TIER_LABEL } from "../engine/packages";
import { formatDate, inr, plural } from "../engine/util";
import type { SavedQuote } from "../store/db";

export function OptionsPage(props: {
  quote: SavedQuote;
  adminMode: boolean;
  onOpen: (tier: Tier) => void;
  onEdit: () => void;
}) {
  const { result } = props.quote;
  const req = result.request;

  return (
    <div className="stack">
      <div className="row no-print">
        <button className="btn" onClick={props.onEdit}>
          ← Edit trip
        </button>
        <div className="spacer" />
      </div>

      <div className="card">
        <h1>{req.customerName ? `${req.customerName}: ` : ""}{[req.origin, ...req.destinations.map((d) => d.city), req.origin].join(" → ")}</h1>
        <div className="muted">
          {plural(req.members, "member")} · {formatDate(req.startDate)} to {formatDate(req.endDate)}
          {req.budget > 0 && <> · Budget {inr(req.budget)}</>}
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="alert bad">
          <strong>Some options could not be built</strong>
          <ul>
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-3">
        {result.options.map((o) => (
          <OptionCard key={o.tier} option={o} recommended={o.tier === result.recommendedTier} adminMode={props.adminMode} onOpen={() => props.onOpen(o.tier)} />
        ))}
      </div>

      {props.adminMode && result.options.length > 0 && (
        <div className="card admin-box">
          <div className="label">Admin only: profit by option</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Option</th>
                  <th className="r">Customer price</th>
                  <th className="r">Your cost</th>
                  <th className="r">GST</th>
                  <th className="r">Profit</th>
                  <th className="r">Margin</th>
                </tr>
              </thead>
              <tbody>
                {result.options.map((o) => (
                  <tr key={o.tier}>
                    <td>{TIER_LABEL[o.tier]}</td>
                    <td className="r num">{inr(o.price.finalPrice)}</td>
                    <td className="r num">{inr(o.price.cost)}</td>
                    <td className="r num">{inr(o.price.gst)}</td>
                    <td className="r num">
                      <strong>{inr(o.price.profit)}</strong>
                    </td>
                    <td className="r num">{o.price.marginPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionCard(props: { option: PackageOption; recommended: boolean; adminMode: boolean; onOpen: () => void }) {
  const o = props.option;
  return (
    <div className={`card option${props.recommended ? " recommended" : ""}`}>
      <div className="row">
        <span className="tier">{TIER_LABEL[o.tier]}</span>
        <div className="spacer" />
        {props.recommended && <span className="badge brand">Best fit</span>}
        {o.budgetStatus === "within" && <span className="badge good">Within budget</span>}
        {o.budgetStatus === "over" && <span className="badge bad">{inr(-o.budgetDiff)} over</span>}
      </div>
      <div>
        <div className="price num">{inr(o.price.finalPrice)}</div>
        <div className="muted">
          {inr(o.price.perPerson)} per person · {o.totalNights}N/{o.totalDays}D · incl. GST
        </div>
      </div>
      <ul>
        {o.stays.map((s) => (
          <li key={s.city}>
            {s.city}: {s.property.name} ({s.property.stars}★), {plural(s.nights, "night")}
          </li>
        ))}
        <li>
          {o.transportPlan === "private-cab" && o.cab
            ? `Private ${o.cab.vehicle.vehicle} for the whole trip`
            : `Travel by ${[...new Set(o.legs.map((l) => l.mode))].join(" / ")} + local cab`}
        </li>
        <li>{plural(o.itinerary.reduce((n, d) => n + d.entries.filter((e) => e.kind === "activity").length, 0), "experience")}</li>
      </ul>
      {props.adminMode && (
        <div className="admin-box">
          <div className="label">Admin only</div>
          <div className="row num" style={{ justifyContent: "space-between" }}>
            <span>Cost {inr(o.price.cost)}</span>
            <strong>Profit {inr(o.price.profit)}</strong>
          </div>
          {o.warnings.length > 0 && <div className="muted" style={{ fontSize: "0.8rem" }}>⚠ {plural(o.warnings.length, "warning")}</div>}
        </div>
      )}
      <div className="spacer" />
      <button className="btn primary" onClick={props.onOpen}>
        View package
      </button>
    </div>
  );
}
