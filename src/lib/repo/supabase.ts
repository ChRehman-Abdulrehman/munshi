"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Alert, Allocation, AuditLog, CommitResult, Customer, Draft, Entry, Member, Payment, Product,
  ShareLink, Shop, ShopSettings, WantedRequest,
} from "../types";
import type { CommitEntryInput } from "../parser/schema";
import type { NewCustomer, NewProduct, Repo, Session, StatementBundle } from "./types";
import { csvFromRows } from "../export";

export class SupabaseRepo implements Repo {
  mode = "supabase" as const;
  private client: SupabaseClient;
  private session: Session | null = null;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, { auth: { persistSession: true } });
  }

  private async uid(): Promise<string | null> {
    const { data } = await this.client.auth.getUser();
    return data.user?.id ?? null;
  }

  private async shopId(): Promise<string> {
    if (this.session) return this.session.shop.id;
    const { data, error } = await this.client.from("shop_members").select("shop_id, shops(*)").limit(1).single();
    if (error || !data) throw new Error("Shop nahi mili.");
    const shop = (data as unknown as { shops: Shop }).shops;
    this.session = {
      shop: shop as Shop,
      member: { id: "", shop_id: shop.id, user_id: "", name: "", role: "owner", permissions: { can_override_credit: true, can_view_phones: true, can_edit_entries: true, can_share_statements: true } },
    };
    return this.session.shop.id;
  }

  async getSession(): Promise<Session | null> {
    try {
      const { data } = await this.client.auth.getSession();
      if (!data.session) return null;
      await this.shopId();
      return this.session;
    } catch {
      return null;
    }
  }

  async signIn(input: { name: string; pin: string; shopName?: string }): Promise<Session> {
    const email = `${input.name.trim().toLowerCase().replace(/\s+/g, ".")}@munshi.local`;
    const password = `munshi:${input.pin}`;
    const signInAttempt = await this.client.auth.signInWithPassword({ email, password });
    if (signInAttempt.error) {
      const signUp = await this.client.auth.signUp({ email, password });
      if (signUp.error) throw new Error("Login nahi ho saka. Internet ya details check karein.");
      if (input.shopName) {
        await this.client.rpc("create_shop", { shop_name: input.shopName, member_name: input.name });
      } else {
        await this.client.rpc("create_shop", { shop_name: `${input.name} ka karobar`, member_name: input.name });
      }
    }
    this.session = null;
    const s = await this.getSession();
    if (!s) throw new Error("Login nahi ho saka.");
    return s;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
    this.session = null;
  }

  async getShop(): Promise<Shop> {
    const { data, error } = await this.client.from("shops").select("*").limit(1).single();
    if (error || !data) throw new Error("Shop nahi mili.");
    return data as Shop;
  }

  async updateShopSettings(patch: Partial<ShopSettings>): Promise<Shop> {
    const shop = await this.getShop();
    const settings = { ...(shop.settings as ShopSettings), ...patch };
    const { data, error } = await this.client.from("shops").update({ settings }).eq("id", shop.id).select().single();
    if (error || !data) throw new Error("Settings save nahi hui.");
    return data as Shop;
  }

  async setDemoMode(on: boolean): Promise<void> {
    await this.client.rpc("set_demo_mode", { on_flag: on });
  }

  async seedDemo(): Promise<void> {
    await this.client.rpc("seed_demo");
  }

  async clearDemo(): Promise<void> {
    await this.client.rpc("clear_demo");
  }

  async listProducts(includeInactive = false): Promise<Product[]> {
    let q = this.client.from("products").select("*").order("name");
    if (!includeInactive) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Product[];
  }

  async upsertProduct(p: NewProduct): Promise<Product> {
    const row = {
      id: p.id ?? undefined, name: p.name, aliases: p.aliases ?? [], category: p.category ?? null,
      unit: p.unit, selling_price: p.selling_price, cost_price: p.cost_price ?? null,
      stock_qty: p.stock_qty, min_stock: p.min_stock, preferred_restock_qty: p.preferred_restock_qty ?? null,
      active: p.active ?? true, shop_id: await this.shopId(),
    };
    const { data, error } = await this.client.from("products").upsert(row).select().single();
    if (error || !data) throw new Error("Product save nahi hua.");
    return data as Product;
  }

  async adjustStock(productId: string, qtyChange: number, note?: string): Promise<void> {
    await this.client.rpc("adjust_stock", { p_product_id: productId, p_qty_change: qtyChange, p_note: note ?? null });
  }

  async listCustomers(): Promise<Customer[]> {
    const { data, error } = await this.client.from("customers").select("*").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as Customer[];
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const { data } = await this.client.from("customers").select("*").eq("id", id).maybeSingle();
    return (data as Customer) ?? null;
  }

  async upsertCustomer(c: NewCustomer): Promise<Customer> {
    const row = {
      id: c.id ?? undefined, name: c.name.trim(), phone: c.phone ?? null, notes: c.notes ?? null,
      credit_limit: c.credit_limit ?? null, payment_terms_days: c.payment_terms_days ?? null,
      shop_id: await this.shopId(),
    };
    const { data, error } = await this.client.from("customers").upsert(row).select().single();
    if (error || !data) throw new Error("Customer save nahi hua.");
    return data as Customer;
  }

  async setCreditLimit(customerId: string, limit: number | null, reason?: string): Promise<Customer> {
    const { data, error } = await this.client.rpc("set_credit_limit", { p_customer_id: customerId, p_limit: limit, p_reason: reason ?? null });
    if (error) throw new Error(error.message);
    return data as Customer;
  }

  async listEntries(opts?: { customer_id?: string; type?: string; from?: string; to?: string; includeReversed?: boolean }): Promise<Entry[]> {
    let q = this.client.from("entries").select("*, entry_lines(*)").order("occurred_at", { ascending: false });
    if (opts?.customer_id) q = q.eq("customer_id", opts.customer_id);
    if (opts?.type) q = q.eq("type", opts.type);
    if (opts?.from) q = q.gte("occurred_at", opts.from);
    if (opts?.to) q = q.lte("occurred_at", opts.to);
    if (!opts?.includeReversed) q = q.neq("status", "reversed");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: Record<string, unknown>) => ({ ...row, lines: row.entry_lines ?? [] })) as Entry[];
  }

  async getEntry(id: string): Promise<Entry | null> {
    const { data } = await this.client.from("entries").select("*, entry_lines(*)").eq("id", id).maybeSingle();
    if (!data) return null;
    return { ...(data as Record<string, unknown>), lines: (data as Record<string, unknown>).entry_lines ?? [] } as Entry;
  }

  async listPayments(customerId?: string): Promise<Payment[]> {
    let q = this.client.from("payments").select("*").order("date", { ascending: false });
    if (customerId) q = q.eq("customer_id", customerId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Payment[];
  }

  async listAllocations(): Promise<Allocation[]> {
    const { data, error } = await this.client.from("payment_allocations").select("*");
    if (error) throw new Error(error.message);
    return (data ?? []) as Allocation[];
  }

  async balanceMap(): Promise<Map<string, number>> {
    const { data, error } = await this.client.from("customer_balance").select("*");
    if (error) throw new Error(error.message);
    const map = new Map<string, number>();
    for (const row of (data ?? []) as { customer_id: string; balance: number }[]) map.set(row.customer_id, Number(row.balance));
    return map;
  }

  async customerBalance(customerId: string): Promise<number> {
    const map = await this.balanceMap();
    return map.get(customerId) ?? 0;
  }

  async commit(input: CommitEntryInput): Promise<CommitResult> {
    const { data, error } = await this.client.rpc("commit_entry", { payload: input });
    if (error) {
      if (error.message.includes("CREDIT_BLOCK")) {
        return { ok: false, reason: "credit_block", message: "Udhaar limit se zyada ho raha hai. Review karein." };
      }
      if (error.message.includes("DUPLICATE")) {
        return { ok: false, reason: "duplicate", message: "Ye entry pehle save ho chuki hai." };
      }
      return { ok: false, reason: "server", message: error.message };
    }
    const r = data as { entry: Entry; balance_after: number; alerts_created: number; recovered_wanted_id: string | null };
    return { ok: true, entry: r.entry, balance_after: r.balance_after, alerts_created: r.alerts_created, recovered_wanted_id: r.recovered_wanted_id };
  }

  async reverse(entryId: string, reason: string): Promise<CommitResult> {
    const { data, error } = await this.client.rpc("reverse_entry", { p_entry_id: entryId, p_reason: reason });
    if (error) return { ok: false, reason: "server", message: error.message };
    return { ok: true, entry: data as Entry, alerts_created: 0 };
  }

  async restore(entryId: string): Promise<CommitResult> {
    const { data, error } = await this.client.rpc("restore_entry", { p_entry_id: entryId });
    if (error) return { ok: false, reason: "server", message: error.message };
    return { ok: true, entry: data as Entry, alerts_created: 0 };
  }

  async listWanted(opts?: { status?: string }): Promise<WantedRequest[]> {
    let q = this.client.from("wanted_requests").select("*").order("requested_at", { ascending: false });
    if (opts?.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as WantedRequest[];
  }

  async addWanted(w: Omit<WantedRequest, "id" | "shop_id" | "requested_at">): Promise<WantedRequest> {
    const { data, error } = await this.client.from("wanted_requests").insert({ ...w, shop_id: await this.shopId() }).select().single();
    if (error || !data) throw new Error("Request save nahi hui.");
    return data as WantedRequest;
  }

  async updateWanted(id: string, patch: Partial<WantedRequest>): Promise<WantedRequest> {
    const { data, error } = await this.client.from("wanted_requests").update(patch).eq("id", id).select().single();
    if (error || !data) throw new Error("Update nahi hua.");
    return data as WantedRequest;
  }

  async resolveWanted(id: string, opts: { status: WantedRequest["status"]; add_stock?: boolean; qty?: number }): Promise<WantedRequest> {
    const { data, error } = await this.client.rpc("resolve_wanted", { p_id: id, p_status: opts.status, p_add_stock: opts.add_stock ?? false, p_qty: opts.qty ?? null });
    if (error) throw new Error(error.message);
    return data as WantedRequest;
  }

  async linkRecoveredSale(wantedId: string, entryId: string): Promise<void> {
    await this.client.rpc("link_recovered_sale", { p_wanted_id: wantedId, p_entry_id: entryId });
  }

  async listAlerts(): Promise<Alert[]> {
    const { data, error } = await this.client.from("alerts").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Alert[];
  }

  async createAlert(a: Omit<Alert, "id" | "shop_id" | "created_at">): Promise<Alert> {
    const { data, error } = await this.client.from("alerts").insert({ ...a, shop_id: await this.shopId() }).select().single();
    if (error || !data) throw new Error("Alert save nahi hua.");
    return data as Alert;
  }

  async alertAction(id: string, action: "read" | "resolve" | "snooze", snoozeHours = 24): Promise<void> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (action === "read") patch.read_at = now;
    if (action === "resolve") { patch.read_at = now; patch.resolved_at = now; }
    if (action === "snooze") { patch.read_at = now; patch.snoozed_until = new Date(Date.now() + snoozeHours * 3600000).toISOString(); }
    await this.client.from("alerts").update(patch).eq("id", id);
  }

  async unreadAlertCount(): Promise<number> {
    const { count } = await this.client.from("alerts").select("id", { count: "exact", head: true }).is("read_at", null).is("resolved_at", null);
    return count ?? 0;
  }

  async listAudit(opts?: { entity?: string; entity_id?: string; limit?: number }): Promise<AuditLog[]> {
    let q = this.client.from("audit_log").select("*").order("created_at", { ascending: false });
    if (opts?.entity) q = q.eq("entity", opts.entity);
    if (opts?.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as AuditLog[];
  }

  async createShareLink(input: { customer_id: string; from_date: string; to_date: string; expires_at: string }): Promise<{ link: ShareLink; token: string }> {
    const { data, error } = await this.client.rpc("create_share_link", {
      p_customer_id: input.customer_id, p_from: input.from_date, p_to: input.to_date, p_expires: input.expires_at,
    });
    if (error) throw new Error(error.message);
    const r = data as { link: ShareLink; token: string };
    return r;
  }

  async listShareLinks(): Promise<ShareLink[]> {
    const { data, error } = await this.client.from("share_links").select("*").order("expires_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ShareLink[];
  }

  async revokeShareLink(id: string): Promise<void> {
    await this.client.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  }

  async getShareByToken(token: string): Promise<StatementBundle | null> {
    const { data, error } = await this.client.rpc("get_share_by_token", { p_token: token });
    if (error || !data) return null;
    return data as StatementBundle;
  }

  async listMembers(): Promise<Member[]> {
    const { data, error } = await this.client.from("shop_members").select("*");
    if (error) throw new Error(error.message);
    return (data ?? []) as Member[];
  }

  async addMember(m: { name: string; phone?: string; role: Member["role"]; permissions: Member["permissions"]; pin: string }): Promise<Member> {
    const { data, error } = await this.client.rpc("add_member", { p_name: m.name, p_phone: m.phone ?? null, p_role: m.role, p_permissions: m.permissions, p_pin: m.pin });
    if (error) throw new Error(error.message);
    return data as Member;
  }

  async reconcile() {
    const { data, error } = await this.client.rpc("reconcile_balances");
    if (error) throw new Error(error.message);
    return data as { ok: boolean; diffs: { customer_id: string; derived: number; displayed: number; diff: number }[]; checked: number };
  }

  async exportAll(): Promise<{ filename: string; csv: string }[]> {
    const stamp = new Date().toISOString().slice(0, 10);
    const customers = await this.listCustomers();
    const products = await this.listProducts(true);
    const entries = await this.listEntries({ includeReversed: true });
    const payments = await this.listPayments();
    const wanted = await this.listWanted();
    const alerts = await this.listAlerts();
    return [
      { filename: `customers-${stamp}.csv`, csv: csvFromRows(["id", "name", "phone", "credit_limit", "payment_terms_days", "created_at"], customers) },
      { filename: `products-${stamp}.csv`, csv: csvFromRows(["id", "name", "aliases", "unit", "selling_price", "cost_price", "stock_qty", "min_stock", "active"], products.map((p) => ({ ...p, aliases: p.aliases.join("|") }))) },
      { filename: `entries-${stamp}.csv`, csv: csvFromRows(["id", "type", "occurred_at", "customer_id", "total", "paid_now", "credit_amount", "method", "status", "source", "note"], entries) },
      { filename: `payments-${stamp}.csv`, csv: csvFromRows(["id", "customer_id", "amount", "date", "method"], payments) },
      { filename: `wanted_requests-${stamp}.csv`, csv: csvFromRows(["id", "item_text", "qty", "customer_id", "reason", "status", "requested_at", "linked_entry_id"], wanted) },
      { filename: `alerts-${stamp}.csv`, csv: csvFromRows(["id", "type", "severity", "title", "message", "created_at", "read_at"], alerts) },
    ];
  }

  async healthSnapshot() {
    const { data } = await this.client.from("health_snapshot").select("*").maybeSingle();
    return {
      last_backup_at: (data as { last_backup_at: string | null } | null)?.last_backup_at ?? null,
      duplicates_blocked: (data as { duplicates_blocked: number } | null)?.duplicates_blocked ?? 0,
      failed_syncs: 0,
    };
  }

  async saveDraft(d: Draft): Promise<void> {
    await this.client.from("drafts").insert({
      shop_id: await this.shopId(), input_type: d.source, transcript: d.transcript,
      extracted: d, confidence: d.confidence, review_status: d.review_status, created_by: await this.uid(),
    });
  }

  async listDrafts(limit = 50): Promise<Draft[]> {
    const { data } = await this.client.from("drafts").select("*").order("created_at", { ascending: false }).limit(limit);
    return (data ?? []).map((r: { extracted: Draft }) => r.extracted) as Draft[];
  }
}
