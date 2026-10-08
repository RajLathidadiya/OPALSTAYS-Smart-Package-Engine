import { useState } from "react";
import type { CostCategory, Database, PackageOption, TripRequest } from "../engine/types";
import { TIER_LABEL } from "../engine/packages";
import { formatDate, inr, plural } from "../engine/util";
import { templateCopy, type AiCopy, type CopyLanguage } from "../ai/copy";
import { getApiKey } from "../store/db";

const MEAL_PLAN = { EP: "Room only", CP: "Breakfast", MAP: "Breakfast & dinner", AP: "All meals" } as const;

export function PackagePage(props: {
  db: Database;
  option: PackageOption;
  request: TripRequest;
  copy?: AiCopy;
  adminMode: boolean;
  onCopy: (copy: AiCopy) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"customer" | "admin">("customer");
  const showAdmin = props.adminMode && tab === "admin";

  return (
    <div className="stack">
      <div className="row no-print">
        <button className="btn" onClick={props.onBack}>
          ← All options
        </button>
      </div>
      {props.adminMode && (
        <div className="tabs">
          <button className={tab === "customer" ? "active" : ""} onClick={() => setTab("customer")}>
            Customer quote
          </button>
          <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
            Admin: cost & profit
          </button>
        </div>
      )}
      {showAdmin ? <AdminBreakdown option={props.option} request={props.request} /> : <CustomerQuote {...props} />}
    </div>
  );
}

// ---------------- Customer quote (no internal numbers) ----------------

function CustomerQuote(props: { db: Database; option: PackageOption; request: TripRequest; copy?: AiCopy; onCopy: (c: AiCopy) => void }) {
  const { option: o, request: req, db } = props;
  const s = db.settings;
  const copy = props.copy ?? templateCopy(o, req);
  const [language, setLanguage] = useState<CopyLanguage>("English");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const hasKey = !!getApiKey();

  const runAi = async () => {
    setBusy(true);
    setError("");
    try {
      // Loaded on demand so the app opens fast and works offline without the AI SDK.
      const ai = await import("../ai/claude");
      try {
        props.onCopy(await ai.writePackageCopy({ apiKey: getApiKey(), settings: s, option: o, request: req, language }));
      } catch (e) {
        setError(ai.aiErrorMessage(e));
      }
    } catch {
      setError("Could not load the AI module. Check your internet connection.");
    } finally {
      setBusy(false);
    }
  };

  const copyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText(o, req, copy, s.companyName, s.phone));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard not available in this browser.");
    }
  };

  const story = new Map(copy.days.map((d) => [d.day, d]));

  return (
    <div className="stack">
      <div className="card no-print">
        <div className="row">
          <select value={language} onChange={(e) => setLanguage(e.target.value as CopyLanguage)} aria-label="Language">
            <option>English</option>
            <option>Gujarati</option>
            <option>Hindi</option>
          </select>
          <button className="btn primary" disabled={busy || !hasKey} onClick={runAi} title={hasKey ? "" : "Add an Anthropic API key in Admin → Settings"}>
            {busy ? "Writing…" : props.copy ? "Rewrite with AI" : "Write with AI"}
          </button>
          <button className="btn" onClick={() => window.print()}>
            Print / Save PDF
          </button>
          <button className="btn" onClick={copyWhatsApp}>
            {copied ? "Copied ✓" : "Copy WhatsApp text"}
          </button>
        </div>
        {!hasKey && <div className="muted" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>AI is off (no API key). The standard description is used; prices and timings are the same either way.</div>}
        {error && <div className="alert bad" style={{ marginTop: "0.5rem" }}>{error}</div>}
      </div>

      <div className="card quote-doc">
        <div className="quote-head">
          <div>
            <div className="brand">{s.companyName}</div>
            <h1 style={{ marginTop: "0.4rem" }}>{copy.title}</h1>
            <div className="muted">{copy.tagline}</div>
          </div>
          <div className="quote-price">
            <div className="muted">Package price ({plural(req.members, "traveller")})</div>
            <div className="big num">{inr(o.price.finalPrice)}</div>
            <div className="muted num">≈ {inr(o.price.perPerson)} per person · incl. GST</div>
          </div>
        </div>

        <p>
          {req.customerName && <strong>Prepared for {req.customerName}. </strong>}
          {formatDate(req.startDate)} → {formatDate(o.itinerary[o.itinerary.length - 1].date)} · {o.totalNights} nights / {o.totalDays} days · {TIER_LABEL[o.tier]}
        </p>
        <p>{copy.overview}</p>

        <h3>Your stays</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>City</th>
                <th>Hotel</th>
                <th>Room</th>
                <th>Meals</th>
                <th>Dates</th>
              </tr>
            </thead>
            <tbody>
              {o.stays.map((st) => (
                <tr key={st.city}>
                  <td>{st.city}</td>
                  <td>
                    {st.property.name}
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {st.property.stars}★ {st.property.kind}, {st.property.area}
                    </div>
                  </td>
                  <td>
                    {plural(st.rooms, "room")} {st.roomType.name}
                    {st.extraBeds > 0 && ` + ${plural(st.extraBeds, "extra bed")}`}
                  </td>
                  <td>{MEAL_PLAN[st.mealPlan]}</td>
                  <td className="num">
                    {formatDate(st.checkInDate)} – {formatDate(st.checkOutDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: "1.25rem" }}>Day-by-day plan</h3>
        {o.itinerary.map((d) => (
          <div key={d.day} className="itin-day">
            <h4>
              Day {d.day} · {formatDate(d.date)} · {story.get(d.day)?.heading ?? d.city}
            </h4>
            {story.get(d.day)?.story && <p className="muted">{story.get(d.day)!.story}</p>}
            {d.entries.map((e, i) => (
              <div key={i} className="itin-entry">
                <span className="t">{e.time}</span>
                <span>
                  <span className={`k-${e.kind}`}>{e.title}</span>
                  {e.detail && <div className="d">{e.detail}</div>}
                </span>
              </div>
            ))}
          </div>
        ))}

        <div className="grid grid-2" style={{ marginTop: "1rem" }}>
          <div>
            <h3>Inclusions</h3>
            <ul>
              {o.inclusions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Exclusions</h3>
            <ul>
              {o.exclusions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>

        {copy.highlights.length > 0 && (
          <>
            <h3>Highlights</h3>
            <ul>
              {copy.highlights.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        )}
        {copy.tips.length > 0 && (
          <>
            <h3>Travel tips</h3>
            <ul>
              {copy.tips.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        )}
        {copy.alternatives.length > 0 && (
          <>
            <h3>Optional add-ons (on request)</h3>
            <ul>
              {copy.alternatives.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        )}

        <h3>Terms</h3>
        <ul className="muted" style={{ fontSize: "0.85rem" }}>
          {s.terms.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          {s.companyName} · {s.phone} · {s.email}
        </p>
      </div>
    </div>
  );
}

function whatsappText(o: PackageOption, req: TripRequest, copy: AiCopy, company: string, phone: string): string {
  const lines = [
    `*${copy.title}*`,
    copy.tagline,
    "",
    `📅 ${formatDate(req.startDate)} → ${formatDate(o.itinerary[o.itinerary.length - 1].date)} (${o.totalNights}N/${o.totalDays}D)`,
    `👥 ${plural(req.members, "traveller")}`,
    "",
    "*Stays*",
    ...o.stays.map((s) => `🏨 ${s.city}: ${s.property.name} (${s.property.stars}★), ${plural(s.nights, "night")}, ${MEAL_PLAN[s.mealPlan]}`),
    "",
    "*Plan*",
    ...o.itinerary.map((d) => {
      const acts = d.entries.filter((e) => e.kind === "activity" || e.kind === "travel").map((e) => `${e.time} ${e.title}`);
      return `Day ${d.day}: ${acts.join(" · ") || d.city}`;
    }),
    "",
    `💰 *${inr(o.price.finalPrice)}* total (≈ ${inr(o.price.perPerson)}/person), incl. GST`,
    "",
    `${company} · ${phone}`,
  ];
  return lines.join("\n");
}

// ---------------- Admin breakdown (internal) ----------------

const CATEGORIES: CostCategory[] = ["Hotel", "Transport", "Train/Bus", "Activities", "Food", "Other"];

function AdminBreakdown(props: { option: PackageOption; request: TripRequest }) {
  const o = props.option;
  const p = o.price;
  const byCat = CATEGORIES.map((c) => ({ c, cost: o.lineItems.filter((l) => l.category === c).reduce((s, l) => s + l.cost, 0) })).filter((x) => x.cost > 0);

  return (
    <div className="stack">
      <div className="card admin-box">
        <div className="label">Admin only — never shown to the customer</div>
        <h2 style={{ marginTop: "0.4rem" }}>{o.title}</h2>
        <div className="kpis">
          <Kpi l="Customer price" v={inr(p.finalPrice)} />
          <Kpi l="Your cost" v={inr(p.cost)} />
          <Kpi l="Your profit" v={inr(p.profit)} />
          <Kpi l="Margin" v={`${p.marginPercent}%`} />
          <Kpi l="GST" v={inr(p.gst)} />
          <Kpi l="Rack value (B2C)" v={inr(p.rackValue)} />
        </div>
        {props.request.budget > 0 && (
          <div className={`alert ${o.budgetStatus === "within" ? "good" : "warn"}`} style={{ marginTop: "0.6rem" }}>
            Budget {inr(props.request.budget)}: {o.budgetStatus === "within" ? `${inr(o.budgetDiff)} under budget` : `${inr(-o.budgetDiff)} over budget`}
          </div>
        )}
      </div>

      {o.warnings.length > 0 && (
        <div className="alert warn">
          <strong>Check before sending</strong>
          <ul>
            {o.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>Cost by category</h3>
          <table>
            <tbody>
              {byCat.map((x) => (
                <tr key={x.c}>
                  <td>{x.c}</td>
                  <td className="r num">{inr(x.cost)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Your cost</td>
                <td className="r num">{inr(p.cost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Price build-up</h3>
          <table>
            <tbody>
              <tr><td>Your cost</td><td className="r num">{inr(p.cost)}</td></tr>
              <tr><td>Markup (tier rule)</td><td className="r num">{inr(p.markup)}</td></tr>
              <tr><td>Rounding to a clean price</td><td className="r num">{inr(p.preTax - p.cost - p.markup)}</td></tr>
              <tr><td>Taxable value</td><td className="r num">{inr(p.preTax)}</td></tr>
              <tr><td>GST</td><td className="r num">{inr(p.gst)}</td></tr>
              <tr className="total"><td>Customer price</td><td className="r num">{inr(p.finalPrice)}</td></tr>
              {p.agentCommission > 0 && <tr><td>Agent commission (paid out)</td><td className="r num">−{inr(p.agentCommission)}</td></tr>}
              <tr className="total"><td>Your profit</td><td className="r num">{inr(p.profit)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Line items (exact calculation)</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Item</th>
                <th>Calculation</th>
                <th className="r">Cost</th>
                <th className="r">B2C value</th>
              </tr>
            </thead>
            <tbody>
              {o.lineItems.map((l, i) => (
                <tr key={i}>
                  <td>{l.category}</td>
                  <td>{l.label}</td>
                  <td className="muted num">{l.formula}</td>
                  <td className="r num">{inr(l.cost)}</td>
                  <td className="r num muted">{inr(l.rack)}</td>
                </tr>
              ))}
              <tr className="total">
                <td colSpan={3}>Total</td>
                <td className="r num">{inr(p.cost)}</td>
                <td className="r num">{inr(p.rackValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Transport plan</h3>
        <p className="muted">{o.transportPlan === "private-cab" ? "Private cab for the full trip" : "Train / bus between cities, cab for transfers and sightseeing"}</p>
        <table>
          <tbody>
            {o.legs.map((l, i) => (
              <tr key={i}>
                <td className="num">{formatDate(l.date)}</td>
                <td>{l.from} → {l.to}</td>
                <td>{l.description}</td>
                <td className="num">{l.departs} → {l.arrives}{l.dayOffset ? " (+1)" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {o.stays.some((s) => s.alternatives.length) && (
        <div className="card">
          <h3>Alternative hotels (same tier)</h3>
          <table>
            <tbody>
              {o.stays.flatMap((s) =>
                s.alternatives.map((a) => (
                  <tr key={s.city + a.property.id}>
                    <td>{s.city}</td>
                    <td>{a.property.name} — {a.roomType.name}</td>
                    <td className="r num">{inr(a.cost)} stay cost</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ l, v }: { l: string; v: string }) {
  return (
    <div className="kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
    </div>
  );
}
