import type { Allocation, Customer, Entry, Payment } from "./types";
import { round2 } from "./ledger/balance";
import { saleStatus } from "./ledger/balance";

export type StatementLine = {
  date: string;
  kind: "opening" | "sale" | "payment" | "refund" | "adjustment";
  ref_id: string;
  description: string;
  detail?: string;
  debit: number;
  credit: number;
  balance: number;
  sale_status?: string;
  method?: string;
};

export type Statement = {
  customer: Customer;
  from: string;
  to: string;
  opening_balance: number;
  closing_balance: number;
  total_purchases: number;
  total_paid: number;
  lines: StatementLine[];
};

export function buildStatement(opts: {
  customer: Customer;
  entries: Entry[];
  payments: Payment[];
  allocations: Allocation[];
  from: string;
  to: string;
  initialBalance: number;
}): Statement {
  const { customer, from, to } = opts;
  const before = (iso: string) => iso < from;
  const inRange = (iso: string) => iso >= from && iso <= to;

  let opening = opts.initialBalance;
  const events: { at: string; line: Omit<StatementLine, "balance"> }[] = [];

  for (const e of opts.entries) {
    if (e.customer_id !== customer.id) continue;
    if (before(e.occurred_at)) {
      if (e.type === "sale" && e.status === "active") opening = round2(opening + e.credit_amount);
      if (e.type === "refund" && e.status === "active") opening = round2(opening - e.total);
      continue;
    }
    if (!inRange(e.occurred_at)) continue;
    if (e.type === "sale") {
      const items = e.lines.map((l) => `${l.description} ${l.qty}${l.unit ? " " + l.unit : ""} × Rs ${l.unit_price}`).join(", ");
      events.push({
        at: e.occurred_at,
        line: {
          kind: "sale",
          ref_id: e.id,
          date: e.occurred_at,
          description: items || "Sale",
          debit: e.status === "active" ? e.total : 0,
          credit: 0,
          sale_status: saleStatus(e, opts.allocations),
          method: e.method,
        },
      });
    } else if (e.type === "refund") {
      events.push({
        at: e.occurred_at,
        line: { kind: "refund", ref_id: e.id, date: e.occurred_at, description: e.note || "Refund/return", debit: 0, credit: e.status === "active" ? e.total : 0 },
      });
    } else if (e.type === "adjustment") {
      events.push({
        at: e.occurred_at,
        line: { kind: "adjustment", ref_id: e.id, date: e.occurred_at, description: e.note || "Adjustment", debit: e.status === "active" ? e.credit_amount : 0, credit: 0 },
      });
    }
  }
  for (const p of opts.payments) {
    if (p.customer_id !== customer.id) continue;
    if (before(p.date)) {
      opening = round2(opening - p.amount);
      continue;
    }
    if (!inRange(p.date)) continue;
    events.push({
      at: p.date,
      line: { kind: "payment", ref_id: p.id, date: p.date, description: "Payment", detail: p.method, debit: 0, credit: p.amount },
    });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  const lines: StatementLine[] = [
    { kind: "opening", ref_id: "opening", date: from, description: "Pichla balance", debit: 0, credit: 0, balance: opening },
  ];
  let running = opening;
  for (const ev of events) {
    running = round2(running + ev.line.debit - ev.line.credit);
    lines.push({ ...ev.line, balance: running });
  }
  const totalPurchases = round2(
    events.filter((e) => e.line.kind === "sale").reduce((s, e) => s + e.line.debit, 0)
  );
  const totalPaid = round2(events.filter((e) => e.line.kind === "payment").reduce((s, e) => s + e.line.credit, 0));

  return {
    customer,
    from,
    to,
    opening_balance: opening,
    closing_balance: running,
    total_purchases: totalPurchases,
    total_paid: totalPaid,
    lines,
  };
}

export function statementWhatsAppText(stmt: Statement, shopName: string, payment?: string | null): string {
  const fmt = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
  const d = (iso: string) => new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short" });
  const lines: string[] = [
    `Assalam o Alaikum ${stmt.customer.name},`,
    `${shopName} ki taraf se aap ka hisaab (${d(stmt.from)} se ${d(stmt.to)}):`,
    "",
    `Pichla balance: ${fmt(stmt.opening_balance)}`,
    `Is arse mein kharidari: ${fmt(stmt.total_purchases)}`,
    `Jama karwaya: ${fmt(stmt.total_paid)}`,
    `Ab balance: ${fmt(stmt.closing_balance)}`,
    "",
    payment ? `Payment: ${payment}` : "",
    "Tafseel ke liye rabta karein. Shukriya!",
  ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "");
  return lines.join("\n");
}
