// Browser storage. Everything lives in this browser's localStorage; use
// Admin → Backup to export/import a JSON file (e.g. to move to another computer).
import { seedDatabase, defaultSettings } from "../data/seed";
import type { Database, QuoteResult, Tier } from "../engine/types";
import type { AiCopy } from "../ai/copy";

const DB_KEY = "opalstays.db.v1";
const QUOTES_KEY = "opalstays.quotes.v1";
const API_KEY = "opalstays.anthropicKey";
const PIN_KEY = "opalstays.adminPin";

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Fill settings added in newer versions so old backups keep working. */
function normalize(db: Database): Database {
  return {
    ...seedDatabase(),
    ...db,
    settings: {
      ...defaultSettings,
      ...db.settings,
      tiers: { ...defaultSettings.tiers, ...(db.settings?.tiers ?? {}) },
    },
  };
}

export function loadDb(): Database {
  const stored = read<Database>(DB_KEY);
  return stored ? normalize(stored) : seedDatabase();
}

export function saveDb(db: Database): boolean {
  return write(DB_KEY, { ...db, updatedAt: new Date().toISOString() });
}

export function resetDb(): Database {
  const db = seedDatabase();
  saveDb(db);
  return db;
}

export function parseBackup(text: string): Database {
  const data = JSON.parse(text) as Partial<Database> & { db?: Database };
  const db = (data.db ?? data) as Database;
  if (!Array.isArray(db.properties) || !Array.isArray(db.activities) || !db.settings) {
    throw new Error("This file is not an OPALSTAYS backup.");
  }
  return normalize(db);
}

export interface SavedQuote {
  id: string;
  savedAt: string;
  result: QuoteResult;
  chosenTier?: Tier;
  copies: Partial<Record<Tier, AiCopy>>;
  status: "draft" | "sent" | "confirmed" | "lost";
  createdBy?: string;
}

export function loadQuotes(): SavedQuote[] {
  return read<SavedQuote[]>(QUOTES_KEY) ?? [];
}

export function saveQuotes(quotes: SavedQuote[]): boolean {
  return write(QUOTES_KEY, quotes.slice(0, 200));
}

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string) {
  try {
    if (key) localStorage.setItem(API_KEY, key);
    else localStorage.removeItem(API_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function getPin(): string {
  try {
    return localStorage.getItem(PIN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPin(pin: string) {
  try {
    if (pin) localStorage.setItem(PIN_KEY, pin);
    else localStorage.removeItem(PIN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
