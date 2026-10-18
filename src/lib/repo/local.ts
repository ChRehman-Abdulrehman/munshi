"use client";

import { openDB, type IDBPDatabase } from "idb";
import type {
  Alert,
  Allocation,
  AuditLog,
  CommitResult,
  Customer,
  Draft,
  Entry,
  Member,
  Payment,
  Product,
  ShareLink,
  Shop,
  ShopSettings,
  WantedRequest,
} from "../types";
import { round2, planAllocation, allBalancesFromEntries, customerBalanceFromEntries } from "../ledger/balance";
import { assessCredit } from "../ledger/credit";
import { reconcileRepo } from "../ledger/reconcile";
import { uuid } from "../id";
import { evaluateCommit } from "../commit-core";
import { hasPassword, verifyPassword } from "../security";
import type { CommitEntryInput } from "../parser/schema";
import type { NewCustomer, NewProduct, Repo, Session, StatementBundle } from "./types";
import { seedDemoData } from "./seed-data";
import { csvFromRows } from "../export";

const DB_NAME = "munshi-local";
const VERSION = 1;
const STORES = [
  "meta", "shops", "members", "products", "customers", "entries", "payments",
  "allocations", "movements", "wanted", "alerts", "audit", "share_links", "drafts",
] as const;

type StoreName = (typeof STORES)[number];

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class LocalRepo implements Repo {
  mode = "local" as const;
  private dbp: Promise<IDBPDatabase> | null = null;

  private db(): Promise<IDBPDatabase> {
    if (!this.dbp) {
      this.dbp = openDB(DB_NAME, VERSION, {
        upgrade(d) {
          for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: s === "meta" ? "k" : "id" });
        },
      });
    }
    return this.dbp;
  }

  private async getMeta<T>(k: string): Promise<T | null> {
    const d = await this.db();
    const row = await d.get("meta", k);
    return row ? (row.v as T) : null;
  }

  private async setMeta(k: string, v: unknown): Promise<void> {
    const d = await this.db();
    await d.put("meta", { k, v });
  }

  async getSession(): Promise<Session | null> {
    const ref = await this.getMeta<{ shop_id: string; member_id: string }>("session");
    if (!ref) return null;
    const d = await this.db();
    const shop = await d.get("shops", ref.shop_id);
    const member = await d.get("members", ref.member_id);
    if (!shop || !member) return null;
    return { shop, member };
  }

  async signIn(input: { name: string; pin: string; shopName?: string }): Promise<Session> {
    const d = await this.db();
    let session = await this.getSession();
    if (session) {
      if (!input.pin) throw new Error("PIN ya password likhein.");
      const ok = hasPassword(session.shop)
        ? await verifyPassword(input.pin, session.shop.settings.password_hash!, session.shop.settings.password_salt!)
        : (await sha256Hex(input.pin)) === session.member.user_id;
      if (!ok) throw new Error("PIN/password galat hai. Dobara koshish karein.");
      return session;
    }
    const now = new Date().toISOString();
    const shopId = uuid();
    const memberId = uuid();
    const shop: Shop = {
      id: shopId,
      name: input.shopName?.trim() || `${input.name} ka karobar`,
      timezone: "Asia/Karachi",
      currency: "PKR",
      is_demo: false,
      settings: defaultSettings(),
    };
    const member: Member = {
      id: memberId,
      shop_id: shopId,
      user_id: await sha256Hex(input.pin || "0000"),
      name: input.name,
      role: "owner",
      permissions: { can_override_credit: true, can_view_phones: true, can_edit_entries: true, can_share_statements: true },
    };
    await d.put("shops", shop);
    await d.put("members", member);
    await this.setMeta("session", { shop_id: shopId, member_id: memberId });
    return { shop, member };
  }

  async signOut(): Promise<void> {
    const d = await this.db();
    await d.delete("meta", "session");
  }

  async getShop(): Promise<Shop> {
    const session = await this.getSession();
    if (session) return session.shop;
    const d = await this.db();
    const shops = await d.getAll("shops");
    if (shops.length) return shops[0];
    throw new Error("Koi shop nahi mili. Pehle login karein.");
  }

  async updateShopSettings(patch: Partial<ShopSettings>): Promise<Shop> {
    const d = await this.db();
    const shop = await this.getShop();
    const updated: Shop = { ...shop, settings: { ...shop.settings, ...patch } };
    await d.put("shops", updated);
    await this.setMeta("session", (await this.getMeta<{ shop_id: string; member_id: string }>("session")) ?? { shop_id: shop.id, member_id: "" });
    return updated;
  }

  async setDemoMode(on: boolean): Promise<void> {
    if (on) await this.seedDemo();
    else await this.clearDemo();
  }

  async seedDemo(): Promise<void> {
    const d = await this.db();
    const existing = await d.getAll("shops");
    for (const s of existing) if (s.is_demo) await this.clearDemo();
    const data = seedDemoData();
    const tx = d.transaction(STORES as unknown as string[], "readwrite");
    await tx.objectStore("shops").put(data.shop);
    await tx.objectStore("members").put(data.member);
    for (const p of data.products) await tx.objectStore("products").put(p);
    for (const c of data.customers) await tx.objectStore("customers").put(c);
    for (const e of data.entries) await tx.objectStore("entries").put(e);
    for (const p of data.payments) await tx.objectStore("payments").put(p);
    for (const a of data.allocations) await tx.objectStore("allocations").put(a);
    for (const m of data.movements) await tx.objectStore("movements").put(m);
    for (const w of data.wanted) await tx.objectStore("wanted").put(w);
    for (const a of data.alerts) await tx.objectStore("alerts").put(a);
    await tx.done;
    await this.setMeta("session", { shop_id: data.shop.id, member_id: data.member.id });
  }

  async clearDemo(): Promise<void> {
    const d = await this.db();
    const shops = await d.getAll("shops");
    const demoIds = shops.filter((s) => s.is_demo).map((s) => s.id);
    if (!demoIds.length) return;
    const tx = d.transaction(STORES as unknown as string[], "readwrite");
    for (const s of STORES) {
      if (s === "meta") continue;
      const store = tx.objectStore(s);
      const all = await store.getAll();
      for (const row of all) {
        if (demoIds.includes(row.shop_id) || demoIds.includes(row.id)) await store.delete(row.id);
      }
    }
    await tx.done;
    const session = await this.getMeta<{ shop_id: string }>("session");
    if (session && demoIds.includes(session.shop_id)) await this.setMeta("session", null);
  }

  async listProducts(includeInactive = false): Promise<Product[]> {
    const d = await this.db();
    const all: Product[] = await d.getAll("products");
    return all.filter((p) => includeInactive || p.active).sort((a, b) => a.name.localeCompare(b.name));
  }

  async upsertProduct(p: NewProduct): Promise<Product> {
    const d = await this.db();
    const shop = await this.getShop();
    const product: Product = {
      id: p.id ?? uuid(),
      shop_id: shop.id,
      name: p.name,
      aliases: p.aliases ?? [],
      category: p.category,
      unit: p.unit || "pc",
      selling_price: round2(p.selling_price || 0),
      cost_price: p.cost_price ?? null,
      stock_qty: round2(p.stock_qty || 0),
      min_stock: round2(p.min_stock ?? shop.settings.low_stock_default),
      preferred_restock_qty: p.preferred_restock_qty ?? null,
      active: p.active ?? true,
    };
    await d.put("products", product);
    return product;
  }

  async adjustStock(productId: string, qtyChange: number, note?: string): Promise<void> {
    const d = await this.db();
    const shop = await this.getShop();
    const p: Product | undefined = await d.get("products", productId);
    if (!p) throw new Error("Product nahi mila");
    await d.put("products", { ...p, stock_qty: round2(p.stock_qty + qtyChange) });
    await d.put("movements", {
      id: uuid(), shop_id: shop.id, product_id: productId, type: "adjustment",
      qty_change: qtyChange, entry_id: null, at: new Date().toISOString(), note,
    });
  }

  async listCustomers(): Promise<Customer[]> {
    const d = await this.db();
    const all: Customer[] = await d.getAll("customers");
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const d = await this.db();
    return (await d.get("customers", id)) ?? null;
  }

  async upsertCustomer(c: NewCustomer): Promise<Customer> {
    const d = await this.db();
    const shop = await this.getShop();
    const all: Customer[] = await d.getAll("customers");
    if (!c.id) {
      const dup = all.find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
      if (dup) throw new Error(`"${dup.name}" pehle se maujood hai.`);
    }
    const customer: Customer = {
      id: c.id ?? uuid(),
      shop_id: shop.id,
      name: c.name.trim(),
      phone: c.phone ?? null,
      notes: c.notes ?? null,
      credit_limit: c.credit_limit ?? null,
      payment_terms_days: c.payment_terms_days ?? null,
      created_at: new Date().toISOString(),
    };
    await d.put("customers", customer);
    return customer;
  }

  async setCreditLimit(customerId: string, limit: number | null, reason?: string): Promise<Customer> {
    const d = await this.db();
    const shop = await this.getShop();
    const c: Customer | undefined = await d.get("customers", customerId);
    if (!c) throw new Error("Customer nahi mila");
    const updated = { ...c, credit_limit: limit };
    await d.put("customers", updated);
    await d.put("audit", {
      id: uuid(), shop_id: shop.id, actor: "owner", action: "credit_limit_change", entity: "customer",
      before: { credit_limit: c.credit_limit }, after: { credit_limit: limit }, reason: reason ?? null,
      created_at: new Date().toISOString(),
    } satisfies AuditLog);
    return updated;
  }

  async listEntries(opts?: { customer_id?: string; type?: string; from?: string; to?: string; includeReversed?: boolean }): Promise<Entry[]> {
    const d = await this.db();
    let all: Entry[] = await d.getAll("entries");
    if (opts?.customer_id) all = all.filter((e) => e.customer_id === opts.customer_id);
    if (opts?.type) all = all.filter((e) => e.type === opts.type);
    if (opts?.from) all = all.filter((e) => e.occurred_at >= opts.from!);
    if (opts?.to) all = all.filter((e) => e.occurred_at <= opts.to!);
    if (!opts?.includeReversed) all = all.filter((e) => e.status !== "reversed");
    return all.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }

  async getEntry(id: string): Promise<Entry | null> {
    const d = await this.db();
    return (await d.get("entries", id)) ?? null;
  }

  async listPayments(customerId?: string): Promise<Payment[]> {
    const d = await this.db();
    let all: Payment[] = await d.getAll("payments");
    if (customerId) all = all.filter((p) => p.customer_id === customerId);
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }

  async listAllocations(): Promise<Allocation[]> {
    const d = await this.db();
    return d.getAll("allocations");
  }

  async balanceMap(): Promise<Map<string, number>> {
    const d = await this.db();
    const entries: Entry[] = await d.getAll("entries");
    const payments: Payment[] = await d.getAll("payments");
    return allBalancesFromEntries(entries, payments);
  }

  async customerBalance(customerId: string): Promise<number> {
    const d = await this.db();
    const entries: Entry[] = await d.getAll("entries");
    const payments: Payment[] = await d.getAll("payments");
    return customerBalanceFromEntries(entries, payments, customerId);
  }

  async commit(input: CommitEntryInput): Promise<CommitResult> {
    const d = await this.db();
    const tx = d.transaction(
      ["shops", "products", "customers", "entries", "payments", "allocations", "movements", "alerts", "audit", "wanted", "meta"] as string[],
      "readwrite"
    );
    const shop: Shop | undefined = (await tx.objectStore("shops").getAll())[0];
    if (!shop) return { ok: false, reason: "validation", message: "Shop nahi mili." };

    const idem = await tx.objectStore("meta").get(`idem:${input.idempotency_key}`);
    if (idem) {
      const existing: Entry | undefined = await tx.objectStore("entries").get(idem.v.entry_id);
      if (existing) return { ok: false, reason: "duplicate", message: "Ye entry pehle save ho chuki hai." };
    }

    const allEntries: Entry[] = await tx.objectStore("entries").getAll();
    const allPayments: Payment[] = await tx.objectStore("payments").getAll();
    const allAllocations: Allocation[] = await tx.objectStore("allocations").getAll();
    const allProducts: Product[] = await tx.objectStore("products").getAll();
    const allCustomers: Customer[] = await tx.objectStore("customers").getAll();

    const decision = evaluateCommit({
      input,
      shop,
      products: allProducts,
      customers: allCustomers,
      entries: allEntries,
      payments: allPayments,
    });
    if (!decision.ok) return decision;

    const { entry, movements, payment, allocations, alerts, audit, wantedUpdate } = decision.plan;

    await tx.objectStore("entries").put(entry);
    for (const m of movements) {
      await tx.objectStore("movements").put(m);
      const p: Product | undefined = await tx.objectStore("products").get(m.product_id);
      if (p) await tx.objectStore("products").put({ ...p, stock_qty: round2(p.stock_qty + m.qty_change) });
    }
    if (payment) {
      await tx.objectStore("payments").put(payment);
      for (const a of allocations) await tx.objectStore("allocations").put(a);
    }
    for (const al of alerts) await tx.objectStore("alerts").put(al);
    if (audit) await tx.objectStore("audit").put(audit);
    if (wantedUpdate) {
      const w: WantedRequest | undefined = await tx.objectStore("wanted").get(wantedUpdate.id);
      if (w) await tx.objectStore("wanted").put({ ...w, ...wantedUpdate.patch });
    }
    await tx.objectStore("meta").put({ k: `idem:${input.idempotency_key}`, v: { entry_id: entry.id, at: new Date().toISOString() } });
    await tx.done;

    const balance_after = entry.customer_id ? customerBalanceFromEntries([...allEntries, entry], [...allPayments, ...(payment ? [payment] : [])], entry.customer_id) : undefined;
    void allAllocations;
    return { ok: true, entry, balance_after, alerts_created: alerts.length, recovered_wanted_id: wantedUpdate?.id ?? null };
  }

  async reverse(entryId: string, reason: string): Promise<CommitResult> {
    const d = await this.db();
    const tx = d.transaction(["shops", "entries", "products", "movements", "audit", "wanted"] as string[], "readwrite");
    const shop: Shop | undefined = (await tx.objectStore("shops").getAll())[0];
    const entry: Entry | undefined = await tx.objectStore("entries").get(entryId);
    if (!shop || !entry) return { ok: false, reason: "validation", message: "Entry nahi mili." };
    if (entry.status === "reversed") return { ok: false, reason: "validation", message: "Ye entry pehle hi reverse ho chuki hai." };

    const reversed: Entry = { ...entry, status: "reversed", reversed_by_id: uuid() };
    await tx.objectStore("entries").put(reversed);
    for (const line of entry.lines) {
      if (!line.product_id) continue;
      const qty = entry.type === "stock_in" ? -line.qty : entry.type === "sale" ? line.qty : 0;
      if (!qty) continue;
      const p: Product | undefined = await tx.objectStore("products").get(line.product_id);
      if (p) await tx.objectStore("products").put({ ...p, stock_qty: round2(p.stock_qty + qty) });
      await tx.objectStore("movements").put({
        id: uuid(), shop_id: shop.id, product_id: line.product_id, type: "reversal",
        qty_change: qty, entry_id: entry.id, at: new Date().toISOString(),
      });
    }
    await tx.objectStore("audit").put({
      id: uuid(), shop_id: shop.id, actor: "owner", action: "reverse", entity: "entry",
      before: { status: entry.status }, after: { status: "reversed" }, reason, created_at: new Date().toISOString(),
    } satisfies AuditLog);
    const wantedList: WantedRequest[] = await tx.objectStore("wanted").getAll();
    for (const w of wantedList) {
      if (w.linked_entry_id === entryId) await tx.objectStore("wanted").put({ ...w, linked_entry_id: null, status: "arrived" });
    }
    await tx.done;
    return { ok: true, entry: reversed, alerts_created: 0 };
  }

  async restore(entryId: string): Promise<CommitResult> {
    const d = await this.db();
    const tx = d.transaction(["shops", "entries", "products", "movements", "audit"] as string[], "readwrite");
    const shop: Shop | undefined = (await tx.objectStore("shops").getAll())[0];
    const entry: Entry | undefined = await tx.objectStore("entries").get(entryId);
    if (!shop || !entry) return { ok: false, reason: "validation", message: "Entry nahi mili." };
    if (entry.status !== "reversed") return { ok: false, reason: "validation", message: "Ye entry active hai." };
    const restored: Entry = { ...entry, status: "active", reversed_by_id: null };
    await tx.objectStore("entries").put(restored);
    for (const line of entry.lines) {
      if (!line.product_id) continue;
      const qty = entry.type === "stock_in" ? line.qty : entry.type === "sale" ? -line.qty : 0;
      if (!qty) continue;
      const p: Product | undefined = await tx.objectStore("products").get(line.product_id);
      if (p) await tx.objectStore("products").put({ ...p, stock_qty: round2(p.stock_qty + qty) });
      await tx.objectStore("movements").put({
        id: uuid(), shop_id: shop.id, product_id: line.product_id, type: "adjustment",
        qty_change: qty, entry_id: entry.id, at: new Date().toISOString(),
      });
    }
    await tx.objectStore("audit").put({
      id: uuid(), shop_id: shop.id, actor: "owner", action: "restore", entity: "entry",
      before: { status: "reversed" }, after: { status: "active" }, reason: "undo restore", created_at: new Date().toISOString(),
    } satisfies AuditLog);
    await tx.done;
    return { ok: true, entry: restored, alerts_created: 0 };
  }

  async listWanted(opts?: { status?: string }): Promise<WantedRequest[]> {
    const d = await this.db();
    let all: WantedRequest[] = await d.getAll("wanted");
    if (opts?.status) all = all.filter((w) => w.status === opts.status);
    return all.sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  }

  async addWanted(w: Omit<WantedRequest, "id" | "shop_id" | "requested_at">): Promise<WantedRequest> {
    const d = await this.db();
    const shop = await this.getShop();
    const req: WantedRequest = { ...w, id: uuid(), shop_id: shop.id, requested_at: new Date().toISOString() };
    await d.put("wanted", req);
    return req;
  }

  async updateWanted(id: string, patch: Partial<WantedRequest>): Promise<WantedRequest> {
    const d = await this.db();
    const w: WantedRequest | undefined = await d.get("wanted", id);
    if (!w) throw new Error("Request nahi mili");
    const updated = { ...w, ...patch, id: w.id, shop_id: w.shop_id };
    await d.put("wanted", updated);
    return updated;
  }

  async resolveWanted(id: string, opts: { status: WantedRequest["status"]; add_stock?: boolean; qty?: number }): Promise<WantedRequest> {
    const d = await this.db();
    const shop = await this.getShop();
    const w: WantedRequest | undefined = await d.get("wanted", id);
    if (!w) throw new Error("Request nahi mili");
    const updated: WantedRequest = { ...w, status: opts.status };
    await d.put("wanted", updated);
    if (opts.add_stock && w.product_id) {
      const p: Product | undefined = await d.get("products", w.product_id);
      if (p) {
        const qty = opts.qty ?? p.preferred_restock_qty ?? Math.max(1, w.qty);
        await d.put("products", { ...p, stock_qty: round2(p.stock_qty + qty) });
        await d.put("movements", {
          id: uuid(), shop_id: shop.id, product_id: w.product_id, type: "stock_in",
          qty_change: qty, entry_id: null, at: new Date().toISOString(),
        });
      }
    }
    await d.put("alerts", {
      id: uuid(), shop_id: shop.id, type: "info", severity: "info",
      title: "Mangwana update", message: `${w.item_text} — status: ${opts.status}`,
      related_type: "wanted", related_id: id, created_at: new Date().toISOString(),
      read_at: null, resolved_at: null, snoozed_until: null, action: null,
    } satisfies Alert);
    return updated;
  }

  async linkRecoveredSale(wantedId: string, entryId: string): Promise<void> {
    const d = await this.db();
    const w: WantedRequest | undefined = await d.get("wanted", wantedId);
    if (!w) return;
    if (w.linked_entry_id === entryId) return;
    await d.put("wanted", { ...w, linked_entry_id: entryId, status: "converted" });
  }

  async listAlerts(): Promise<Alert[]> {
    const d = await this.db();
    const all: Alert[] = await d.getAll("alerts");
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createAlert(a: Omit<Alert, "id" | "shop_id" | "created_at">): Promise<Alert> {
    const d = await this.db();
    const shop = await this.getShop();
    const alert: Alert = { ...a, id: uuid(), shop_id: shop.id, created_at: new Date().toISOString() };
    await d.put("alerts", alert);
    return alert;
  }

  async alertAction(id: string, action: "read" | "resolve" | "snooze", snoozeHours = 24): Promise<void> {
    const d = await this.db();
    const a: Alert | undefined = await d.get("alerts", id);
    if (!a) return;
    const now = new Date();
    if (action === "read") await d.put("alerts", { ...a, read_at: now.toISOString() });
    if (action === "resolve") await d.put("alerts", { ...a, resolved_at: now.toISOString(), read_at: a.read_at ?? now.toISOString() });
    if (action === "snooze") await d.put("alerts", { ...a, snoozed_until: new Date(now.getTime() + snoozeHours * 3600000).toISOString(), read_at: a.read_at ?? now.toISOString() });
  }

  async unreadAlertCount(): Promise<number> {
    const all = await this.listAlerts();
    const now = Date.now();
    return all.filter((a) => !a.read_at && !a.resolved_at && (!a.snoozed_until || new Date(a.snoozed_until).getTime() < now)).length;
  }

  async listAudit(opts?: { entity?: string; entity_id?: string; limit?: number }): Promise<AuditLog[]> {
    const d = await this.db();
    let all: AuditLog[] = await d.getAll("audit");
    if (opts?.entity) all = all.filter((a) => a.entity === opts.entity);
    if (opts?.limit) all = all.slice(0, opts.limit);
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createShareLink(input: { customer_id: string; from_date: string; to_date: string; expires_at: string }): Promise<{ link: ShareLink; token: string }> {
    const d = await this.db();
    const shop = await this.getShop();
    const token = randomToken();
    const link: ShareLink = {
      id: uuid(),
      shop_id: shop.id,
      customer_id: input.customer_id,
      from_date: input.from_date,
      to_date: input.to_date,
      expires_at: input.expires_at,
      revoked_at: null,
      created_by: "owner",
      token_hash: await sha256Hex(token),
    } as ShareLink & { token_hash: string };
    await d.put("share_links", link);
    await d.put("audit", {
      id: uuid(), shop_id: shop.id, actor: "owner", action: "statement_share_created", entity: "customer",
      before: null, after: { customer_id: input.customer_id, from: input.from_date, to: input.to_date, expires: input.expires_at },
      reason: null, created_at: new Date().toISOString(),
    } satisfies AuditLog);
    return { link, token };
  }

  async listShareLinks(): Promise<ShareLink[]> {
    const d = await this.db();
    const all: ShareLink[] = await d.getAll("share_links");
    return all.sort((a, b) => (b.expires_at ?? "").localeCompare(a.expires_at ?? ""));
  }

  async revokeShareLink(id: string): Promise<void> {
    const d = await this.db();
    const link: (ShareLink & { token_hash?: string }) | undefined = await d.get("share_links", id);
    if (!link) return;
    await d.put("share_links", { ...link, revoked_at: new Date().toISOString() });
  }

  async getShareByToken(token: string): Promise<StatementBundle | null> {
    const d = await this.db();
    const hash = await sha256Hex(token);
    const links: (ShareLink & { token_hash?: string })[] = await d.getAll("share_links");
    const link = links.find((l) => l.token_hash === hash);
    if (!link) return null;
    if (link.revoked_at) return null;
    if (new Date(link.expires_at).getTime() < Date.now()) return null;
    const customer: Customer | undefined = await d.get("customers", link.customer_id);
    if (!customer) return null;
    const allEntries: Entry[] = await d.getAll("entries");
    const allPayments: Payment[] = await d.getAll("payments");
    const allAllocations: Allocation[] = await d.getAll("allocations");
    const entries = allEntries.filter(
      (e) => e.customer_id === link.customer_id && e.occurred_at >= link.from_date && e.occurred_at <= link.to_date
    );
    const payments = allPayments.filter(
      (p) => p.customer_id === link.customer_id && p.date >= link.from_date && p.date <= link.to_date
    );
    return {
      link,
      customer,
      entries,
      payments,
      allocations: allAllocations.filter((a) => entries.some((e) => e.id === a.sale_entry_id)),
    };
  }

  async listMembers(): Promise<Member[]> {
    const d = await this.db();
    return d.getAll("members");
  }

  async addMember(m: { name: string; phone?: string; role: Member["role"]; permissions: Member["permissions"]; pin: string }): Promise<Member> {
    const d = await this.db();
    const shop = await this.getShop();
    const member: Member = {
      id: uuid(), shop_id: shop.id, user_id: await sha256Hex(m.pin),
      name: m.name, phone: m.phone, role: m.role, permissions: m.permissions,
    };
    await d.put("members", member);
    return member;
  }

  async reconcile() {
    const d = await this.db();
    const entries: Entry[] = await d.getAll("entries");
    const payments: Payment[] = await d.getAll("payments");
    const allocations: Allocation[] = await d.getAll("allocations");
    return reconcileRepo(entries, payments, allocations);
  }

  async exportAll(): Promise<{ filename: string; csv: string }[]> {
    const d = await this.db();
    const shop = await this.getShop();
    const stamp = new Date().toISOString().slice(0, 10);
    const customers: Customer[] = await d.getAll("customers");
    const products: Product[] = await d.getAll("products");
    const entries: Entry[] = await d.getAll("entries");
    const payments: Payment[] = await d.getAll("payments");
    const movements = await d.getAll("movements");
    const wanted: WantedRequest[] = await d.getAll("wanted");
    const alerts: Alert[] = await d.getAll("alerts");
    const audit: AuditLog[] = await d.getAll("audit");
    await this.setMeta("last_backup_at", new Date().toISOString());
    return [
      { filename: `customers-${stamp}.csv`, csv: csvFromRows(["id", "name", "phone", "credit_limit", "payment_terms_days", "created_at"], customers) },
      { filename: `products-${stamp}.csv`, csv: csvFromRows(["id", "name", "aliases", "unit", "selling_price", "cost_price", "stock_qty", "min_stock", "active"], products.map((p) => ({ ...p, aliases: p.aliases.join("|") }))) },
      { filename: `entries-${stamp}.csv`, csv: csvFromRows(["id", "type", "occurred_at", "customer_id", "total", "paid_now", "credit_amount", "method", "status", "source", "note"], entries) },
      { filename: `entry_lines-${stamp}.csv`, csv: csvFromRows(["entry_id", "description", "qty", "unit", "unit_price", "discount", "line_total"], entries.flatMap((e) => e.lines.map((l) => ({ entry_id: e.id, ...l })))) },
      { filename: `payments-${stamp}.csv`, csv: csvFromRows(["id", "customer_id", "amount", "date", "method", "reference"], payments) },
      { filename: `inventory_movements-${stamp}.csv`, csv: csvFromRows(["id", "product_id", "type", "qty_change", "entry_id", "at"], movements) },
      { filename: `wanted_requests-${stamp}.csv`, csv: csvFromRows(["id", "item_text", "qty", "customer_id", "reason", "status", "requested_at", "linked_entry_id"], wanted) },
      { filename: `alerts-${stamp}.csv`, csv: csvFromRows(["id", "type", "severity", "title", "message", "created_at", "read_at"], alerts) },
      { filename: `audit_log-${stamp}.csv`, csv: csvFromRows(["id", "actor", "action", "entity", "reason", "created_at"], audit) },
      { filename: `shop-${stamp}.csv`, csv: csvFromRows(["id", "name", "timezone", "currency"], [shop]) },
    ];
  }

  async healthSnapshot() {
    return {
      last_backup_at: await this.getMeta<string>("last_backup_at"),
      duplicates_blocked: (await this.getMeta<number>("duplicates_blocked")) ?? 0,
      failed_syncs: (await this.getMeta<number>("failed_syncs")) ?? 0,
    };
  }

  async saveDraft(d: Draft): Promise<void> {
    const dbi = await this.db();
    const shop = await this.getShop();
    const retention = new Date(Date.now() + shop.settings.retention_days * 86400000).toISOString();
    const stored: Draft = { ...d };
    if (!shop.settings.store_transcripts) stored.transcript = "";
    await dbi.put("drafts", { ...stored, retention_expires_at: retention });
  }

  async listDrafts(limit = 50): Promise<Draft[]> {
    const dbi = await this.db();
    const all: Draft[] = await dbi.getAll("drafts");
    return all.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }
}

export function defaultSettings(): ShopSettings {
  return {
    default_credit_limit: 5000,
    overdue_days: 30,
    hot_window_days: 7,
    hot_min_units: 8,
    hot_growth_pct: 40,
    low_stock_default: 5,
    store_transcripts: false,
    store_ocr_images: false,
    retention_days: 90,
    language: "roman",
    voice_reply: false,
    munshi_name: "Munshi",
    payment_info: null,
  };
}
