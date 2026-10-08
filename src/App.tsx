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
import { LoginScreen } from "./ui/LoginScreen";
import {
  clearLogin,
  decryptTeamDb,
  fetchTeamFile,
  getStoredLogin,
  getSyncedVersion,
  hasUnpublished,
  resume,
  setSyncedVersion,
  setUnpublished,
  storeLogin,
  type Session,
  type TeamFile,
} from "./store/team";
import { formatDate } from "./engine/util";

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
  const [team, setTeam] = useState<{ status: "checking" | "none" | "login" | "ready"; file?: TeamFile; session?: Session; notice?: string }>({
    status: "checking",
  });
  // Without a published team file the app runs in single-user mode with full access.
  const isAdmin = team.status === "none" || team.session?.user.role === "admin";
  const adminMode = isAdmin && !customerMode;
  const userName = team.session?.user.name;

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const updateDb = (next: Database) => {
    setDb(next);
    setSaveError(!saveDb(next));
  };

  /** Start a logged-in session and pull newer team rates into this browser. */
  const startSession = async (file: TeamFile, session: Session) => {
    let notice: string | undefined;
    const keepLocalEdits = session.user.role === "admin" && hasUnpublished();
    if (file.publishedAt !== getSyncedVersion() && !keepLocalEdits) {
      updateDb(await decryptTeamDb(file, session.dataKey));
      setSyncedVersion(file.publishedAt);
      notice = `Rates updated (published ${formatDate(file.publishedAt.slice(0, 10))}).`;
    }
    setTeam({ status: "ready", file, session, notice });
  };

  useEffect(() => {
    (async () => {
      const file = await fetchTeamFile();
      if (!file) return setTeam({ status: "none" });
      const saved = getStoredLogin();
      const session = saved ? await resume(file, saved) : undefined;
      if (session) {
        try {
          await startSession(file, session);
          return;
        } catch {
          /* damaged file or key: log in again */
        }
      }
      clearLogin();
      setTeam({ status: "login", file });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    clearLogin();
    setCustomerMode(false);
    writeMode(false);
    setTeam({ status: "login", file: team.file });
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
    const saved: SavedQuote = { id: uid("q"), savedAt: new Date().toISOString(), result, status: "draft", copies: {}, createdBy: userName };
    updateQuotes([saved, ...quotes]);
    setDraft(req);
    go(`quote/${saved.id}`);
  };

  const quote = route.page === "quote" ? quotes.find((q) => q.id === route.id) : undefined;
  const option = quote && route.page === "quote" && route.tier ? quote.result.options.find((o) => o.tier === route.tier) : undefined;

  if (team.status === "checking") return <div className="main muted">Loading…</div>;
  if (team.status === "login" && team.file) {
    const file = team.file;
    return (
      <LoginScreen
        company={db.settings.companyName}
        file={file}
        onLogin={async (session, kek) => {
          storeLogin(session.user.id, kek);
          await startSession(file, session);
          go("new");
        }}
      />
    );
  }

  let body: JSX.Element;
  if (route.page === "admin" && adminMode) {
    body = (
      <AdminPage
        db={db}
        onChange={(next) => {
          updateDb(next);
          if (team.file) setUnpublished(true);
        }}
        teamFile={team.file}
        session={team.session}
        onPublished={(file, session) => setTeam({ status: "ready", file, session })}
      />
    );
  } else if (route.page === "history" && !customerMode) {
    body = (
      <HistoryPage
        quotes={quotes}
        showProfit={adminMode}
        onOpen={(id) => go(`quote/${id}`)}
        onUpdate={updateQuote}
        onDelete={(id) => updateQuotes(quotes.filter((q) => q.id !== id))}
      />
    );
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

  const nav: { path: string; label: string; page: Route["page"]; show: boolean }[] = [
    { path: "new", label: "New quote", page: "new", show: true },
    { path: "history", label: "Saved quotes", page: "history", show: !customerMode },
    { path: "admin", label: "Admin / Database", page: "admin", show: adminMode },
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
            .filter((n) => n.show)
            .map((n) => (
              <button key={n.path} className={route.page === n.page ? "active" : ""} onClick={() => go(n.path)}>
                {n.label}
              </button>
            ))}
        </nav>
        <div className="spacer" />
        {isAdmin && (
          <button className="btn small" onClick={toggleMode} title="Customer mode hides all costs and profit">
            {customerMode ? "🔒 Customer mode" : "👁 Admin mode"}
          </button>
        )}
        {team.session && (
          <>
            <span className="muted" style={{ fontSize: "0.85rem" }}>{team.session.user.name}</span>
            <button className="btn small" onClick={logout}>
              Logout
            </button>
          </>
        )}
      </header>
      <main className="main">
        {saveError && <div className="alert bad no-print" style={{ marginBottom: "1rem" }}>Could not save to browser storage. Download a backup from Admin → Backup.</div>}
        {adminMode && team.file && hasUnpublished() && (
          <div className="alert warn no-print row" style={{ marginBottom: "1rem" }}>
            <span>You changed rates. Your team gets them only after you publish (Admin → Team).</span>
          </div>
        )}
        {team.notice && (
          <div className="alert good no-print row" style={{ marginBottom: "1rem" }}>
            <span>{team.notice}</span>
            <div className="spacer" />
            <button className="btn small" onClick={() => setTeam({ ...team, notice: undefined })}>OK</button>
          </div>
        )}
        {body}
      </main>
    </>
  );
}
