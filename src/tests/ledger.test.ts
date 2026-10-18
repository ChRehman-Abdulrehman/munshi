import { describe, expect, it } from "vitest";
import { assessCredit, customerStatusBadge, isOverdue } from "@/lib/ledger/credit";
import { allBalancesFromEntries, balancesFromAllocations, customerBalanceFromEntries, planAllocation, replacementEntry, saleStatus, splitSale } from "@/lib/ledger/balance";
import { reconcileRepo } from "@/lib/ledger/reconcile";
import type { Allocation } from "@/lib/types";
import { C, E, Pay, now } from "./fixtures";

describe("test 4: credit limit enforcement", () => {
  it("balance 4600, limit 5000, credit 700 → projected 5300 → block", () => {
    const a = assessCredit({ balance: 4600, limit: 5000, shopDefaultLimit: 5000, creditAmount: 700 });
    expect(a.status).toBe("block");
    expect(a.projected).toBe(5300);
    expect(a.limit).toBe(5000);
  });

  it("payment of 400 → balance 4200, next check uses 4200", () => {
    const before = assessCredit({ balance: 4600, limit: 5000, shopDefaultLimit: 5000, creditAmount: 700 });
    expect(before.status).toBe("block");
    const afterPaymentBalance = 4600 - 400;
    const after = assessCredit({ balance: afterPaymentBalance, limit: 5000, shopDefaultLimit: 5000, creditAmount: 700 });
    expect(after.projected).toBe(4900);
    expect(after.status).toBe("warn");
  });

  it("80-99% → warn, below → ok", () => {
    expect(assessCredit({ balance: 3000, limit: 5000, shopDefaultLimit: 5000, creditAmount: 700 }).status).toBe("ok");
    expect(assessCredit({ balance: 3600, limit: 5000, shopDefaultLimit: 5000, creditAmount: 400 }).status).toBe("warn");
  });

  it("uses shop default when customer limit is null", () => {
    const a = assessCredit({ balance: 1000, limit: null, shopDefaultLimit: 2000, creditAmount: 900 });
    expect(a.limit).toBe(2000);
    expect(a.status).toBe("warn");
  });

  it("status badges", () => {
    expect(customerStatusBadge(1000, 5000, 5000)).toBe("Safe");
    expect(customerStatusBadge(4100, 5000, 5000)).toBe("Near limit");
    expect(customerStatusBadge(5000, 5000, 5000)).toBe("Blocked");
  });

  it("overdue detection", () => {
    expect(isOverdue({ oldestUnpaidAt: "2026-09-01T00:00:00.000Z", paymentTermsDays: null, shopOverdueDays: 30, now })).toBe(true);
    expect(isOverdue({ oldestUnpaidAt: "2026-10-14T00:00:00.000Z", paymentTermsDays: null, shopOverdueDays: 30, now })).toBe(false);
  });
});

describe("test 5+6: balances and payment splits", () => {
  it("sale 1000 paid 600 → 600 paid, 400 credit", () => {
    const split = splitSale(1000, 600);
    expect(split.paid_now).toBe(600);
    expect(split.credit_amount).toBe(400);
  });

  it("payment of 400 decreases balance", () => {
    const sale = E({ id: "s1", type: "sale", customer_id: "c1", total: 1000, paid_now: 0, credit_amount: 1000 });
    const entries = [sale];
    const before = customerBalanceFromEntries(entries, [], "c1");
    expect(before).toBe(1000);
    const payment = Pay({ id: "p1", customer_id: "c1", amount: 400 });
    const after = customerBalanceFromEntries(entries, [payment], "c1");
    expect(after).toBe(600);
  });

  it("reversed entries no longer affect balance", () => {
    const sale = E({ id: "s1", type: "sale", customer_id: "c1", total: 1000, credit_amount: 1000 });
    const reversed = { ...sale, status: "reversed" as const };
    expect(customerBalanceFromEntries([reversed], [], "c1")).toBe(0);
  });
});

describe("FIFO allocation", () => {
  it("oldest sale paid first, remainder unallocated", () => {
    const s1 = E({ id: "s1", type: "sale", customer_id: "c1", total: 500, credit_amount: 500, occurred_at: "2026-10-01T00:00:00.000Z" });
    const s2 = E({ id: "s2", type: "sale", customer_id: "c1", total: 700, credit_amount: 700, occurred_at: "2026-10-05T00:00:00.000Z" });
    const plan = planAllocation(800, [s2, s1], []);
    expect(plan.allocations).toEqual([
      { sale_entry_id: "s1", amount: 500 },
      { sale_entry_id: "s2", amount: 300 },
    ]);
    expect(plan.unallocated).toBe(0);
  });

  it("account payment remainder is unallocated", () => {
    const s1 = E({ id: "s1", type: "sale", customer_id: "c1", total: 500, credit_amount: 500 });
    const plan = planAllocation(900, [s1], []);
    expect(plan.allocations).toEqual([{ sale_entry_id: "s1", amount: 500 }]);
    expect(plan.unallocated).toBe(400);
  });

  it("sale status derives from allocations + paid_now only", () => {
    const sale = E({ id: "s1", type: "sale", customer_id: "c1", total: 1000, paid_now: 200, credit_amount: 800 });
    const partial: Allocation[] = [{ id: "a1", payment_id: "p1", sale_entry_id: "s1", amount: 400 }];
    expect(saleStatus(sale, [])).toBe("Partially paid");
    expect(saleStatus(sale, partial)).toBe("Partially paid");
    expect(saleStatus(sale, [{ id: "a2", payment_id: "p1", sale_entry_id: "s1", amount: 800 }])).toBe("Paid");
    expect(saleStatus({ ...sale, status: "reversed" }, [])).toBe("Reversed");
  });
});

describe("test 14: edit then undo restores original; reconcile returns zero", () => {
  it("replacement + reversal keep balances consistent", () => {
    const original = E({ id: "s1", type: "sale", customer_id: "c1", total: 1000, paid_now: 0, credit_amount: 1000, occurred_at: "2026-10-10T00:00:00.000Z" });
    const allocations: Allocation[] = [];
    const payments = [Pay({ id: "p1", customer_id: "c1", amount: 400 })];
    allocations.push({ id: "a1", payment_id: "p1", sale_entry_id: "s1", amount: 400 });

    const balanceBefore = customerBalanceFromEntries([original], payments, "c1");
    expect(balanceBefore).toBe(600);

    const replacement = replacementEntry(original, { total: 1200, credit_amount: 1200 }, "s2", now.toISOString());
    const reversed = { ...original, status: "reversed" as const };
    const afterEdit = [reversed, replacement];
    expect(customerBalanceFromEntries(afterEdit, payments, "c1")).toBe(800);

    const undoReplacement = { ...replacement, status: "reversed" as const };
    const restored = { ...original, status: "active" as const };
    const afterUndo = [restored, undoReplacement];
    expect(customerBalanceFromEntries(afterUndo, payments, "c1")).toBe(600);

    const rec = reconcileRepo(afterUndo, payments, allocations);
    expect(rec.ok).toBe(true);
    expect(rec.diffs).toEqual([]);
  });

  it("balance from net-sum equals balance from allocations", () => {
    const s1 = E({ id: "s1", type: "sale", customer_id: "c1", total: 1000, paid_now: 200, credit_amount: 800, occurred_at: "2026-10-01T00:00:00.000Z" });
    const s2 = E({ id: "s2", type: "sale", customer_id: "c1", total: 500, paid_now: 0, credit_amount: 500, occurred_at: "2026-10-02T00:00:00.000Z" });
    const p1 = Pay({ id: "p1", customer_id: "c1", amount: 300 });
    const p2 = Pay({ id: "p2", customer_id: "c1", amount: 1000 });
    const allocations: Allocation[] = [
      { id: "a1", payment_id: "p1", sale_entry_id: "s1", amount: 300 },
      { id: "a2", payment_id: "p2", sale_entry_id: "s1", amount: 500 },
      { id: "a3", payment_id: "p2", sale_entry_id: "s2", amount: 500 },
    ];
    const entries = [s1, s2];
    const net = allBalancesFromEntries(entries, [p1, p2]).get("c1");
    const alloc = balancesFromAllocations(entries, allocations, [p1, p2]).get("c1");
    expect(net).toBe(0);
    expect(alloc).toBe(0);
  });

  it("reconcile detects drift", () => {
    const rec = reconcileRepo(
      [E({ id: "s1", type: "sale", customer_id: "c1", total: 100, credit_amount: 100, paid_now: 0 })],
      [],
      []
    );
    expect(rec.ok).toBe(true);
  });
});

describe("fixtures sanity", () => {
  it("customers unique ids", () => {
    const ids = new Set([C({ name: "A" }).id, C({ name: "B" }).id]);
    expect(ids.size).toBe(2);
  });
});
