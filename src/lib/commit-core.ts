import type {
  Alert,
  Allocation,
  AuditLog,
  CreditAssessment,
  Customer,
  Draft,
  Entry,
  EntryLine,
  InventoryMovement,
  Payment,
  Product,
  Shop,
  WantedRequest,
} from "./types";
import type { CommitEntryInput } from "./parser/schema";
import { customerBalanceFromEntries, lineTotal, planAllocation, round2, splitSale } from "./ledger/balance";
import { assessCredit } from "./ledger/credit";
import { uuid } from "./id";
import { productSalesInWindow } from "./intel/hot";

export function draftToCommitInput(draft: Draft): { ok: true; input: CommitEntryInput } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  let type: CommitEntryInput["type"] | null = null;
  if (draft.intent === "sale_cash" || draft.intent === "sale_credit") type = "sale";
  else if (draft.intent === "payment") type = "payment";
  else if (draft.intent === "refund") type = "refund";
  else if (draft.intent === "stock_in") type = "stock_in";
  if (!type) return { ok: false, missing: ["intent"] };

  const items = draft.items ?? [];
  items.forEach((it, i) => {
    if (it.qty == null || it.qty <= 0) missing.push(`qty:${i}`);
    if (type !== "stock_in" && it.unit_price == null) missing.push(`price:${i}`);
  });

  let total = round2(draft.total ?? 0);
  if (type === "sale" || type === "refund" || type === "stock_in") {
    const sum = round2(items.reduce((s, it) => s + (it.qty ?? 0) * (it.unit_price ?? 0) - (it.discount ?? 0), 0));
    if (sum > 0) total = sum;
  }
  if (total <= 0 && type !== "stock_in") missing.push("total");
  if (type === "payment" && !draft.customer?.id) missing.push("customer");
  if (missing.length) return { ok: false, missing };

  const method =
    draft.method ??
    (draft.intent === "sale_credit" ? "credit" : draft.intent === "sale_cash" ? "cash" : "cash");
  const paid_now =
    type === "sale" ? (draft.intent === "sale_cash" ? total : Math.min(round2(draft.paid_now ?? 0), total)) : total;

  const input: CommitEntryInput = {
    idempotency_key: draft.id,
    type,
    customer_id: draft.customer?.id ?? null,
    occurred_at: draft.occurred_at,
    total,
    paid_now: type === "sale" ? paid_now : total,
    method: method === "credit" && type === "payment" ? "cash" : method,
    source: draft.source,
    note: draft.note ?? null,
    override_reason: null,
    lines: items.map((it) => ({
      product_id: it.product_id ?? null,
      description: it.name || "Item",
      qty: it.qty ?? 1,
      unit: it.unit || "pc",
      unit_price: round2(it.unit_price ?? 0),
      discount: round2(it.discount ?? 0),
    })),
  };
  return { ok: true, input };
}

export type CommitPlan = {
  entry: Entry;
  movements: InventoryMovement[];
  payment: Payment | null;
  allocations: Allocation[];
  alerts: Alert[];
  audit: AuditLog | null;
  wantedUpdate: { id: string; patch: Partial<WantedRequest> } | null;
  assessment: CreditAssessment | null;
};

export type CommitDecision =
  | { ok: true; plan: CommitPlan }
  | { ok: false; reason: "credit_block" | "validation" | "duplicate" | "needs_review" | "server"; message: string; assessment?: CreditAssessment };

export function evaluateCommit(args: {
  input: CommitEntryInput;
  shop: Shop;
  products: Product[];
  customers: Customer[];
  entries: Entry[];
  payments: Payment[];
  recentAlerts?: Alert[];
  actor?: string;
  now?: Date;
}): CommitDecision {
  const { input, shop, products, customers, entries, payments } = args;
  const now = args.now ?? new Date();
  const actor = args.actor ?? "owner";
  const customer = input.customer_id ? customers.find((c) => c.id === input.customer_id) ?? null : null;
  if (input.customer_id && !customer) return { ok: false, reason: "validation", message: "Customer nahi mila." };
  if (input.type === "payment" && !customer) return { ok: false, reason: "validation", message: "Payment ke liye customer zaroori hai." };
  if (input.total < 0 || input.paid_now < 0) return { ok: false, reason: "validation", message: "Raqam sahi nahi hai." };
  if (input.occurred_at && new Date(input.occurred_at).getTime() > now.getTime() + 86400000) {
    return { ok: false, reason: "validation", message: "Tareekh mustaqbil mein nahi ho sakti." };
  }

  const lines: EntryLine[] = input.lines.map((l) => {
    const product = l.product_id ? products.find((p) => p.id === l.product_id) : null;
    return {
      product_id: l.product_id ?? null,
      description: (product?.name ?? l.description).slice(0, 200),
      qty: round2(l.qty),
      unit: l.unit || product?.unit || "pc",
      unit_price: round2(l.unit_price),
      discount: round2(l.discount ?? 0),
      line_total: lineTotal(l.qty, l.unit_price, l.discount ?? 0),
    };
  });

  let total = round2(input.total);
  if (input.type === "sale" && lines.length) {
    const sum = round2(lines.reduce((s, l) => s + l.line_total, 0));
    if (sum > 0) total = sum;
  }
  if (input.type === "sale" && !lines.length && total <= 0) {
    return { ok: false, reason: "validation", message: "Sale mein koi item ya raqam nahi." };
  }
  if (input.type === "stock_in" && !lines.some((l) => l.product_id)) {
    return { ok: false, reason: "validation", message: "Stock ke liye product chunein." };
  }

  const alerts: Alert[] = [];
  const movements: InventoryMovement[] = [];
  const auditRows: AuditLog[] = [];
  const balanceBefore = customer ? customerBalanceFromEntries(entries, payments, customer.id) : 0;
  const assessment = customer
    ? assessCredit({
        balance: balanceBefore,
        limit: customer.credit_limit,
        shopDefaultLimit: shop.settings.default_credit_limit,
        creditAmount: 0,
      })
    : null;

  if (input.type === "sale") {
    const split = splitSale(total, Math.min(input.paid_now, total));
    const credit = split.credit_amount;

    if (credit > 0 && customer) {
      const check = assessCredit({
        balance: balanceBefore,
        limit: customer.credit_limit,
        shopDefaultLimit: shop.settings.default_credit_limit,
        creditAmount: credit,
      });
      if (check.status === "block") {
        if (!input.override_reason) return { ok: false, reason: "credit_block", message: check.message, assessment: check };
        auditRows.push({
          id: uuid(), shop_id: shop.id, actor, action: "credit_override", entity: "customer",
          before: { balance: check.balance, limit: check.limit },
          after: { credit_amount: credit, projected: check.projected, reason: input.override_reason },
          reason: input.override_reason, created_at: now.toISOString(),
        });
      } else if (check.status === "warn") {
        alerts.push({
          id: uuid(), shop_id: shop.id, type: "credit", severity: "warning",
          title: `${customer.name} limit ke qareeb`,
          message: `Balance Rs ${check.projected} ho gaya — limit Rs ${check.limit} ka ${Math.round(check.pct)}%.`,
          related_type: "customer", related_id: customer.id, created_at: now.toISOString(),
          read_at: null, resolved_at: null, snoozed_until: null,
          action: { label: "Customer dekhein", href: `/khata/${customer.id}` },
        } satisfies Alert);
      }
    }

    const entry: Entry = {
      id: uuid(), shop_id: shop.id, type: "sale", customer_id: customer?.id ?? null,
      occurred_at: input.occurred_at, total, paid_now: split.paid_now, credit_amount: credit,
      method: input.method, status: "active", replaces_id: null, reversed_by_id: null,
      source: input.source, created_by: actor, idempotency_key: input.idempotency_key,
      note: input.note?.trim() || null, lines,
    };

    for (const l of lines) {
      if (!l.product_id) continue;
      movements.push({
        id: uuid(), shop_id: shop.id, product_id: l.product_id, type: "sale",
        qty_change: -l.qty, entry_id: entry.id, at: now.toISOString(),
      });
    }

    const hotAlert = maybeHotAlert({ shop, products, entries, lines, recentAlerts: args.recentAlerts ?? [], now });
    if (hotAlert) alerts.push(hotAlert);

    const wantedUpdate =
      input.wanted_id
        ? { id: input.wanted_id, patch: { linked_entry_id: entry.id, status: "converted" as const } }
        : null;

    return { ok: true, plan: { entry, movements, payment: null, allocations: [], alerts, audit: auditRows[0] ?? null, wantedUpdate, assessment: assessment ?? null } };
  }

  if (input.type === "payment") {
    if (total <= 0) return { ok: false, reason: "validation", message: "Payment ki raqam likhein." };
    const entry: Entry = {
      id: uuid(), shop_id: shop.id, type: "payment", customer_id: customer!.id,
      occurred_at: input.occurred_at, total, paid_now: total, credit_amount: 0,
      method: input.method === "credit" ? "cash" : input.method, status: "active",
      replaces_id: null, reversed_by_id: null, source: input.source, created_by: actor,
      idempotency_key: input.idempotency_key, note: input.note?.trim() || null, lines: [],
    };
    const payment: Payment = {
      id: entry.id, shop_id: shop.id, customer_id: customer!.id, entry_id: entry.id,
      amount: total, date: input.occurred_at, method: entry.method, reference: null,
    };
    const sales = entries.filter((e) => e.customer_id === customer!.id && e.type === "sale" && e.status === "active");
    const plan = planAllocation(total, sales, []);
    const allocations: Allocation[] = plan.allocations.map((a) => ({
      id: uuid(), payment_id: payment.id, sale_entry_id: a.sale_entry_id, amount: a.amount,
    }));

    const limit = customer!.credit_limit ?? shop.settings.default_credit_limit;
    const after = round2(balanceBefore - total);
    if (limit > 0 && balanceBefore >= limit && after < limit) {
      alerts.push({
        id: uuid(), shop_id: shop.id, type: "credit", severity: "info",
        title: `${customer!.name} ne payment ki`,
        message: `Ab dobara udhaar de sakte hain. Naya balance Rs ${after}.`,
        related_type: "customer", related_id: customer!.id, created_at: now.toISOString(),
        read_at: null, resolved_at: null, snoozed_until: null,
        action: { label: "Khata kholein", href: `/khata/${customer!.id}` },
      } satisfies Alert);
    }
    return { ok: true, plan: { entry, movements, payment, allocations, alerts, audit: null, wantedUpdate: null, assessment: assessment ?? null } };
  }

  if (input.type === "refund") {
    const entry: Entry = {
      id: uuid(), shop_id: shop.id, type: "refund", customer_id: customer?.id ?? null,
      occurred_at: input.occurred_at, total, paid_now: total, credit_amount: total,
      method: input.method, status: "active", replaces_id: null, reversed_by_id: null,
      source: input.source, created_by: actor, idempotency_key: input.idempotency_key,
      note: input.note?.trim() || null, lines,
    };
    for (const l of lines) {
      if (!l.product_id) continue;
      movements.push({
        id: uuid(), shop_id: shop.id, product_id: l.product_id, type: "refund",
        qty_change: l.qty, entry_id: entry.id, at: now.toISOString(),
      });
    }
    return { ok: true, plan: { entry, movements, payment: null, allocations: [], alerts, audit: null, wantedUpdate: null, assessment: assessment ?? null } };
  }

  const entry: Entry = {
    id: uuid(), shop_id: shop.id, type: input.type, customer_id: customer?.id ?? null,
    occurred_at: input.occurred_at, total: total, paid_now: 0, credit_amount: 0,
    method: input.method, status: "active", replaces_id: null, reversed_by_id: null,
    source: input.source, created_by: actor, idempotency_key: input.idempotency_key,
    note: input.note?.trim() || null, lines,
  };
  for (const l of lines) {
    if (!l.product_id) continue;
    movements.push({
      id: uuid(), shop_id: shop.id, product_id: l.product_id, type: "stock_in",
      qty_change: l.qty, entry_id: entry.id, at: now.toISOString(),
    });
  }
  return { ok: true, plan: { entry, movements, payment: null, allocations: [], alerts, audit: null, wantedUpdate: null, assessment: assessment ?? null } };
}

function maybeHotAlert(args: {
  shop: Shop;
  products: Product[];
  entries: Entry[];
  lines: EntryLine[];
  recentAlerts: Alert[];
  now: Date;
}): Alert | null {
  const { shop, products, entries, lines, recentAlerts, now } = args;
  const settings = shop.settings;
  const from = new Date(now.getTime() - settings.hot_window_days * 86400000).toISOString();
  const stats = productSalesInWindow(entries, from, now.toISOString());
  for (const l of lines) {
    if (!l.product_id) continue;
    const product = products.find((p) => p.id === l.product_id);
    if (!product) continue;
    const units = round2((stats.get(l.product_id)?.units ?? 0) + l.qty);
    if (units < settings.hot_min_units) continue;
    const already = recentAlerts.some(
      (a) => a.type === "hot" && a.related_id === l.product_id && !a.resolved_at && new Date(a.created_at).getTime() > now.getTime() - 86400000
    );
    if (already) continue;
    const lowStock = product.stock_qty - l.qty <= product.min_stock;
    return {
      id: uuid(), shop_id: shop.id, type: "hot",
      severity: lowStock ? "critical" : "info",
      title: `${product.name} garam ho gaya!`,
      message: `Is hafte ${units} ${product.unit} bik gaye${lowStock ? ` — stock sirf ${round2(product.stock_qty - l.qty)} bacha hai.` : "."}`,
      related_type: "product", related_id: product.id, created_at: now.toISOString(),
      read_at: null, resolved_at: null, snoozed_until: null,
      action: lowStock
        ? { label: "Mangwane ki list mein daalo", href: "/stock?tab=mangwana" }
        : { label: "Stock dekhein", href: "/stock" },
    };
  }
  return null;
}
