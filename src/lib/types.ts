export type Id = string;

export type Role = "owner" | "staff";
export type Permissions = {
  can_override_credit: boolean;
  can_view_phones: boolean;
  can_edit_entries: boolean;
  can_share_statements: boolean;
};

export type PaymentInfo = {
  method: "easypaisa" | "jazzcash" | "bank";
  title: string;
  number: string;
};

export type ShopSettings = {
  default_credit_limit: number;
  overdue_days: number;
  hot_window_days: number;
  hot_min_units: number;
  hot_growth_pct: number;
  low_stock_default: number;
  store_transcripts: boolean;
  store_ocr_images: boolean;
  retention_days: number;
  language: Lang;
  voice_reply: boolean;
  munshi_name?: string;
  payment_info?: PaymentInfo | null;
  password_hash?: string | null;
  password_salt?: string | null;
};

export type Lang = "roman" | "ur" | "en";

export type Shop = {
  id: Id;
  name: string;
  timezone: string;
  currency: "PKR";
  settings: ShopSettings;
  is_demo: boolean;
};

export type Member = {
  id: Id;
  shop_id: Id;
  user_id: string;
  name: string;
  phone?: string;
  role: Role;
  permissions: Permissions;
};

export type Product = {
  id: Id;
  shop_id: Id;
  name: string;
  aliases: string[];
  category?: string;
  unit: string;
  selling_price: number;
  cost_price?: number | null;
  stock_qty: number;
  min_stock: number;
  preferred_restock_qty?: number | null;
  active: boolean;
};

export type Customer = {
  id: Id;
  shop_id: Id;
  name: string;
  phone?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
  payment_terms_days?: number | null;
  created_at: string;
};

export type EntryType = "sale" | "payment" | "refund" | "stock_in" | "adjustment";
export type PayMethod = "cash" | "easypaisa" | "jazzcash" | "bank" | "credit";
export type EntryStatus = "active" | "reversed" | "needs_review";
export type EntrySource = "voice" | "text" | "manual" | "ocr" | "import" | "seed";

export type EntryLine = {
  id?: Id;
  entry_id?: Id;
  product_id?: Id | null;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  discount: number;
  line_total: number;
};

export type Entry = {
  id: Id;
  shop_id: Id;
  type: EntryType;
  customer_id?: Id | null;
  occurred_at: string;
  total: number;
  paid_now: number;
  credit_amount: number;
  method: PayMethod;
  status: EntryStatus;
  replaces_id?: Id | null;
  reversed_by_id?: Id | null;
  source: EntrySource;
  created_by?: string;
  idempotency_key: string;
  note?: string | null;
  lines: EntryLine[];
};

export type Payment = {
  id: Id;
  shop_id: Id;
  customer_id: Id;
  entry_id?: Id | null;
  amount: number;
  date: string;
  method: PayMethod;
  reference?: string | null;
};

export type Allocation = {
  id: Id;
  payment_id: Id;
  sale_entry_id: Id;
  amount: number;
};

export type InventoryMovement = {
  id: Id;
  shop_id: Id;
  product_id: Id;
  type: "sale" | "stock_in" | "adjustment" | "reversal" | "refund";
  qty_change: number;
  entry_id?: Id | null;
  at: string;
};

export type WantedReason = "out_of_stock" | "price" | "variant" | "deferred" | "other";
export type WantedStatus =
  | "new"
  | "to_order"
  | "ordered"
  | "arrived"
  | "customer_notified"
  | "converted"
  | "closed";

export type WantedRequest = {
  id: Id;
  shop_id: Id;
  item_text: string;
  product_id?: Id | null;
  variant_note?: string | null;
  qty: number;
  customer_id?: Id | null;
  contact_permission: boolean;
  reason: WantedReason;
  expected_price?: number | null;
  status: WantedStatus;
  requested_at: string;
  linked_entry_id?: Id | null;
  notes?: string | null;
};

export type AlertType =
  | "credit"
  | "low_stock"
  | "missed_demand"
  | "hot"
  | "summary"
  | "overdue"
  | "info";
export type Severity = "info" | "warning" | "critical";

export type Alert = {
  id: Id;
  shop_id: Id;
  type: AlertType;
  severity: Severity;
  title: string;
  message: string;
  related_type?: string | null;
  related_id?: Id | null;
  created_at: string;
  read_at?: string | null;
  resolved_at?: string | null;
  snoozed_until?: string | null;
  action?: { label: string; href: string } | null;
};

export type AuditLog = {
  id: Id;
  shop_id: Id;
  actor: string;
  action: string;
  entity: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  created_at: string;
};

export type ShareLink = {
  id: Id;
  shop_id: Id;
  customer_id: Id;
  from_date: string;
  to_date: string;
  expires_at: string;
  revoked_at?: string | null;
  created_by?: string;
};

export type DraftSource = "voice" | "text" | "ocr";

export type ParsedItem = {
  name: string;
  product_id?: Id | null;
  qty: number | null;
  unit: string;
  unit_price: number | null;
  discount: number;
  line_total: number | null;
  matched?: "exact" | "alias" | "fuzzy" | "none";
};

export type Intent =
  | "sale_cash"
  | "sale_credit"
  | "payment"
  | "refund"
  | "stock_in"
  | "wanted_item"
  | "resolve_wanted"
  | "update_entry"
  | "delete_entry"
  | "undo"
  | "set_credit_limit"
  | "add_customer"
  | "add_product"
  | "set_reminder"
  | "question"
  | "clarify";

export type Draft = {
  id: Id;
  shop_id: Id;
  intent: Intent;
  source: DraftSource;
  transcript: string;
  customer: { text: string; id?: Id | null; candidates?: Customer[] } | null;
  items: ParsedItem[];
  total: number | null;
  paid_now: number | null;
  credit_amount: number | null;
  method: PayMethod | null;
  occurred_at: string;
  note?: string | null;
  missing: string[];
  confidence: number;
  questions: Question[];
  warnings: string[];
  wanted?: {
    qty: number;
    reason: WantedReason;
    contact_permission: boolean;
    expected_price?: number | null;
    variant_note?: string | null;
  } | null;
  target_entry?: { id: Id; line_index?: number } | null;
  credit_limit_new?: number | null;
  review_status: "pending" | "approved" | "rejected" | "needs_review";
  created_at: string;
};

export type Question = {
  id: string;
  field: string;
  text: string;
  chips?: string[];
  type: "choice" | "number" | "text" | "confirm";
  options?: { label: string; value: string }[];
};

export type LlmGuess = {
  intent?: string | null;
  customer?: string | null;
  items?: { name?: string | null; qty?: number | null; unit_price?: number | null; unit?: string | null }[];
  total?: number | null;
  paid_now?: number | null;
  method?: string | null;
  credit_limit_new?: number | null;
  correction?: { field?: string | null; value?: number | null } | null;
  wanted_reason?: string | null;
  missing?: string[];
  confidence?: number | null;
};

export type CreditAssessment = {
  status: "ok" | "warn" | "block";
  balance: number;
  limit: number | null;
  projected: number;
  pct: number;
  message: string;
};

export type CommitResult =
  | { ok: true; entry: Entry; balance_after?: number; alerts_created: number; recovered_wanted_id?: Id | null }
  | { ok: false; reason: "credit_block" | "validation" | "duplicate" | "needs_review" | "server"; assessment?: CreditAssessment; message: string };

export type SyncState = "saved" | "saving" | "queued" | "needs_review" | "offline";

export type SaleStatus = "Paid" | "Partially paid" | "Unpaid" | "Reversed" | "Account payment";

export type CustomerBalance = {
  customer_id: Id;
  balance: number;
  oldest_unpaid_at?: string | null;
  total_sales: number;
  total_paid: number;
};

export type Intent_hot = {
  product_id: Id;
  units: number;
  value: number;
  prev_units: number;
  growth_pct: number;
  period_days: number;
};

export type DaySummary = {
  date: string;
  sales_total: number;
  cash_total: number;
  credit_total: number;
  payments_received: number;
  profit_estimate: number | null;
  entries_count: number;
  top_items: { name: string; qty: number; value: number }[];
};
