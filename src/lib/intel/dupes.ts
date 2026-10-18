import type { Customer } from "../types";

export function phoneDigits(c: Customer): string {
  return (c.phone ?? "").replace(/\D/g, "");
}

export function normName(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function findNameDupes(text: string, customers: Customer[]): { name: string; cands: Customer[] } | null {
  const hay = ` ${normName(text)} `;
  const groups = new Map<string, Customer[]>();
  for (const c of customers) {
    const k = normName(c.name);
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(c);
    groups.set(k, arr);
  }
  for (const [name, cands] of groups) {
    if (cands.length > 1 && hay.includes(` ${name} `)) return { name, cands };
  }
  return null;
}

export function pickByLast4(cands: Customer[], text: string): Customer | null {
  const digits = (text.match(/\b\d{4}\b/) ?? [])[0];
  if (!digits) return null;
  return cands.find((c) => phoneDigits(c).endsWith(digits)) ?? null;
}
