import type { Entry, Product, ShopSettings } from "../types";
import { round2 } from "../ledger/balance";

export type ProductWindow = { product_id: string; name: string; units: number; value: number };

export function productSalesInWindow(entries: Entry[], from: string, to: string): Map<string, { units: number; value: number; name: string }> {
  const map = new Map<string, { units: number; value: number; name: string }>();
  for (const e of entries) {
    if (e.type !== "sale" || e.status !== "active") continue;
    if (e.occurred_at < from || e.occurred_at > to) continue;
    for (const l of e.lines) {
      if (!l.product_id) continue;
      const cur = map.get(l.product_id) ?? { units: 0, value: 0, name: l.description };
      cur.units += l.qty;
      cur.value = round2(cur.value + l.line_total);
      map.set(l.product_id, cur);
    }
  }
  return map;
}

export type HotItem = {
  product_id: string;
  name: string;
  units: number;
  value: number;
  prev_units: number;
  growth_pct: number;
  period_days: number;
  stock_qty: number;
  min_stock: number;
  low_stock: boolean;
};

export function computeHotItems(
  entries: Entry[],
  products: Product[],
  settings: Pick<ShopSettings, "hot_window_days" | "hot_min_units" | "hot_growth_pct">,
  now = new Date()
): HotItem[] {
  const days = settings.hot_window_days || 7;
  const curTo = now.toISOString();
  const curFrom = new Date(now.getTime() - days * 86400000).toISOString();
  const prevFrom = new Date(now.getTime() - 2 * days * 86400000).toISOString();
  const cur = productSalesInWindow(entries, curFrom, curTo);
  const prev = productSalesInWindow(entries, prevFrom, curFrom);
  const out: HotItem[] = [];
  for (const [pid, stats] of cur) {
    const product = products.find((p) => p.id === pid);
    if (!product || !product.active) continue;
    const prevUnits = prev.get(pid)?.units ?? 0;
    const growth = prevUnits > 0 ? ((stats.units - prevUnits) / prevUnits) * 100 : stats.units > 0 ? 100 : 0;
    if (stats.units < settings.hot_min_units) continue;
    if (growth < settings.hot_growth_pct) continue;
    out.push({
      product_id: pid,
      name: product.name,
      units: stats.units,
      value: stats.value,
      prev_units: prevUnits,
      growth_pct: Math.round(growth),
      period_days: days,
      stock_qty: product.stock_qty,
      min_stock: product.min_stock,
      low_stock: product.stock_qty <= product.min_stock,
    });
  }
  return out.sort((a, b) => b.units * (1 + b.growth_pct / 100) - a.units * (1 + a.growth_pct / 100));
}

export function topSellers(
  entries: Entry[],
  opts: { from: string; to: string; by: "units" | "value"; limit?: number }
): ProductWindow[] {
  const map = productSalesInWindow(entries, opts.from, opts.to);
  const list = [...map.entries()].map(([product_id, s]) => ({ product_id, name: s.name, units: s.units, value: s.value }));
  list.sort((a, b) => (opts.by === "units" ? b.units - a.units : b.value - a.value));
  return list.slice(0, opts.limit ?? 10);
}

export function velocityPerDay(entries: Entry[], product_id: string, days = 14, now = new Date()): number | null {
  const from = new Date(now.getTime() - days * 86400000).toISOString();
  const map = productSalesInWindow(entries, from, now.toISOString());
  const units = map.get(product_id)?.units ?? 0;
  const salesDays = new Set(
    entries
      .filter((e) => e.type === "sale" && e.status === "active" && e.occurred_at >= from)
      .map((e) => e.occurred_at.slice(0, 10))
  ).size;
  if (salesDays < 4) return null;
  return round2(units / days);
}

export function daysOfStockLeft(product: Product, entries: Entry[], now = new Date()): number | null {
  const v = velocityPerDay(entries, product.id, 14, now);
  if (v === null || v <= 0) return null;
  return Math.max(0, Math.round(product.stock_qty / v));
}
