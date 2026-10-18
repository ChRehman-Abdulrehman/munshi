import type { Product } from "../types";
import type { HotItem } from "./hot";
import { round2 } from "../ledger/balance";

export type LowStockItem = {
  product: Product;
  priority: "normal" | "high";
  reason: string;
  suggested_order_qty: number;
};

export function computeLowStock(products: Product[], hotItems: HotItem[] = []): LowStockItem[] {
  const hotIds = new Set(hotItems.map((h) => h.product_id));
  return products
    .filter((p) => p.active && p.stock_qty <= p.min_stock)
    .map((p) => ({
      product: p,
      priority: hotIds.has(p.id) ? ("high" as const) : ("normal" as const),
      reason: hotIds.has(p.id)
        ? `Garam maal hai aur stock ${round2(p.stock_qty)} bacha hai`
        : `Stock ${round2(p.stock_qty)} hai, minimum ${p.min_stock}`,
      suggested_order_qty: p.preferred_restock_qty ?? Math.max(p.min_stock * 2 - p.stock_qty, 1),
    }))
    .sort((a, b) => (a.priority === b.priority ? a.product.stock_qty - b.product.stock_qty : a.priority === "high" ? -1 : 1));
}
