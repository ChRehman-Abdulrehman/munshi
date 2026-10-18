import type { WantedRequest, WantedStatus } from "../types";
import { foldWord } from "../parser/rules";
import { round2 } from "../ledger/balance";

export type WantedGroup = {
  key: string;
  item_text: string;
  product_id: string | null;
  variant_note: string | null;
  count: number;
  total_qty: number;
  latest_at: string;
  status: WantedStatus;
  customers: { customer_id: string | null; name: string | null; qty: number; at: string; contact_permission: boolean; request_id: string }[];
  requests: WantedRequest[];
  expected_price: number | null;
  explanation: string | null;
};

const STATUS_ORDER: WantedStatus[] = ["arrived", "customer_notified", "converted", "ordered", "to_order", "new", "closed"];

function groupKey(r: WantedRequest): string {
  if (r.product_id) return `p:${r.product_id}${r.variant_note ? `:${foldWord(r.variant_note)}` : ""}`;
  const base = foldWord(r.item_text).replace(/blue|red|black|white|green|small|medium|large|xl/g, "").trim();
  return `t:${base}${r.variant_note ? `:${foldWord(r.variant_note)}` : ""}`;
}

export function groupWanted(requests: WantedRequest[], customerNames: Map<string, string> = new Map()): WantedGroup[] {
  const groups = new Map<string, WantedGroup>();
  for (const r of requests) {
    const key = groupKey(r);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        item_text: r.item_text,
        product_id: r.product_id ?? null,
        variant_note: r.variant_note ?? null,
        count: 0,
        total_qty: 0,
        latest_at: r.requested_at,
        status: "new",
        customers: [],
        requests: [],
        expected_price: r.expected_price ?? null,
        explanation: null,
      };
      groups.set(key, g);
    }
    g.count += 1;
    g.total_qty = round2(g.total_qty + r.qty);
    g.requests.push(r);
    if (r.requested_at > g.latest_at) g.latest_at = r.requested_at;
    if (STATUS_ORDER.indexOf(r.status) < STATUS_ORDER.indexOf(g.status)) g.status = r.status;
    if (r.expected_price != null && g.expected_price == null) g.expected_price = r.expected_price;
    g.customers.push({
      customer_id: r.customer_id ?? null,
      name: r.customer_id ? customerNames.get(r.customer_id) ?? null : null,
      qty: r.qty,
      at: r.requested_at,
      contact_permission: r.contact_permission,
      request_id: r.id,
    });
  }
  const list = [...groups.values()];
  for (const g of list) {
    const n = g.count;
    g.explanation = `${n} baar maangi${g.total_qty !== n ? `, total ${g.total_qty} qty` : ""}`;
  }
  return list.sort((a, b) => b.count - a.count || b.latest_at.localeCompare(a.latest_at));
}

export function rankRestockSuggestions(groups: WantedGroup[], stockQtyByProduct: Map<string, number>): (WantedGroup & { rank_score: number; stock_qty: number | null })[] {
  return groups
    .filter((g) => g.status === "new" || g.status === "to_order" || g.status === "ordered")
    .map((g) => {
      const stock = g.product_id ? stockQtyByProduct.get(g.product_id) ?? null : null;
      const stockFactor = stock === null ? 1.2 : stock <= 0 ? 3 : Math.max(0, 1 - stock / 10);
      const rank_score = round2((g.count * 2 + g.total_qty) * stockFactor);
      return { ...g, rank_score, stock_qty: stock };
    })
    .sort((a, b) => b.rank_score - a.rank_score);
}

export function demandVsSalesExplanation(g: WantedGroup & { stock_qty: number | null }): string {
  const parts = [`${g.count} baar maangi`];
  parts.push(g.stock_qty !== null ? `stock ${g.stock_qty}` : "stock record nahi");
  return parts.join(", ");
}
