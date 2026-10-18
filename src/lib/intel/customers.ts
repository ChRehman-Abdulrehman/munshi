import type { Customer, Entry, Payment } from "../types";
import { round2 } from "../ledger/balance";
import { isOverdue } from "../ledger/credit";

export type CustomerStat = {
  customer: Customer;
  total_value: number;
  visits: number;
  last_visit: string | null;
  balance: number;
  overdue: boolean;
};

export function customerStats(
  customers: Customer[],
  entries: Entry[],
  payments: Payment[],
  balances: Map<string, number>,
  opts: { from: string; to: string; shopOverdueDays: number; now?: Date }
): CustomerStat[] {
  const inRange = entries.filter((e) => e.occurred_at >= opts.from && e.occurred_at <= opts.to);
  return customers.map((c) => {
    const sales = inRange.filter((e) => e.customer_id === c.id && e.type === "sale" && e.status === "active");
    const total = round2(sales.reduce((s, e) => s + e.total, 0));
    const visits = sales.length;
    const allSales = entries.filter((e) => e.customer_id === c.id && e.type === "sale" && e.status === "active");
    const last = allSales.map((e) => e.occurred_at).sort().at(-1) ?? null;
    const oldestUnpaid = allSales
      .filter((e) => e.credit_amount > 0)
      .map((e) => e.occurred_at)
      .sort()
      .at(0) ?? null;
    return {
      customer: c,
      total_value: total,
      visits,
      last_visit: last,
      balance: round2(balances.get(c.id) ?? 0),
      overdue: isOverdue({
        oldestUnpaidAt: oldestUnpaid,
        paymentTermsDays: c.payment_terms_days,
        shopOverdueDays: opts.shopOverdueDays,
        now: opts.now,
      }),
    };
  });
}

export function topCustomersBy(stats: CustomerStat[], by: "value" | "frequency", limit = 10): CustomerStat[] {
  const list = [...stats];
  list.sort((a, b) => (by === "value" ? b.total_value - a.total_value : b.visits - a.visits));
  return list.filter((s) => s.visits > 0).slice(0, limit);
}

export function overdueCustomers(stats: CustomerStat[]): CustomerStat[] {
  return stats.filter((s) => s.overdue && s.balance > 0).sort((a, b) => b.balance - a.balance);
}
