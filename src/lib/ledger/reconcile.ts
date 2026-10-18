import type { Allocation, Entry, Payment } from "../types";
import { allBalancesFromEntries, balancesFromAllocations, round2 } from "./balance";

export type ReconcileDiff = {
  customer_id: string;
  derived: number;
  displayed: number;
  diff: number;
};

export function reconcileBalances(
  derived: Map<string, number>,
  displayed: Map<string, number>
): { ok: boolean; diffs: ReconcileDiff[]; checked: number } {
  const ids = new Set<string>([...derived.keys(), ...displayed.keys()]);
  const diffs: ReconcileDiff[] = [];
  for (const id of ids) {
    const d = round2(derived.get(id) ?? 0);
    const s = round2(displayed.get(id) ?? 0);
    if (Math.abs(d - s) > 0.009) {
      diffs.push({ customer_id: id, derived: d, displayed: s, diff: round2(s - d) });
    }
  }
  return { ok: diffs.length === 0, diffs, checked: ids.size };
}

export function reconcileRepo(entries: Entry[], payments: Payment[], allocations: Allocation[]) {
  const derived = allBalancesFromEntries(entries, payments);
  const displayed = balancesFromAllocations(
    entries.filter((e) => e.type === "sale"),
    allocations,
    payments
  );
  return reconcileBalances(derived, displayed);
}
