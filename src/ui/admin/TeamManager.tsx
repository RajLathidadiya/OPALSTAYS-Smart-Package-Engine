import { useRef, useState } from "react";
import type { Database } from "../../engine/types";
import { downloadJson } from "../../store/db";
import {
  buildTeamFile,
  makeUser,
  newDataKey,
  normalizeId,
  setSyncedVersion,
  setUnpublished,
  TEAM_FILE,
  type Role,
  type Session,
  type TeamFile,
  type TeamUser,
} from "../../store/team";

/** Readable random password, e.g. "Opal-k7m2-x9qd". */
export function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => chars[b % chars.length]).join("");
  return `Opal-${pick(4)}-${pick(4)}`;
}

export function TeamManager(props: {
  db: Database;
  file?: TeamFile;
  session?: Session;
  onPublished: (file: TeamFile, session: Session) => void;
}) {
  const dataKey = useRef(props.session?.dataKey ?? newDataKey()).current;
  const [users, setUsers] = useState<TeamUser[]>(props.file?.users ?? []);
  const [changed, setChanged] = useState(false);
  const [newPasswords, setNewPasswords] = useState<{ id: string; password: string }[]>([]);
  const [form, setForm] = useState({ id: "", name: "", role: "staff" as Role, password: generatePassword() });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const me = props.session?.user.id;

  const remember = (id: string, password: string) => setNewPasswords((list) => [...list.filter((x) => x.id !== id), { id, password }]);

  const addUser = async () => {
    setError("");
    const id = normalizeId(form.id);
    if (!/^[a-z0-9._-]{3,30}$/.test(id)) return setError("User ID: 3–30 letters or numbers, no spaces.");
    if (users.some((u) => u.id === id)) return setError("That user ID already exists.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    const user = await makeUser(dataKey, { id, name: form.name || id, role: form.role }, form.password);
    setUsers([...users, user]);
    remember(id, form.password);
    setForm({ id: "", name: "", role: "staff", password: generatePassword() });
    setChanged(true);
    setBusy(false);
  };

  const resetPassword = async (u: TeamUser) => {
    const typed = prompt(`New password for ${u.id} (min 8 characters). Leave as is to use this generated one:`, generatePassword());
    if (!typed) return;
    if (typed.length < 8) return alert("Password must be at least 8 characters.");
    const fresh = await makeUser(dataKey, u, typed);
    setUsers(users.map((x) => (x.id === u.id ? fresh : x)));
    remember(u.id, typed);
    setChanged(true);
  };

  const update = (id: string, patch: Partial<TeamUser>) => {
    setUsers(users.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    setChanged(true);
  };

  const remove = (u: TeamUser) => {
    if (!confirm(`Remove ${u.name} (${u.id})? They will be logged out after you publish.`)) return;
    setUsers(users.filter((x) => x.id !== u.id));
    setChanged(true);
  };

  const admins = users.filter((u) => u.role === "admin").length;

  const publish = async () => {
    setBusy(true);
    try {
      const file = await buildTeamFile(props.db, dataKey, users);
      downloadJson(TEAM_FILE, file);
      setSyncedVersion(file.publishedAt);
      setUnpublished(false);
      setChanged(false);
      const mine = users.find((u) => u.id === me) ?? users.find((u) => u.role === "admin")!;
      props.onPublished(file, { user: { id: mine.id, name: mine.name, role: mine.role }, dataKey });
      setMsg(`${TEAM_FILE} downloaded. Upload it to GitHub (steps below) to make it live.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h3>Logins</h3>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          <strong>Admin</strong>: everything, including cost, profit and rate editing. <strong>Staff</strong>: makes quotes and sees customer prices only.
        </p>
        <div className="table-wrap">
          <table className="edit">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.id}</strong>
                    {u.id === me && <span className="badge brand" style={{ marginLeft: "0.4rem" }}>you</span>}
                  </td>
                  <td>
                    <input value={u.name} onChange={(e) => update(u.id, { name: e.target.value })} />
                  </td>
                  <td>
                    <select
                      value={u.role}
                      disabled={u.id === me}
                      onChange={(e) => update(u.id, { role: e.target.value as Role })}
                    >
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <div className="row" style={{ gap: "0.25rem", flexWrap: "nowrap" }}>
                      <button className="btn small" onClick={() => resetPassword(u)}>New password</button>
                      {u.id !== me && (
                        <button className="btn small danger" onClick={() => remove(u)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={4} className="muted">No logins yet. Add yourself as Admin first.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: "0.5rem" }}>Add login</h3>
        <div className="grid grid-2">
          <label className="field">User ID<input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="e.g. priya" autoCapitalize="none" /></label>
          <label className="field">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Shah" /></label>
          <label className="field">Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="field">Password<input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        </div>
        {error && <div className="alert bad">{error}</div>}
        <div>
          <button className="btn" disabled={busy} onClick={addUser}>+ Add login</button>
        </div>

        {newPasswords.length > 0 && (
          <div className="alert warn">
            <strong>Write these down now. Passwords can't be seen again later.</strong>
            <ul>
              {newPasswords.map((p) => (
                <li key={p.id}>
                  {p.id}: <code>{p.password}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card stack">
        <h3>Publish to team</h3>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          Creates <code>{TEAM_FILE}</code> with these logins and all current rates (properties, transport, activities, pricing). Do this after you
          change rates or logins.
        </p>
        {admins === 0 && users.length > 0 && <div className="alert warn">Keep at least one Admin login.</div>}
        {changed && <div className="alert warn">Login changes are not live until you publish and upload.</div>}
        <div>
          <button className="btn primary" disabled={busy || admins === 0} onClick={publish}>
            Download {TEAM_FILE}
          </button>
        </div>
        {msg && <div className="alert good">{msg}</div>}
        <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
          <li>Open your repository on GitHub, then the <strong>public</strong> folder.</li>
          <li>
            <strong>Add file → Upload files</strong>, drop <code>{TEAM_FILE}</code>, then <strong>Commit changes</strong>.
          </li>
          <li>Wait 1–2 minutes. Everyone gets the new rates the next time they open the link.</li>
        </ol>
      </div>
    </div>
  );
}
