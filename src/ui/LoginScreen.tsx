import { useState } from "react";
import { login, type Session, type TeamFile } from "../store/team";

export function LoginScreen(props: { company: string; file: TeamFile; onLogin: (session: Session, kek: Uint8Array) => Promise<void> }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className="main" style={{ maxWidth: 420, paddingTop: "12vh" }}>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const { session, kek } = await login(props.file, id, pw);
            await props.onLogin(session, kek);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not log in.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand">{props.company}</div>
        <h2>Login</h2>
        <label className="field">
          User ID
          <input value={id} onChange={(e) => setId(e.target.value)} autoFocus autoComplete="username" autoCapitalize="none" />
        </label>
        <label className="field">
          Password
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <div className="alert bad">{error}</div>}
        <button className="btn primary" disabled={!id || !pw || busy}>
          {busy ? "Logging in…" : "Login"}
        </button>
        <div className="muted" style={{ fontSize: "0.85rem" }}>You stay logged in on this device until you press Logout.</div>
      </form>
    </main>
  );
}
