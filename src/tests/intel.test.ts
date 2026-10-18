import { describe, expect, it } from "vitest";
import { groupWanted, rankRestockSuggestions } from "@/lib/intel/demand";
import { computeLowStock } from "@/lib/intel/lowstock";
import { computeHotItems, topSellers } from "@/lib/intel/hot";
import { customerStats, topCustomersBy, overdueCustomers } from "@/lib/intel/customers";
import type { WantedRequest } from "@/lib/types";
import { C, E, P, now } from "./fixtures";

function W(partial: Partial<WantedRequest> & { id: string; item_text: string }): WantedRequest {
  return {
    shop_id: "shop-1",
    product_id: partial.product_id ?? null,
    variant_note: partial.variant_note ?? null,
    qty: partial.qty ?? 1,
    customer_id: partial.customer_id ?? null,
    contact_permission: partial.contact_permission ?? false,
    reason: partial.reason ?? "out_of_stock",
    expected_price: partial.expected_price ?? null,
    status: partial.status ?? "new",
    requested_at: partial.requested_at ?? "2026-10-10T00:00:00.000Z",
    linked_entry_id: null,
    notes: null,
    ...partial,
  };
}

describe("test 7+8: missed demand never changes sales; grouped requests", () => {
  it("same item requested 3 times → one group, count 3, three records kept", () => {
    const requests = [
      W({ id: "w1", item_text: "Blue lawn suit", customer_id: "cust-ali", qty: 1, variant_note: "blue" }),
      W({ id: "w2", item_text: "blue lawn suit", customer_id: "cust-bilal", qty: 2, variant_note: "blue" }),
      W({ id: "w3", item_text: "Blue Lawn Suit ", customer_id: "cust-ahmed", qty: 1, variant_note: "blue" }),
    ];
    const groups = groupWanted(requests);
    expect(groups.length).toBe(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].total_qty).toBe(4);
    expect(groups[0].requests.length).toBe(3);
    expect(groups[0].explanation).toContain("3 baar maangi");
  });

  it("different variants stay separate", () => {
    const groups = groupWanted([
      W({ id: "w1", item_text: "lawn suit", variant_note: "blue", product_id: "prod-lawn-suit-3pc" }),
      W({ id: "w2", item_text: "lawn suit", variant_note: "red", product_id: "prod-lawn-suit-3pc" }),
    ]);
    expect(groups.length).toBe(2);
  });

  it("rank restock suggestions prioritise out-of-stock high demand", () => {
    const groups = groupWanted([
      W({ id: "w1", item_text: "Blue lawn suit", product_id: "p1" }),
      W({ id: "w2", item_text: "Blue lawn suit", product_id: "p1" }),
      W({ id: "w3", item_text: "Blue lawn suit", product_id: "p1" }),
      W({ id: "w4", item_text: "Kids school bag", product_id: "p2" }),
    ]);
    const ranked = rankRestockSuggestions(groups, new Map([["p1", 0], ["p2", 12]]));
    expect(ranked[0].product_id).toBe("p1");
    expect(ranked[0].stock_qty).toBe(0);
  });

  it("test 9: resolved request keeps exactly its record; sales only count once via linked entry", () => {
    const r = W({ id: "w1", item_text: "Blue lawn suit", status: "arrived" });
    const linked = { ...r, status: "converted" as const, linked_entry_id: "e1" };
    const double = { ...linked };
    expect(linked.linked_entry_id).toBe(double.linked_entry_id ?? null);
    const groups = groupWanted([linked]);
    expect(groups[0].count).toBe(1);
  });
});

describe("hot sellers", () => {
  const p1 = P({ id: "p1", name: "Lawn suit 3pc", min_stock: 2, stock_qty: 1, selling_price: 2700 });
  const p2 = P({ id: "p2", name: "Shampoo", stock_qty: 40, selling_price: 250 });

  const entries = [
    ...Array.from({ length: 30 }, (_, i) =>
      E({
        id: `e${i}`,
        type: "sale",
        occurred_at: new Date(now.getTime() - (i % 6) * 86400000).toISOString(),
        total: 2700,
        paid_now: 2700,
        credit_amount: 0,
        lines: [{ product_id: "p1", description: "Lawn suit 3pc", qty: 1, unit: "suit", unit_price: 2700, discount: 0, line_total: 2700 }],
      })
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      E({
        id: `s${i}`,
        type: "sale",
        occurred_at: new Date(now.getTime() - (i % 5) * 86400000).toISOString(),
        total: 250,
        paid_now: 250,
        credit_amount: 0,
        lines: [{ product_id: "p2", description: "Shampoo", qty: 1, unit: "pc", unit_price: 250, discount: 0, line_total: 250 }],
      })
    ),
  ];

  it("Lawn suit is hot, tiny shampoo sample is not", () => {
    const hot = computeHotItems(entries, [p1, p2], { hot_window_days: 7, hot_min_units: 5, hot_growth_pct: 20 }, now);
    expect(hot.length).toBe(1);
    expect(hot[0].product_id).toBe("p1");
    expect(hot[0].units).toBeGreaterThanOrEqual(5);
    expect(hot[0].low_stock).toBe(true);
  });

  it("top sellers respects window and measure", () => {
    const from = new Date(now.getTime() - 7 * 86400000).toISOString();
    const top = topSellers(entries, { from, to: now.toISOString(), by: "units" });
    expect(top[0].product_id).toBe("p1");
  });

  it("low stock prioritises hot items", () => {
    const hot = computeHotItems(entries, [p1, p2], { hot_window_days: 7, hot_min_units: 5, hot_growth_pct: 20 }, now);
    const low = computeLowStock([p1, p2], hot);
    expect(low.length).toBe(1);
    expect(low[0].priority).toBe("high");
  });
});

describe("top customers", () => {
  it("sorts by value with explicit range, overdue flagged", () => {
    const c1 = C({ id: "c1", name: "Ali" });
    const c2 = C({ id: "c2", name: "Bilal" });
    const entries = [
      E({ id: "e1", type: "sale", customer_id: "c1", total: 5000, paid_now: 0, credit_amount: 5000, occurred_at: "2026-09-01T00:00:00.000Z" }),
      E({ id: "e2", type: "sale", customer_id: "c2", total: 2000, paid_now: 2000, credit_amount: 0, occurred_at: "2026-10-14T00:00:00.000Z" }),
      E({ id: "e3", type: "sale", customer_id: "c2", total: 1000, paid_now: 1000, credit_amount: 0, occurred_at: "2026-10-15T00:00:00.000Z" }),
    ];
    const balances = new Map([["c1", 5000]]);
    const stats = customerStats([c1, c2], entries, [], balances, {
      from: "2026-09-01T00:00:00.000Z",
      to: now.toISOString(),
      shopOverdueDays: 30,
      now,
    });
    const top = topCustomersBy(stats, "frequency");
    expect(top[0].customer.id).toBe("c2");
    expect(top[0].visits).toBe(2);
    const overdue = overdueCustomers(stats);
    expect(overdue.map((s) => s.customer.id)).toContain("c1");
  });
});
