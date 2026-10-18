import type { Allocation, Entry, Payment, SaleStatus } from "../types";

export function netSaleTotal(lines: { qty: number; unit_price: number; discount: number }[]): number {
  return lines.reduce((sum, l) => sum + round2(l.qty * l.unit_price - l.discount), 0);
}

export function lineTotal(qty: number, unit_price: number, discount = 0): number {
  return round2(qty * unit_price - discount);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function splitSale(total: number, paidNow: number | null | undefined): { paid_now: number; credit_amount: number } {
  const paid = round2(Math.max(0, Math.min(paidNow ?? 0, total)));
  return { paid_now: paid, credit_amount: round2(total - paid) };
}

export function customerBalanceFromEntries(entries: Entry[], payments: Payment[], customerId: string): number {
  let balance = 0;
  for (const e of entries) {
    if (e.customer_id !== customerId || e.status !== "active") continue;
    if (e.type === "sale") balance += e.credit_amount;
    if (e.type === "refund") balance -= e.total;
    if (e.type === "adjustment") balance -= e.credit_amount;
  }
  for (const p of payments) {
    if (p.customer_id === customerId) balance -= p.amount;
  }
  return round2(balance);
}

export function allBalancesFromEntries(entries: Entry[], payments: Payment[]): Map<string, number> {
  const map = new Map<string, number>();
  const add = (id: string, v: number) => map.set(id, round2((map.get(id) ?? 0) + v));
  for (const e of entries) {
    if (e.status !== "active" || !e.customer_id) continue;
    if (e.type === "sale") add(e.customer_id, e.credit_amount);
    if (e.type === "refund") add(e.customer_id, -e.total);
    if (e.type === "adjustment") add(e.customer_id, -e.credit_amount);
  }
  for (const p of payments) add(p.customer_id, -p.amount);
  return map;
}

export function saleUnpaid(sale: Entry, allocations: Allocation[], accountPayments: Payment[] = []): number {
  if (sale.type !== "sale" || sale.status === "reversed") return 0;
  const paidViaAlloc = allocations
    .filter((a) => a.sale_entry_id === sale.id)
    .reduce((s, a) => s + a.amount, 0);
  const direct = sale.paid_now;
  const pooled = accountPayments.reduce((s, p) => s + p.amount, 0);
  return round2(Math.max(0, sale.total - direct - paidViaAlloc - pooled));
}

export function saleStatus(sale: Entry, allocations: Allocation[], accountPayments: Payment[] = []): SaleStatus {
  if (sale.status === "reversed") return "Reversed";
  if (sale.type !== "sale") return "Paid";
  const unpaid = saleUnpaid(sale, allocations, accountPayments);
  if (unpaid <= 0.009) return "Paid";
  const paidAny =
    sale.paid_now > 0 ||
    allocations.some((a) => a.sale_entry_id === sale.id && a.amount > 0.009);
  return paidAny ? "Partially paid" : "Unpaid";
}

export type AllocationPlan = {
  allocations: { sale_entry_id: string; amount: number }[];
  unallocated: number;
};

export function planAllocation(
  amount: number,
  sales: Entry[],
  existingAllocations: Allocation[],
  opts: { specificSaleId?: string | null } = {}
): AllocationPlan {
  let remaining = round2(amount);
  const allocations: { sale_entry_id: string; amount: number }[] = [];

  let candidates = sales
    .filter((s) => s.type === "sale" && s.status === "active" && s.credit_amount > 0)
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  if (opts.specificSaleId) {
    const target = candidates.find((s) => s.id === opts.specificSaleId);
    candidates = target ? [target] : candidates;
  }

  for (const sale of candidates) {
    if (remaining <= 0.009) break;
    const allocPaid = existingAllocations
      .filter((a) => a.sale_entry_id === sale.id)
      .reduce((s, a) => s + a.amount, 0);
    const unpaidCredit = round2(sale.credit_amount - allocPaid);
    if (unpaidCredit <= 0.009) continue;
    const take = Math.min(unpaidCredit, remaining);
    if (take > 0.009) {
      allocations.push({ sale_entry_id: sale.id, amount: round2(take) });
      remaining = round2(remaining - take);
    }
  }
  return { allocations, unallocated: round2(Math.max(0, remaining)) };
}

export function balancesFromAllocations(
  sales: Entry[],
  allocations: Allocation[],
  payments: Payment[]
): Map<string, number> {
  const map = new Map<string, number>();
  const add = (id: string, v: number) => map.set(id, round2((map.get(id) ?? 0) + v));
  const allocBySale = new Map<string, number>();
  for (const a of allocations) allocBySale.set(a.sale_entry_id, round2((allocBySale.get(a.sale_entry_id) ?? 0) + a.amount));
  for (const s of sales) {
    if (s.type !== "sale" || s.status !== "active" || !s.customer_id) continue;
    const paid = round2(s.paid_now + (allocBySale.get(s.id) ?? 0));
    add(s.customer_id, round2(Math.max(0, s.total - paid)));
  }
  for (const p of payments) {
    const allocated = allocations.filter((a) => a.payment_id === p.id).reduce((s, a) => s + a.amount, 0);
    const surplus = round2(p.amount - allocated);
    if (surplus > 0.009) add(p.customer_id, -surplus);
  }
  return map;
}

export function applyReversal(entry: Entry, byId: string, at: string): Entry {
  return { ...entry, status: "reversed", reversed_by_id: byId, note: entry.note ?? null, id: entry.id };
}

export function replacementEntry(original: Entry, changes: Partial<Entry>, newId: string, at: string): Entry {
  return {
    ...original,
    ...changes,
    id: newId,
    replaces_id: original.id,
    reversed_by_id: null,
    status: "active",
    occurred_at: original.occurred_at,
    idempotency_key: `${original.idempotency_key}-r${Date.now().toString(36)}`,
  };
}
