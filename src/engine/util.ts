// Small deterministic helpers: dates (UTC, no timezone drift), times, money.

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function daysBetween(fromIso: string, toIsoDate: string): number {
  return Math.round((parseDate(toIsoDate).getTime() - parseDate(fromIso).getTime()) / 86_400_000);
}

export function weekday(iso: string): number {
  return parseDate(iso).getUTCDay();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDate(iso: string): string {
  const d = parseDate(iso);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return toIso(parseDate(iso)) === iso;
}

/** True when MM-DD of `iso` falls inside a recurring [from, to] window (inclusive, wraps over new year). */
export function inSeason(iso: string, from: string, to: string): boolean {
  const md = iso.slice(5);
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

export function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Round minutes up to the next quarter hour, for customer-friendly times. */
export function ceilQuarter(mins: number): number {
  return Math.ceil(mins / 15) * 15;
}

export function inr(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}₹${Math.abs(Math.round(amount)).toLocaleString("en-IN")}`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

export function sameCity(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
