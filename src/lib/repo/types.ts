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
import type { CommitEntryInput } from "../parser/schema";

export type RepoMode = "local" | "supabase";

export type Session = { shop: Shop; member: Member };

export type StatementBundle = {
  link: ShareLink;
  customer: Customer;
  entries: Entry[];
  payments: Payment[];
  allocations: Allocation[];
};

export type NewProduct = Omit<Product, "id" | "shop_id"> & { id?: string };
export type NewCustomer = Omit<Customer, "id" | "shop_id" | "created_at"> & { id?: string };

export interface Repo {
  mode: RepoMode;
  getSession(): Promise<Session | null>;
  signIn(input: { name: string; pin: string; shopName?: string }): Promise<Session>;
  signOut(): Promise<void>;
  getShop(): Promise<Shop>;
  updateShopSettings(patch: Partial<ShopSettings>): Promise<Shop>;
  setDemoMode(on: boolean): Promise<void>;
  seedDemo(): Promise<void>;
  clearDemo(): Promise<void>;

  listProducts(includeInactive?: boolean): Promise<Product[]>;
  upsertProduct(p: NewProduct): Promise<Product>;
  adjustStock(productId: string, qtyChange: number, note?: string): Promise<void>;

  listCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | null>;
  upsertCustomer(c: NewCustomer): Promise<Customer>;
  setCreditLimit(customerId: string, limit: number | null, reason?: string): Promise<Customer>;

  listEntries(opts?: { customer_id?: string; type?: string; from?: string; to?: string; includeReversed?: boolean }): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | null>;
  listPayments(customerId?: string): Promise<Payment[]>;
  listAllocations(): Promise<Allocation[]>;
  balanceMap(): Promise<Map<string, number>>;
  customerBalance(customerId: string): Promise<number>;

  commit(input: CommitEntryInput): Promise<CommitResult>;
  reverse(entryId: string, reason: string): Promise<CommitResult>;
  restore(entryId: string): Promise<CommitResult>;

  listWanted(opts?: { status?: string }): Promise<WantedRequest[]>;
  addWanted(w: Omit<WantedRequest, "id" | "shop_id" | "requested_at">): Promise<WantedRequest>;
  updateWanted(id: string, patch: Partial<WantedRequest>): Promise<WantedRequest>;
  resolveWanted(id: string, opts: { status: WantedRequest["status"]; add_stock?: boolean; qty?: number }): Promise<WantedRequest>;
  linkRecoveredSale(wantedId: string, entryId: string): Promise<void>;

  listAlerts(): Promise<Alert[]>;
  createAlert(a: Omit<Alert, "id" | "shop_id" | "created_at">): Promise<Alert>;
  alertAction(id: string, action: "read" | "resolve" | "snooze", snoozeHours?: number): Promise<void>;
  unreadAlertCount(): Promise<number>;

  listAudit(opts?: { entity?: string; entity_id?: string; limit?: number }): Promise<AuditLog[]>;

  createShareLink(input: { customer_id: string; from_date: string; to_date: string; expires_at: string }): Promise<{ link: ShareLink; token: string }>;
  listShareLinks(): Promise<ShareLink[]>;
  revokeShareLink(id: string): Promise<void>;
  getShareByToken(token: string): Promise<StatementBundle | null>;

  listMembers(): Promise<Member[]>;
  addMember(m: { name: string; phone?: string; role: Member["role"]; permissions: Member["permissions"]; pin: string }): Promise<Member>;

  reconcile(): Promise<{ ok: boolean; diffs: { customer_id: string; derived: number; displayed: number; diff: number }[]; checked: number }>;
  exportAll(): Promise<{ filename: string; csv: string }[]>;
  healthSnapshot(): Promise<{
    last_backup_at: string | null;
    duplicates_blocked: number;
    failed_syncs: number;
  }>;

  saveDraft(d: Draft): Promise<void>;
  listDrafts(limit?: number): Promise<Draft[]>;
}
