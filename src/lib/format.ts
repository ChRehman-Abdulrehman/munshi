import type { Lang } from "./types";

export function money(n: number | null | undefined, lang: Lang = "roman"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  return `${sign}Rs ${abs.toLocaleString("en-PK")}`;
}

export function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export function todayISO(): string {
  return new Date().toISOString();
}

export function dateOnly(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const URDU_MONTHS = ["جنوری","فروری","مارچ","اپریل","مئی","جون","جولائی","اگست","ستمبر","اکتوبر","نومبر","دسمبر"];
const EN_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function fmtDate(iso: string, lang: Lang = "roman"): string {
  const d = new Date(iso);
  const day = d.getDate();
  if (lang === "ur") return `${day} ${URDU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `${day} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function fmtDateTime(iso: string, lang: Lang = "roman"): string {
  return `${fmtDate(iso, lang)}, ${fmtTime(iso)}`;
}

export function relTime(iso: string, lang: Lang = "roman"): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (lang === "en") {
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
    return fmtDate(iso, lang);
  }
  if (mins < 1) return "abhi";
  if (mins < 60) return `${mins} minute pehle`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ghante pehle`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "kal";
  if (days < 30) return `${days} din pehle`;
  return fmtDate(iso, lang);
}

export function daysBetween(fromISO: string, toISO?: string): number {
  const a = new Date(fromISO).getTime();
  const b = toISO ? new Date(toISO).getTime() : Date.now();
  return Math.floor((b - a) / 86400000);
}

export function normPhonePK(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^03\d{9}$/.test(digits)) return "+92" + digits.slice(1);
  if (/^923\d{9}$/.test(digits)) return "+" + digits;
  if (/^\+923\d{9}$/.test(digits)) return digits;
  if (/^3\d{9}$/.test(digits)) return "+92" + digits;
  return null;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pctDelta(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "naya" : "—";
  const pct = Math.round(((current - prev) / prev) * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function rangeDays(days: number): { from: string; to: string } {
  const to = new Date();
  const from = startOfDay(new Date(to.getTime() - (days - 1) * 86400000));
  return { from: from.toISOString(), to: to.toISOString() };
}
