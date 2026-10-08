// Shared team database. The owner publishes the database as an encrypted file
// (public/team-data.json in the repo). Every team member's browser downloads it
// and unlocks it with the team password, so everyone quotes from the same rates
// while the file stays unreadable to anyone without the password.
import type { Database } from "../engine/types";
import { parseBackup } from "./db";

export const TEAM_FILE = "team-data.json";
const FORMAT = "opalstays-team-v1";
const ITERATIONS = 250_000;
const PASSWORD_KEY = "opalstays.teamPassword";
const SYNCED_KEY = "opalstays.teamVersion";

export interface TeamEnvelope {
  format: typeof FORMAT;
  publishedAt: string;
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  data: string; // base64 AES-GCM ciphertext of the database JSON
}

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

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptDb(db: Database, password: string): Promise<TeamEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const publishedAt = new Date().toISOString();
  const plain = new TextEncoder().encode(JSON.stringify({ ...db, updatedAt: publishedAt }));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  return { format: FORMAT, publishedAt, iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(cipher) };
}

/** Throws if the password is wrong or the file is damaged. */
export async function decryptEnvelope(env: TeamEnvelope, password: string): Promise<Database> {
  const key = await deriveKey(password, fromB64(env.salt), env.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(env.iv) }, key, fromB64(env.data));
  } catch {
    throw new Error("Wrong team password.");
  }
  return parseBackup(new TextDecoder().decode(plain));
}

export function isEnvelope(x: unknown): x is TeamEnvelope {
  const e = x as TeamEnvelope;
  return !!e && e.format === FORMAT && typeof e.data === "string" && typeof e.salt === "string" && typeof e.iv === "string";
}

/** The published file next to the app, or undefined when none has been published yet. */
export async function fetchTeamEnvelope(): Promise<TeamEnvelope | undefined> {
  try {
    const res = await fetch(`./${TEAM_FILE}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return undefined;
    const json = await res.json();
    return isEnvelope(json) ? json : undefined;
  } catch {
    return undefined;
  }
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

export const getTeamPassword = () => get(PASSWORD_KEY);
export const setTeamPassword = (p: string) => put(PASSWORD_KEY, p);
/** publishedAt of the team file this browser last loaded or published. */
export const getSyncedVersion = () => get(SYNCED_KEY);
export const setSyncedVersion = (v: string) => put(SYNCED_KEY, v);
