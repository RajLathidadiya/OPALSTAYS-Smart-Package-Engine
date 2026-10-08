// Shared team database with per-person logins.
//
// public/team-data.json holds the database encrypted with a random data key
// (AES-256-GCM). For every user, that data key is stored again, encrypted with
// a key derived from the user's own password (PBKDF2-SHA256). Logging in with
// an ID and password unlocks the data key, then the database. Nobody without a
// valid login can read the rates, even though the file is public.
import type { Database } from "../engine/types";
import { parseBackup } from "./db";

export const TEAM_FILE = "team-data.json";
const FORMAT = "opalstays-team-v2";
const ITERATIONS = 250_000;
const SESSION_KEY = "opalstays.session";
const SYNCED_KEY = "opalstays.teamVersion";
const DIRTY_KEY = "opalstays.unpublished";

export type Role = "admin" | "staff";

export interface TeamUser {
  id: string; // login ID, lowercase
  name: string;
  role: Role;
  salt: string; // base64
  iterations: number;
  iv: string; // base64
  wrappedKey: string; // data key encrypted with the password-derived key
}

export interface TeamFile {
  format: typeof FORMAT;
  publishedAt: string;
  users: TeamUser[];
  iv: string;
  data: string; // database encrypted with the data key
}

export interface Session {
  user: { id: string; name: string; role: Role };
  dataKey: Uint8Array<ArrayBuffer>; // raw AES key, kept in memory
}

// ---------- encoding ----------

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const aes = (raw: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

async function seal(raw: Uint8Array<ArrayBuffer>, plain: Uint8Array<ArrayBuffer>) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(raw), plain));
  return { iv: toB64(iv), data: toB64(cipher) };
}

async function open(raw: Uint8Array<ArrayBuffer>, iv: string, data: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await aes(raw), fromB64(data)));
}

/** 256-bit key derived from a password; stored in the browser to stay logged in. */
async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, 256));
}

// ---------- building and reading the file ----------

export function newDataKey(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

export async function makeUser(
  dataKey: Uint8Array<ArrayBuffer>,
  u: { id: string; name: string; role: Role },
  password: string,
): Promise<TeamUser> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await passwordKey(password, salt, ITERATIONS);
  const { iv, data } = await seal(kek, dataKey);
  return { id: normalizeId(u.id), name: u.name.trim() || u.id, role: u.role, salt: toB64(salt), iterations: ITERATIONS, iv, wrappedKey: data };
}

export async function buildTeamFile(db: Database, dataKey: Uint8Array<ArrayBuffer>, users: TeamUser[]): Promise<TeamFile> {
  const publishedAt = new Date().toISOString();
  const plain = new TextEncoder().encode(JSON.stringify({ ...db, updatedAt: publishedAt }));
  const { iv, data } = await seal(dataKey, plain);
  return { format: FORMAT, publishedAt, users, iv, data };
}

export async function decryptTeamDb(file: TeamFile, dataKey: Uint8Array<ArrayBuffer>): Promise<Database> {
  return parseBackup(new TextDecoder().decode(await open(dataKey, file.iv, file.data)));
}

async function unwrap(user: TeamUser, kek: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return open(kek, user.iv, user.wrappedKey);
}

/** Log in with ID + password. Throws a user-friendly error on failure. */
export async function login(file: TeamFile, id: string, password: string): Promise<{ session: Session; kek: Uint8Array<ArrayBuffer> }> {
  const user = file.users.find((u) => u.id === normalizeId(id));
  if (!user) throw new Error("Wrong ID or password.");
  const kek = await passwordKey(password, fromB64(user.salt), user.iterations);
  try {
    const dataKey = await unwrap(user, kek);
    return { session: { user: { id: user.id, name: user.name, role: user.role }, dataKey }, kek };
  } catch {
    throw new Error("Wrong ID or password.");
  }
}

/** Re-open a saved login. Returns undefined if the user was removed or the password changed. */
export async function resume(file: TeamFile, saved: StoredLogin): Promise<Session | undefined> {
  const user = file.users.find((u) => u.id === saved.id);
  if (!user) return undefined;
  try {
    const dataKey = await unwrap(user, fromB64(saved.kek));
    return { user: { id: user.id, name: user.name, role: user.role }, dataKey };
  } catch {
    return undefined;
  }
}

export function isTeamFile(x: unknown): x is TeamFile {
  const f = x as TeamFile;
  return !!f && f.format === FORMAT && Array.isArray(f.users) && typeof f.data === "string" && typeof f.iv === "string";
}

/** The published file next to the app, or undefined when none has been published yet. */
export async function fetchTeamFile(): Promise<TeamFile | undefined> {
  try {
    const res = await fetch(`./${TEAM_FILE}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return undefined;
    const json = await res.json();
    return isTeamFile(json) ? json : undefined;
  } catch {
    return undefined;
  }
}

// ---------- browser storage ----------

export interface StoredLogin {
  id: string;
  kek: string; // base64 password-derived key (not the password itself)
}

function get(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function put(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function getStoredLogin(): StoredLogin | undefined {
  try {
    const s = JSON.parse(get(SESSION_KEY)) as StoredLogin;
    return s?.id && s?.kek ? s : undefined;
  } catch {
    return undefined;
  }
}

export const storeLogin = (id: string, kek: Uint8Array) => put(SESSION_KEY, JSON.stringify({ id, kek: toB64(kek) }));
export const clearLogin = () => put(SESSION_KEY, "");
/** publishedAt of the team file this browser last loaded or published. */
export const getSyncedVersion = () => get(SYNCED_KEY);
export const setSyncedVersion = (v: string) => put(SYNCED_KEY, v);
/** Admin changed rates that are not yet in the published team file. */
export const hasUnpublished = () => get(DIRTY_KEY) === "1";
export const setUnpublished = (on: boolean) => put(DIRTY_KEY, on ? "1" : "");
