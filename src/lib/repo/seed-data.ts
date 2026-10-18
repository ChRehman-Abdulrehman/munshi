import type {
  Alert, Allocation, Customer, Entry, EntryLine, InventoryMovement, Member, Payment, Product, Shop, WantedRequest,
} from "../types";
import type { CommitEntryInput } from "../parser/schema";
import { lineTotal, planAllocation, round2 } from "../ledger/balance";
import { defaultSettings } from "./local";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHOP_ID = "demo-shop-ali";
const OWNER_ID = "demo-member-ali";

const PRODUCT_DEFS: { id: string; name: string; aliases: string[]; category: string; unit: string; price: number; cost: number; stock: number; min: number; restock: number }[] = [
  { id: "demo-p-lawn", name: "Lawn suit 3pc", aliases: ["lawn suit", "lawn ka suit", "lawn"], category: "Suit", unit: "suit", price: 2700, cost: 2100, stock: 8, min: 3, restock: 10 },
  { id: "demo-p-cotton-shalwar", name: "Cotton shalwar kameez", aliases: ["shalwar kameez", "cotton suit"], category: "Suit", unit: "suit", price: 1800, cost: 1350, stock: 14, min: 4, restock: 8 },
  { id: "demo-p-bag", name: "Kids school bag", aliases: ["school bag", "school bag bacha"], category: "Bags", unit: "pc", price: 950, cost: 700, stock: 2, min: 5, restock: 12 },
  { id: "demo-p-white-shalwar", name: "White shalwar", aliases: ["shalwar", "safed shalwar"], category: "Shalwar", unit: "pc", price: 600, cost: 420, stock: 20, min: 6, restock: 12 },
  { id: "demo-p-kurta", name: "Gents kurta", aliases: ["kurta", "gents kurta"], category: "Kurta", unit: "pc", price: 1500, cost: 1100, stock: 10, min: 3, restock: 6 },
  { id: "demo-p-dupatta", name: "Dupatta", aliases: ["dupatta", "chunni"], category: "Dupatta", unit: "pc", price: 450, cost: 320, stock: 30, min: 8, restock: 15 },
  { id: "demo-p-bedsheet", name: "Bed sheet double", aliases: ["bed sheet", "chadar"], category: "Home", unit: "set", price: 2200, cost: 1700, stock: 6, min: 2, restock: 6 },
  { id: "demo-p-pillow", name: "Pillow cover", aliases: ["pillow cover"], category: "Home", unit: "pair", price: 350, cost: 240, stock: 25, min: 6, restock: 12 },
  { id: "demo-p-towel", name: "Towel", aliases: ["toliya", "towal"], category: "Home", unit: "pc", price: 400, cost: 290, stock: 18, min: 5, restock: 10 },
  { id: "demo-p-socks", name: "Socks pack", aliases: ["mooze", "socks"], category: "Hosiery", unit: "packet", price: 250, cost: 170, stock: 40, min: 10, restock: 24 },
  { id: "demo-p-shirt", name: "Shirt cotton", aliases: ["shirt"], category: "Shirt", unit: "pc", price: 1200, cost: 880, stock: 12, min: 4, restock: 8 },
  { id: "demo-p-trouser", name: "Trouser", aliases: ["pant", "trouser"], category: "Trouser", unit: "pc", price: 1100, cost: 800, stock: 11, min: 4, restock: 8 },
  { id: "demo-p-uniform", name: "School uniform", aliases: ["uniform"], category: "Uniform", unit: "set", price: 1350, cost: 1000, stock: 9, min: 3, restock: 9 },
  { id: "demo-p-shawl", name: "Woolen shawl", aliases: ["shawl", "woolen shawl"], category: "Winter", unit: "pc", price: 2500, cost: 1900, stock: 7, min: 2, restock: 6 },
  { id: "demo-p-gift", name: "Gift pack", aliases: ["gift"], category: "Gift", unit: "pc", price: 800, cost: 600, stock: 5, min: 2, restock: 6 },
];

const CUSTOMER_DEFS: { id: string; name: string; phone: string | null; limit: number | null; terms: number | null; note?: string }[] = [
  { id: "demo-c-ali-mobile", name: "Ali Mobile", phone: "03001234567", limit: 5000, terms: 30 },
  { id: "demo-c-ali-street4", name: "Ali Street 4", phone: "03017654321", limit: 8000, terms: 30 },
  { id: "demo-c-bilal", name: "Bilal", phone: "03123456789", limit: 5000, terms: 30 },
  { id: "demo-c-sana", name: "Sana Bibi", phone: "03211234567", limit: 10000, terms: 45 },
  { id: "demo-c-fatima", name: "Fatima", phone: null, limit: null, terms: null },
  { id: "demo-c-usman", name: "Usman", phone: "03334567890", limit: 7000, terms: 30 },
  { id: "demo-c-ayesha", name: "Ayesha", phone: "03445678901", limit: 6000, terms: 30 },
  { id: "demo-c-kamran", name: "Kamran", phone: "03055512345", limit: 4000, terms: 20 },
  { id: "demo-c-nadia", name: "Nadia", phone: null, limit: null, terms: null },
  { id: "demo-c-imran", name: "Imran", phone: "03126677889", limit: 5000, terms: 30 },
];

export type SeedData = {
  shop: Shop;
  member: Member;
  products: Product[];
  customers: Customer[];
  entries: Entry[];
  payments: Payment[];
  allocations: Allocation[];
  movements: InventoryMovement[];
  wanted: WantedRequest[];
  alerts: Alert[];
};

export function seedDemoData(): SeedData {
  const rand = mulberry32(20261016);
  const now = new Date();
  const shop: Shop = {
    id: SHOP_ID,
    name: "Ali Cloth House, Lahore",
    timezone: "Asia/Karachi",
    currency: "PKR",
    is_demo: true,
    settings: {
      ...defaultSettings(),
      hot_min_units: 10,
      hot_growth_pct: 40,
      munshi_name: "Munshi",
      payment_info: { method: "easypaisa", title: "Ali Cloth House", number: "0300 1234567" },
    },
  };
  const member: Member = {
    id: OWNER_ID, shop_id: SHOP_ID, user_id: "demo-pin", name: "Ali",
    phone: "03001234567", role: "owner",
    permissions: { can_override_credit: true, can_view_phones: true, can_edit_entries: true, can_share_statements: true },
  };
  const products: Product[] = PRODUCT_DEFS.map((d) => ({
    id: d.id, shop_id: SHOP_ID, name: d.name, aliases: d.aliases, category: d.category,
    unit: d.unit, selling_price: d.price, cost_price: d.cost, stock_qty: d.stock,
    min_stock: d.min, preferred_restock_qty: d.restock, active: true,
  }));
  const customers: Customer[] = CUSTOMER_DEFS.map((d) => ({
    id: d.id, shop_id: SHOP_ID, name: d.name, phone: d.phone, notes: d.note ?? null,
    credit_limit: d.limit, payment_terms_days: d.terms, created_at: new Date(now.getTime() - 90 * 86400000).toISOString(),
  }));

  const entries: Entry[] = [];
  const payments: Payment[] = [];
  const allocations: Allocation[] = [];
  const movements: InventoryMovement[] = [];

  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const daysAgo = (d: number, hour?: number) => {
    const x = new Date(now.getTime() - d * 86400000);
    x.setHours(hour ?? 10 + Math.floor(rand() * 9), Math.floor(rand() * 60), 0, 0);
    return x.toISOString();
  };

  let entrySeq = 0;
  const addSale = (customerId: string | null, productId: string, qty: number, dayAgo: number, opts: { method?: "cash" | "credit"; paidRatio?: number } = {}) => {
    const product = products.find((p) => p.id === productId)!;
    entrySeq++;
    const lt = lineTotal(qty, product.selling_price);
    const method = opts.method ?? (customerId && rand() > 0.45 ? "credit" : "cash");
    const paidNow = method === "cash" ? lt : round2(lt * (opts.paidRatio ?? (rand() > 0.72 ? 0.5 : 0)));
    const occurred = daysAgo(dayAgo);
    const entry: Entry = {
      id: `demo-e-${entrySeq}`, shop_id: SHOP_ID, type: "sale", customer_id: customerId,
      occurred_at: occurred, total: lt, paid_now: paidNow, credit_amount: round2(lt - paidNow),
      method: paidNow > 0 && paidNow < lt ? "cash" : method === "cash" ? "cash" : "credit",
      status: "active", replaces_id: null, reversed_by_id: null, source: "seed",
      created_by: "Ali", idempotency_key: `seed-${entrySeq}`, note: null,
      lines: [{ product_id: productId, description: product.name, qty, unit: product.unit, unit_price: product.selling_price, discount: 0, line_total: lt }],
    };
    entries.push(entry);
    movements.push({ id: `demo-m-${entrySeq}`, shop_id: SHOP_ID, product_id: productId, type: "sale", qty_change: -qty, entry_id: entry.id, at: occurred });
    return entry;
  };

  const addPayment = (customerId: string, amount: number, dayAgo: number, method: "cash" | "easypaisa" = "cash") => {
    const customerSales = entries.filter((e) => e.customer_id === customerId && e.type === "sale" && e.status === "active");
    const plan = planAllocation(amount, customerSales, allocations);
    const id = `demo-pay-${payments.length + 1}`;
    const date = daysAgo(dayAgo, 18);
    payments.push({ id, shop_id: SHOP_ID, customer_id: customerId, entry_id: id, amount, date, method, reference: null });
    entries.push({
      id, shop_id: SHOP_ID, type: "payment", customer_id: customerId, occurred_at: date,
      total: amount, paid_now: amount, credit_amount: 0, method, status: "active",
      replaces_id: null, reversed_by_id: null, source: "seed", created_by: "Ali",
      idempotency_key: `seed-pay-${id}`, note: null, lines: [],
    });
    for (const a of plan.allocations) {
      allocations.push({ id: `demo-al-${allocations.length + 1}`, payment_id: id, sale_entry_id: a.sale_entry_id, amount: a.amount });
    }
  };

  const ranked = [...PRODUCT_DEFS].sort((a, b) => PRODUCT_DEFS.indexOf(a) - PRODUCT_DEFS.indexOf(b));

  for (let day = 30; day >= 1; day--) {
    const salesToday = 3 + Math.floor(rand() * 3);
    for (let s = 0; s < salesToday; s++) {
      const product = pick(ranked.slice(0, 10));
      const customer = rand() > 0.42 ? pick(customers) : null;
      addSale(customer?.id ?? null, product.id, 1 + Math.floor(rand() * 2), day);
    }
    if (day % 7 === 0) {
      addSale(customers[4].id, "demo-p-bag", 1, day, { method: "credit" });
    }
  }

  for (const customer of customers) {
    if (rand() > 0.5) addPayment(customer.id, 500 + Math.floor(rand() * 8) * 500, 1 + Math.floor(rand() * 20));
  }

  addPayment("demo-c-usman", 1000, 25);
  addPayment("demo-c-bilal", 2000, 12);
  addPayment("demo-c-ali-mobile", 1500, 3);
  addPayment("demo-c-ayesha", 500, 40);

  const spikeDays = [6, 5, 4, 3, 2, 1, 0];
  for (const d of spikeDays) {
    addSale(rand() > 0.5 ? "demo-c-sana" : "demo-c-ali-street4", "demo-p-lawn", d === 0 ? 2 : 3, d, { method: "cash" });
  }
  addSale("demo-c-bilal", "demo-p-lawn", 4, 7, { method: "cash" });

  const stockIn: Entry = {
    id: "demo-e-stock-1", shop_id: SHOP_ID, type: "stock_in", customer_id: null,
    occurred_at: daysAgo(9, 9), total: 0, paid_now: 0, credit_amount: 0, method: "cash",
    status: "active", replaces_id: null, reversed_by_id: null, source: "seed", created_by: "Ali",
    idempotency_key: "seed-stock-1", note: "Naya maal", lines: [
      { product_id: "demo-p-lawn", description: "Lawn suit 3pc", qty: 10, unit: "suit", unit_price: 2100, discount: 0, line_total: 21000 },
      { product_id: "demo-p-dupatta", description: "Dupatta", qty: 15, unit: "pc", unit_price: 320, discount: 0, line_total: 4800 },
    ],
  };
  entries.push(stockIn);
  movements.push({ id: "demo-m-stock-1", shop_id: SHOP_ID, product_id: "demo-p-lawn", type: "stock_in", qty_change: 10, entry_id: stockIn.id, at: stockIn.occurred_at });
  movements.push({ id: "demo-m-stock-2", shop_id: SHOP_ID, product_id: "demo-p-dupatta", type: "stock_in", qty_change: 15, entry_id: stockIn.id, at: stockIn.occurred_at });

  const wanted: WantedRequest[] = [
    { id: "demo-w-1", shop_id: SHOP_ID, item_text: "Blue lawn suit", product_id: "demo-p-lawn", variant_note: "blue", qty: 1, customer_id: "demo-c-sana", contact_permission: true, reason: "variant", expected_price: 2700, status: "new", requested_at: daysAgo(5, 12), linked_entry_id: null, notes: null },
    { id: "demo-w-2", shop_id: SHOP_ID, item_text: "Blue lawn suit", product_id: "demo-p-lawn", variant_note: "blue", qty: 2, customer_id: "demo-c-nadia", contact_permission: true, reason: "out_of_stock", expected_price: 2700, status: "new", requested_at: daysAgo(4, 13), linked_entry_id: null, notes: null },
    { id: "demo-w-3", shop_id: SHOP_ID, item_text: "Blue lawn suit", product_id: "demo-p-lawn", variant_note: "blue", qty: 1, customer_id: "demo-c-fatima", contact_permission: false, reason: "out_of_stock", expected_price: 2700, status: "new", requested_at: daysAgo(3, 16), linked_entry_id: null, notes: null },
    { id: "demo-w-4", shop_id: SHOP_ID, item_text: "Blue lawn suit", product_id: "demo-p-lawn", variant_note: "blue", qty: 1, customer_id: "demo-c-imran", contact_permission: true, reason: "out_of_stock", expected_price: 2700, status: "ordered", requested_at: daysAgo(2, 11), linked_entry_id: null, notes: null },
    { id: "demo-w-5", shop_id: SHOP_ID, item_text: "Blue lawn suit", product_id: "demo-p-lawn", variant_note: "blue", qty: 1, customer_id: "demo-c-kamran", contact_permission: false, reason: "deferred", expected_price: 2700, status: "new", requested_at: daysAgo(1, 12), linked_entry_id: null, notes: null },
    { id: "demo-w-6", shop_id: SHOP_ID, item_text: "Kids school bag", product_id: "demo-p-bag", variant_note: null, qty: 1, customer_id: "demo-c-fatima", contact_permission: false, reason: "out_of_stock", expected_price: 950, status: "new", requested_at: daysAgo(6, 15), linked_entry_id: null, notes: null },
    { id: "demo-w-7", shop_id: SHOP_ID, item_text: "Kids school bag", product_id: "demo-p-bag", variant_note: null, qty: 1, customer_id: "demo-c-nadia", contact_permission: true, reason: "out_of_stock", expected_price: 950, status: "new", requested_at: daysAgo(2, 17), linked_entry_id: null, notes: null },
    { id: "demo-w-8", shop_id: SHOP_ID, item_text: "White shalwar", product_id: "demo-p-white-shalwar", variant_note: null, qty: 2, customer_id: "demo-c-usman", contact_permission: true, reason: "out_of_stock", expected_price: 600, status: "new", requested_at: daysAgo(8, 10), linked_entry_id: null, notes: null },
  ];

  const alerts: Alert[] = [
    { id: "demo-a-1", shop_id: SHOP_ID, type: "low_stock", severity: "critical", title: "Kids school bag khatam hone wala hai", message: "Stock 2 hai, minimum 5. 2 customers maang chuke hain.", related_type: "product", related_id: "demo-p-bag", created_at: daysAgo(0, 9), read_at: null, resolved_at: null, snoozed_until: null, action: { label: "Mangwane ki list mein daalo", href: "/stock?tab=mangwana" } },
    { id: "demo-a-2", shop_id: SHOP_ID, type: "credit", severity: "warning", title: "Bilal limit se oopar", message: "Balance limit se zyada hai. Naya udhaar dene se pehle payment lein.", related_type: "customer", related_id: "demo-c-bilal", created_at: daysAgo(0, 9), read_at: null, resolved_at: null, snoozed_until: null, action: { label: "Khata kholein", href: "/khata/demo-c-bilal" } },
    { id: "demo-a-3", shop_id: SHOP_ID, type: "missed_demand", severity: "warning", title: "Blue lawn suit 5 baar maangi", message: "Stock 0 nahi, magar blue rang khatam tha. Mangwana behtar hai.", related_type: "wanted", related_id: "demo-w-1", created_at: daysAgo(0, 9), read_at: null, resolved_at: null, snoozed_until: null, action: { label: "Mangwana hai", href: "/stock?tab=mangwana" } },
    { id: "demo-a-4", shop_id: SHOP_ID, type: "hot", severity: "info", title: "Lawn suit 3pc garam ho gaya!", message: "Is hafte 20+ suit bike — pichlay hafte se kaafi zyada.", related_type: "product", related_id: "demo-p-lawn", created_at: daysAgo(0, 9), read_at: null, resolved_at: null, snoozed_until: null, action: { label: "Stock dekhein", href: "/stock" } },
    { id: "demo-a-5", shop_id: SHOP_ID, type: "overdue", severity: "warning", title: "Usman ka udhaar 30 din se purana", message: "Purana balance wapis nahi aaya. Reminder bhejne ka mashwara hai.", related_type: "customer", related_id: "demo-c-usman", created_at: daysAgo(0, 9), read_at: null, resolved_at: null, snoozed_until: null, action: { label: "Statement bhejein", href: "/khata/demo-c-usman" } },
  ];

  return { shop, member, products, customers, entries, payments, allocations, movements, wanted, alerts };
}

export function demoSpikeCommits(): CommitEntryInput[] {
  const inputs: CommitEntryInput[] = [];
  const stamp = Date.now();
  for (let i = 0; i < 6; i++) {
    inputs.push({
      idempotency_key: `demo-spike-lawn-${stamp}-${i}`,
      type: "sale",
      customer_id: i % 2 === 0 ? "demo-c-sana" : null,
      occurred_at: new Date().toISOString(),
      total: 5400,
      paid_now: i % 2 === 0 ? 0 : 5400,
      method: i % 2 === 0 ? "credit" : "cash",
      source: "manual",
      note: null,
      lines: [{ product_id: "demo-p-lawn", description: "Lawn suit 3pc", qty: 2, unit: "suit", unit_price: 2700, discount: 0 }],
    });
  }
  inputs.push({
    idempotency_key: `demo-spike-limit-${stamp}`,
    type: "sale",
    customer_id: "demo-c-ali-mobile",
    occurred_at: new Date().toISOString(),
    total: 2700,
    paid_now: 0,
    method: "credit",
    source: "manual",
    note: "Demo: limit crossing",
    lines: [{ product_id: "demo-p-lawn", description: "Lawn suit 3pc", qty: 1, unit: "suit", unit_price: 2700, discount: 0 }],
  });
  return inputs;
}
