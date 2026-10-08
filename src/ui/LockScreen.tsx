import { useState } from "react";

export function LockScreen(props: { company: string; onUnlock: (password: string) => Promise<void> }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className="main" style={{ maxWidth: 420, paddingTop: "15vh" }}>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await props.onUnlock(pw);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not unlock.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand">{props.company}</div>
        <h2>Team password</h2>
        <p className="muted">Enter the password your admin shared with you. You only need to do this once on this device.</p>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" />
        {error && <div className="alert bad">{error}</div>}
        <button className="btn primary" disabled={!pw || busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
