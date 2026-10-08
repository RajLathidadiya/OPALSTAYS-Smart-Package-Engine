import { useRef, useState } from "react";
import type { Activity, ActivityCategory, BusRoute, CabRate, Database, Distance, Settings, Tier, TierSettings, TrainClass, TrainRoute } from "../../engine/types";
import { TIERS } from "../../engine/types";
import { uid } from "../../engine/util";
import { TIER_LABEL } from "../../engine/packages";
import { downloadJson, getApiKey, getPin, loadQuotes, parseBackup, resetDb, setApiKey, setPin } from "../../store/db";
import { encryptDb, getTeamPassword, setSyncedVersion, setTeamPassword, TEAM_FILE } from "../../store/team";
import { formatDate } from "../../engine/util";
import { EditableTable } from "./EditableTable";
import { PropertiesEditor } from "./PropertiesEditor";

type Section = "properties" | "transport" | "activities" | "settings" | "backup";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "properties", label: "Properties" },
  { id: "transport", label: "Transport" },
  { id: "activities", label: "Activities" },
  { id: "settings", label: "Pricing & settings" },
  { id: "backup", label: "Backup" },
];

const CATEGORIES: ActivityCategory[] = ["Sightseeing", "Safari", "Boating", "Adventure", "Cultural", "Entry Ticket", "Guide", "Local Experience"];

export function AdminPage(props: { db: Database; onChange: (db: Database) => void; teamPublishedAt?: string }) {
  const [section, setSection] = useState<Section>("properties");
  const { db } = props;
  const patch = (p: Partial<Database>) => props.onChange({ ...db, ...p });

  return (
    <div className="stack">
      <div className="tabs">
        {SECTIONS.map((s) => (
          <button key={s.id} className={section === s.id ? "active" : ""} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="muted" style={{ fontSize: "0.85rem" }}>
        Changes save automatically in this browser.
        {props.teamPublishedAt
          ? ` Team rates last published ${formatDate(props.teamPublishedAt.slice(0, 10))}. To give your changes to the team, use Backup → Share with team.`
          : " To give these rates to your team, use Backup → Share with team."}
      </div>

      {section === "properties" && <PropertiesEditor rows={db.properties} onChange={(properties) => patch({ properties })} />}

      {section === "transport" && (
        <div className="stack">
          <EditableTable<TrainRoute>
            title="Trains"
            hint="Approximate fares per person. Fares format: 3A:780, 2A:1100, SL:320. Day +1 = arrives next day (only allowed for the journey home)."
            rows={db.trains}
            onChange={(trains) => patch({ trains })}
            newRow={() => ({ id: uid("train"), from: "", to: "", trainNo: "", name: "", fromStation: "", toStation: "", departs: "06:00", arrives: "12:00", dayOffset: 0, runsOn: [0, 1, 2, 3, 4, 5, 6], fares: { "3A": 800 } })}
            columns={[
              { key: "from", label: "From", type: "text", width: "7rem" },
              { key: "to", label: "To", type: "text", width: "7rem" },
              { key: "trainNo", label: "No.", type: "text", width: "6rem" },
              { key: "name", label: "Name", type: "text", width: "10rem" },
              { key: "fromStation", label: "From stn", type: "text", width: "8rem" },
              { key: "toStation", label: "To stn", type: "text", width: "8rem" },
              { key: "departs", label: "Dep", type: "time" },
              { key: "arrives", label: "Arr", type: "time" },
              { key: "dayOffset", label: "Day +", type: "number", width: "3.5rem" },
              { key: "runsOn", label: "Runs on", type: "weekdays" },
              { key: "fares", label: "Fares ₹", type: "fares", width: "11rem" },
            ]}
          />
          <EditableTable<BusRoute>
            title="Buses"
            rows={db.buses}
            onChange={(buses) => patch({ buses })}
            newRow={() => ({ id: uid("bus"), from: "", to: "", operator: "", busType: "AC Seater", ac: true, departs: "07:00", arrives: "13:00", dayOffset: 0, fare: 600 })}
            columns={[
              { key: "from", label: "From", type: "text", width: "7rem" },
              { key: "to", label: "To", type: "text", width: "7rem" },
              { key: "operator", label: "Operator", type: "text", width: "9rem" },
              { key: "busType", label: "Type", type: "text", width: "8rem" },
              { key: "ac", label: "AC", type: "bool" },
              { key: "departs", label: "Dep", type: "time" },
              { key: "arrives", label: "Arr", type: "time" },
              { key: "dayOffset", label: "Day +", type: "number", width: "3.5rem" },
              { key: "fare", label: "Fare ₹/seat", type: "number", width: "5.5rem" },
            ]}
          />
          <EditableTable<CabRate>
            title="Cabs & vehicles"
            hint="Outstation = max(km, min km/day × days) × ₹/km + (driver + toll/parking) × days. Local day = 8 hr / 80 km. Transfer = one way station ↔ hotel."
            rows={db.cabs}
            onChange={(cabs) => patch({ cabs })}
            newRow={() => ({ id: uid("cab"), vehicle: "", capacity: 4, ac: true, tiers: ["budget", "premium", "luxury"], perKm: 12, minKmPerDay: 250, driverAllowancePerDay: 300, tollParkingPerDay: 200, localDayRate: 2200, transferRate: 700 })}
            columns={[
              { key: "vehicle", label: "Vehicle", type: "text", width: "10rem" },
              { key: "capacity", label: "Seats", type: "number", width: "3.5rem" },
              { key: "ac", label: "AC", type: "bool" },
              { key: "tiers", label: "Tiers", type: "tiers" },
              { key: "perKm", label: "₹/km", type: "number", width: "4rem" },
              { key: "minKmPerDay", label: "Min km/day", type: "number", width: "4.5rem" },
              { key: "driverAllowancePerDay", label: "Driver ₹/day", type: "number", width: "4.5rem" },
              { key: "tollParkingPerDay", label: "Toll ₹/day", type: "number", width: "4.5rem" },
              { key: "localDayRate", label: "Local day ₹", type: "number", width: "5rem" },
              { key: "transferRate", label: "Transfer ₹", type: "number", width: "5rem" },
            ]}
          />
          <EditableTable<Distance>
            title="Road distances"
            hint="Used for cab plans. Works in both directions."
            rows={db.distances}
            onChange={(distances) => patch({ distances })}
            newRow={() => ({ id: uid("dist"), from: "", to: "", km: 100, driveHours: 2 })}
            columns={[
              { key: "from", label: "From", type: "text", width: "8rem" },
              { key: "to", label: "To", type: "text", width: "8rem" },
              { key: "km", label: "km", type: "number", width: "5rem" },
              { key: "driveHours", label: "Drive hrs", type: "number", width: "5rem" },
            ]}
          />
        </div>
      )}

      {section === "activities" && (
        <EditableTable<Activity>
          title="Activities, tickets & guides"
          hint="Slot: morning 09:30–13:00, afternoon 14:00–17:00, sunset 17:15–19:00, evening 19:15–21:00. Higher priority is scheduled first. Needs cab = adds a local sightseeing cab that day."
          rows={db.activities}
          onChange={(activities) => patch({ activities })}
          newRow={() => ({ id: uid("act"), city: "", name: "", category: "Sightseeing", slot: "morning", durationMins: 120, pricing: "per-person", groupSize: 1, b2b: 0, b2c: 0, tiers: ["budget", "premium", "luxury"], priority: 5, needsCab: true, active: true, description: "" })}
          columns={[
            { key: "active", label: "On", type: "bool" },
            { key: "city", label: "City", type: "text", width: "7rem" },
            { key: "name", label: "Name", type: "text", width: "13rem" },
            { key: "category", label: "Category", type: "select", options: CATEGORIES },
            { key: "slot", label: "Slot", type: "select", options: ["morning", "afternoon", "sunset", "evening"] },
            { key: "durationMins", label: "Mins", type: "number", width: "4rem" },
            { key: "pricing", label: "Pricing", type: "select", options: ["per-person", "per-group"] },
            { key: "groupSize", label: "Group", type: "number", width: "3.5rem" },
            { key: "b2b", label: "B2B ₹", type: "number", width: "5rem" },
            { key: "b2c", label: "B2C ₹", type: "number", width: "5rem" },
            { key: "tiers", label: "Tiers", type: "tiers" },
            { key: "priority", label: "Prio", type: "number", width: "3.5rem" },
            { key: "needsCab", label: "Cab", type: "bool" },
            { key: "description", label: "Description", type: "text", width: "14rem" },
          ]}
        />
      )}

      {section === "settings" && <SettingsEditor settings={db.settings} onChange={(settings) => patch({ settings })} />}
      {section === "backup" && (
        <>
          <ShareWithTeam db={db} />
          <Backup db={db} onChange={props.onChange} />
        </>
      )}
    </div>
  );
}

function SettingsEditor({ settings: s, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...s, [k]: v });
  const setTier = (t: Tier, patch: Partial<TierSettings>) => set("tiers", { ...s.tiers, [t]: { ...s.tiers[t], ...patch } });
  const [key, setKey] = useState(getApiKey());
  const [pin, setPinState] = useState(getPin());
  const num = (v: string) => Number(v) || 0;

  return (
    <div className="stack">
      <div className="card stack">
        <h3>Company</h3>
        <div className="grid grid-2">
          <label className="field">Company name<input value={s.companyName} onChange={(e) => set("companyName", e.target.value)} /></label>
          <label className="field">Phone<input value={s.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label className="field">Email<input value={s.email} onChange={(e) => set("email", e.target.value)} /></label>
        </div>
      </div>

      <div className="card stack">
        <h3>Tax, commission & rounding</h3>
        <div className="grid grid-2">
          <label className="field">GST %<input type="number" step="0.5" value={s.gstPercent} onChange={(e) => set("gstPercent", num(e.target.value))} /></label>
          <label className="field">GST applies on
            <select value={s.gstMode} onChange={(e) => set("gstMode", e.target.value as Settings["gstMode"])}>
              <option value="on-total">Total package value</option>
              <option value="on-margin">Margin only</option>
            </select>
          </label>
          <label className="field">Sub-agent commission % (of taxable value)<input type="number" step="0.5" value={s.agentCommissionPercent} onChange={(e) => set("agentCommissionPercent", num(e.target.value))} /></label>
          <label className="field">Contingency / other % (of base cost)<input type="number" step="0.5" value={s.contingencyPercent} onChange={(e) => set("contingencyPercent", num(e.target.value))} /></label>
          <label className="field">Round final price
            <select value={s.rounding} onChange={(e) => set("rounding", e.target.value as Settings["rounding"])}>
              <option value="x999">Up to …,999 (₹36,999)</option>
              <option value="x99">Up to …99 (₹36,199)</option>
              <option value="x00">Up to …00 (₹36,200)</option>
              <option value="none">No rounding</option>
            </select>
          </label>
          <label className="field">Private cab: local km per sightseeing day<input type="number" value={s.localKmPerCityDay} onChange={(e) => set("localKmPerCityDay", num(e.target.value))} /></label>
          <label className="field">Default road departure time<input type="time" value={s.cabStartTime} onChange={(e) => set("cabStartTime", e.target.value)} /></label>
        </div>
        <div className="muted" style={{ fontSize: "0.85rem" }}>Confirm GST rates and mode with your CA. Tour operator packages are commonly 5% on the total value without input tax credit.</div>
      </div>

      <div className="card stack">
        <h3>Package tiers</h3>
        <div className="table-wrap">
          <table className="edit">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Markup %</th>
                <th>Min profit ₹/person</th>
                <th>Train classes (preference)</th>
                <th>Transport</th>
                <th>Breakfast ₹</th>
                <th>Lunch ₹</th>
                <th>Dinner ₹</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => {
                const ts = s.tiers[t];
                return (
                  <tr key={t}>
                    <td><strong>{TIER_LABEL[t]}</strong></td>
                    <td><input type="number" step="0.5" value={ts.markupPercent} onChange={(e) => setTier(t, { markupPercent: num(e.target.value) })} /></td>
                    <td><input type="number" value={ts.minProfitPerPerson} onChange={(e) => setTier(t, { minProfitPerPerson: num(e.target.value) })} /></td>
                    <td>
                      <input
                        defaultValue={ts.trainClasses.join(", ")}
                        onBlur={(e) => setTier(t, { trainClasses: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) as TrainClass[] })}
                      />
                    </td>
                    <td>
                      <select value={ts.transport} onChange={(e) => setTier(t, { transport: e.target.value as TierSettings["transport"] })}>
                        <option value="cheapest">Cheapest</option>
                        <option value="prefer-public">Prefer train/bus</option>
                        <option value="prefer-cab">Prefer private cab</option>
                      </select>
                    </td>
                    {(["breakfast", "lunch", "dinner"] as const).map((m) => (
                      <td key={m}>
                        <input type="number" value={ts.foodPerMeal[m]} onChange={(e) => setTier(t, { foodPerMeal: { ...ts.foodPerMeal, [m]: num(e.target.value) } })} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: "0.85rem" }}>Meal rates are per person per meal, charged only for meals the customer wants that the hotel plan does not include.</div>
      </div>

      <div className="card stack">
        <h3>AI itinerary writer (optional)</h3>
        <div className="grid grid-2">
          <label className="field">
            Anthropic API key (stored only in this browser)
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => setApiKey(key.trim())} placeholder="sk-ant-…" autoComplete="off" />
          </label>
          <label className="field">Model<input value={s.aiModel} onChange={(e) => set("aiModel", e.target.value)} /></label>
          <label className="field">Effort
            <select value={s.aiEffort} onChange={(e) => set("aiEffort", e.target.value as Settings["aiEffort"])}>
              <option value="low">Low (fastest)</option>
              <option value="medium">Medium</option>
              <option value="high">High (best writing)</option>
            </select>
          </label>
        </div>
        <div className="muted" style={{ fontSize: "0.85rem" }}>
          The AI only receives hotel names, places and the timetable. It never sees costs, markup or profit, and it cannot change prices or times.
        </div>
      </div>

      <div className="card stack">
        <h3>Customer mode PIN</h3>
        <label className="field">
          PIN needed to leave customer mode (empty = no PIN)
          <input value={pin} onChange={(e) => setPinState(e.target.value)} onBlur={() => setPin(pin.trim())} inputMode="numeric" />
        </label>
        <div className="muted" style={{ fontSize: "0.85rem" }}>Customer mode hides every cost and profit figure, for showing the screen to a customer.</div>
      </div>

      <div className="card stack">
        <h3>Terms shown on quotes</h3>
        <textarea rows={5} value={s.terms.join("\n")} onChange={(e) => set("terms", e.target.value.split("\n"))} onBlur={() => set("terms", s.terms.map((t) => t.trim()).filter(Boolean))} />
      </div>
    </div>
  );
}

function Backup({ db, onChange }: { db: Database; onChange: (db: Database) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="card stack">
      <h3>Backup & restore</h3>
      <p className="muted">Your data lives only in this browser. Download a backup regularly, and use it to move to another computer.</p>
      <div className="row">
        <button className="btn primary" onClick={() => downloadJson(`opalstays-database-${stamp}.json`, db)}>Download database backup</button>
        <button className="btn" onClick={() => downloadJson(`opalstays-quotes-${stamp}.json`, loadQuotes())}>Download saved quotes</button>
        <button className="btn" onClick={() => file.current?.click()}>Restore from backup…</button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              onChange(parseBackup(await f.text()));
              setMsg("Backup restored.");
            } catch (err) {
              setMsg(err instanceof Error ? err.message : "Could not read that file.");
            }
            e.target.value = "";
          }}
        />
      </div>
      <div className="row">
        <button
          className="btn danger"
          onClick={() => {
            if (confirm("Replace ALL your data with the sample data? Download a backup first.")) {
              onChange(resetDb());
              setMsg("Sample data loaded.");
            }
          }}
        >
          Reset to sample data
        </button>
      </div>
      {msg && <div className="alert good">{msg}</div>}
    </div>
  );
}

function ShareWithTeam({ db }: { db: Database }) {
  const [pw, setPw] = useState(getTeamPassword());
  const [pw2, setPw2] = useState(getTeamPassword());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const tooShort = pw.length < 8;

  const publish = async () => {
    setBusy(true);
    try {
      const env = await encryptDb(db, pw);
      downloadJson(TEAM_FILE, env);
      setTeamPassword(pw);
      setSyncedVersion(env.publishedAt);
      setMsg(`${TEAM_FILE} downloaded. Now upload it to GitHub (steps below).`);
    } catch {
      setMsg("Could not create the file. Use a modern browser on https or localhost.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h3>Share with team</h3>
      <p className="muted">
        Creates <code>{TEAM_FILE}</code>: all properties, transport, activities and pricing settings, locked with a team password. Saved quotes and
        your AI key are not included.
      </p>
      <div className="grid grid-2">
        <label className="field">
          Team password (min 8 characters)
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field">
          Repeat password
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </label>
      </div>
      {pw && tooShort && <div className="alert warn">Use at least 8 characters.</div>}
      {pw2 && pw !== pw2 && <div className="alert warn">Passwords do not match.</div>}
      <div>
        <button className="btn primary" disabled={busy || tooShort || pw !== pw2} onClick={publish}>
          {busy ? "Creating…" : `Download ${TEAM_FILE}`}
        </button>
      </div>
      {msg && <div className="alert good">{msg}</div>}
      <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
        <li>On GitHub, open your repository, then the <strong>public</strong> folder.</li>
        <li>Click <strong>Add file → Upload files</strong>, drop <code>{TEAM_FILE}</code>, and click <strong>Commit changes</strong> (replace the old one if asked).</li>
        <li>Wait about 2 minutes. Everyone opening the link gets the new rates automatically.</li>
        <li>Give the team password to your staff in person or on WhatsApp. They enter it once per device.</li>
      </ol>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Changes made on a staff member's computer stay on that computer and are replaced when you publish again. Keep rate editing with one person.
      </p>
    </div>
  );
}
