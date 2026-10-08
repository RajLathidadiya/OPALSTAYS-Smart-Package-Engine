import { useEffect, useState } from "react";
import type { Database, Tier, TripRequest } from "./engine/types";
import { generateQuote } from "./engine/packages";
import { uid } from "./engine/util";
import { getPin, loadDb, loadQuotes, saveDb, saveQuotes, type SavedQuote } from "./store/db";
import { QuoteForm } from "./ui/QuoteForm";
import { OptionsPage } from "./ui/OptionsPage";
import { PackagePage } from "./ui/PackagePage";
import { HistoryPage } from "./ui/HistoryPage";
import { AdminPage } from "./ui/admin/AdminPage";

type Route =
  | { page: "new" }
  | { page: "quote"; id: string; tier?: Tier }
  | { page: "history" }
  | { page: "admin" };

function parseHash(): Route {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "quote" && parts[1]) return { page: "quote", id: parts[1], tier: (parts[2] as Tier) || undefined };
  if (parts[0] === "history") return { page: "history" };
  if (parts[0] === "admin") return { page: "admin" };
  return { page: "new" };
}

function go(path: string) {
  window.location.hash = `#/${path}`;
  window.scrollTo(0, 0);
}

const MODE_KEY = "opalstays.customerMode";
function readMode(): boolean {
  try {
    return sessionStorage.getItem(MODE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeMode(on: boolean) {
  try {
    sessionStorage.setItem(MODE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [db, setDb] = useState<Database>(loadDb);
  const [quotes, setQuotes] = useState<SavedQuote[]>(loadQuotes);
  const [route, setRoute] = useState<Route>(parseHash);
  const [customerMode, setCustomerMode] = useState(readMode);
  const [draft, setDraft] = useState<TripRequest | undefined>();
  const [saveError, setSaveError] = useState(false);
  const adminMode = !customerMode;

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const updateDb = (next: Database) => {
    setDb(next);
    setSaveError(!saveDb(next));
  };
  const updateQuotes = (next: SavedQuote[]) => {
    setQuotes(next);
    setSaveError(!saveQuotes(next));
  };
  const updateQuote = (q: SavedQuote) => updateQuotes(quotes.map((x) => (x.id === q.id ? q : x)));

  const toggleMode = () => {
    if (customerMode) {
      const pin = getPin();
      if (pin && prompt("Enter PIN to leave customer mode") !== pin) return;
      setCustomerMode(false);
      writeMode(false);
    } else {
      setCustomerMode(true);
      writeMode(true);
      if (route.page === "admin" || route.page === "history") go("new");
    }
  };

  const generate = (req: TripRequest) => {
    const result = generateQuote(db, req);
    const saved: SavedQuote = { id: uid("q"), savedAt: new Date().toISOString(), result, status: "draft", copies: {} };
    updateQuotes([saved, ...quotes]);
    setDraft(req);
    go(`quote/${saved.id}`);
  };

  const quote = route.page === "quote" ? quotes.find((q) => q.id === route.id) : undefined;
  const option = quote && route.page === "quote" && route.tier ? quote.result.options.find((o) => o.tier === route.tier) : undefined;

  let body: JSX.Element;
  if (route.page === "admin" && adminMode) {
    body = <AdminPage db={db} onChange={updateDb} />;
  } else if (route.page === "history" && adminMode) {
    body = <HistoryPage quotes={quotes} onOpen={(id) => go(`quote/${id}`)} onUpdate={updateQuote} onDelete={(id) => updateQuotes(quotes.filter((q) => q.id !== id))} />;
  } else if (route.page === "quote" && quote && option) {
    body = (
      <PackagePage
        db={db}
        option={option}
        request={quote.result.request}
        copy={quote.copies?.[option.tier]}
        adminMode={adminMode}
        onCopy={(copy) => updateQuote({ ...quote, copies: { ...quote.copies, [option.tier]: copy } })}
        onBack={() => go(`quote/${quote.id}`)}
      />
    );
  } else if (route.page === "quote" && quote) {
    body = (
      <OptionsPage
        quote={quote}
        adminMode={adminMode}
        onOpen={(tier) => go(`quote/${quote.id}/${tier}`)}
        onEdit={() => {
          setDraft(quote.result.request);
          go("new");
        }}
      />
    );
  } else if (route.page === "quote") {
    body = <div className="card">Quote not found. It may have been deleted or saved in another browser.</div>;
  } else {
    body = (
      <>
        <h1>New package</h1>
        <QuoteForm key={JSON.stringify(draft ?? "")} db={db} initial={draft} onGenerate={generate} />
      </>
    );
  }

  const nav: { path: string; label: string; page: Route["page"]; admin?: boolean }[] = [
    { path: "new", label: "New quote", page: "new" },
    { path: "history", label: "Saved quotes", page: "history", admin: true },
    { path: "admin", label: "Admin / Database", page: "admin", admin: true },
  ];

  return (
    <>
      <header className="topbar no-print">
        <div className="brand">
          {db.settings.companyName}
          <span>Smart Package Engine</span>
        </div>
        <nav className="nav">
          {nav
            .filter((n) => adminMode || !n.admin)
            .map((n) => (
              <button key={n.path} className={route.page === n.page ? "active" : ""} onClick={() => go(n.path)}>
                {n.label}
              </button>
            ))}
        </nav>
        <div className="spacer" />
        <button className="btn small" onClick={toggleMode} title="Customer mode hides all costs and profit">
          {customerMode ? "🔒 Customer mode" : "👁 Admin mode"}
        </button>
      </header>
      <main className="main">
        {saveError && <div className="alert bad no-print" style={{ marginBottom: "1rem" }}>Could not save to browser storage. Download a backup from Admin → Backup.</div>}
        {body}
      </main>
    </>
  );
}
