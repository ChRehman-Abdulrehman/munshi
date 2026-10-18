import { describe, expect, it } from "vitest";
import type { Customer, Entry, Payment, Product } from "@/lib/types";

const now = new Date("2026-10-16T10:00:00.000Z");

export function P(partial: Partial<Product> & { name: string }): Product {
  return {
    id: partial.id ?? "prod-" + partial.name.toLowerCase().replace(/\s+/g, "-"),
    shop_id: "shop-1",
    aliases: partial.aliases ?? [],
    unit: partial.unit ?? "pc",
    selling_price: partial.selling_price ?? 100,
    cost_price: partial.cost_price ?? null,
    stock_qty: partial.stock_qty ?? 50,
    min_stock: partial.min_stock ?? 5,
    preferred_restock_qty: null,
    active: true,
    ...partial,
  };
}

export function C(partial: Partial<Customer> & { name: string }): Customer {
  return {
    id: partial.id ?? "cust-" + partial.name.toLowerCase().replace(/\s+/g, "-"),
    shop_id: "shop-1",
    phone: partial.phone ?? null,
    notes: null,
    credit_limit: partial.credit_limit ?? null,
    payment_terms_days: partial.payment_terms_days ?? null,
    created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

export function E(partial: Partial<Entry> & { id: string; type: Entry["type"] }): Entry {
  return {
    shop_id: "shop-1",
    customer_id: partial.customer_id ?? null,
    occurred_at: partial.occurred_at ?? now.toISOString(),
    total: partial.total ?? 0,
    paid_now: partial.paid_now ?? 0,
    credit_amount: partial.credit_amount ?? 0,
    method: partial.method ?? "cash",
    status: partial.status ?? "active",
    source: "manual",
    idempotency_key: "k-" + partial.id,
    lines: partial.lines ?? [],
    ...partial,
  } as Entry;
}

export function Pay(partial: Partial<Payment> & { id: string; customer_id: string; amount: number }): Payment {
  return {
    shop_id: "shop-1",
    entry_id: null,
    date: partial.date ?? now.toISOString(),
    method: "cash",
    reference: null,
    ...partial,
  };
}

export const BASE_PRODUCTS: Product[] = [
  P({ name: "Cheeni", aliases: ["chini", "sugar"], unit: "kg", selling_price: 150 }),
  P({ name: "Cooking Oil 1L", aliases: ["cooking oil", "tel"], unit: "bottle", selling_price: 550 }),
  P({ name: "Shampoo", unit: "pc", selling_price: 250 }),
  P({ name: "Biscuits", aliases: ["biscuit"], unit: "packet", selling_price: 100 }),
  P({ name: "Lawn suit 3pc", aliases: ["lawn suit", "lawn ka suit"], unit: "suit", selling_price: 2700 }),
  P({ name: "Doodh", aliases: ["milk"], unit: "litre", selling_price: 260 }),
];

export const BASE_CUSTOMERS: Customer[] = [
  C({ name: "Ali", phone: "03001234567" }),
  C({ name: "Ahmed", phone: "03007654321" }),
  C({ name: "Bilal" }),
];

export const TWO_ALIS: Customer[] = [C({ name: "Ali Mobile" }), C({ name: "Ali Street 4" })];

export { now };
