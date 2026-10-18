import { describe, expect, it } from "vitest";
import { parseUtterance, matchCustomer, applyClarification } from "@/lib/parser/rules";
import { BASE_CUSTOMERS, BASE_PRODUCTS, P, TWO_ALIS, now } from "./fixtures";

const ctx = { shop_id: "shop-1", products: BASE_PRODUCTS, customers: BASE_CUSTOMERS, now };

describe("test 1: cash sale draft, nothing saved", () => {
  it("2 packets at PKR 100 each, cash → total 200", () => {
    const d = parseUtterance("2 packets at PKR 100 each, cash", ctx);
    expect(d.total).toBe(200);
    expect(d.intent).toBe("sale_cash");
    expect(d.paid_now).toBe(200);
    expect(d.items[0].qty).toBe(2);
    expect(d.items[0].unit_price).toBe(100);
    expect(d.review_status).toBe("pending");
    expect(d.credit_amount).toBe(0);
  });

  it("Cash sale: 3 shampoo, 250 each → total 750", () => {
    const d = parseUtterance("Cash sale: 3 shampoo, 250 each", ctx);
    expect(d.intent).toBe("sale_cash");
    expect(d.total).toBe(750);
    expect(d.items[0].product_id).toBe("prod-shampoo");
    expect(d.items[0].qty).toBe(3);
    expect(d.items[0].unit_price).toBe(250);
    expect(d.confidence).toBeGreaterThan(0.7);
  });
});

describe("auto price from stock", () => {
  it("fills the saved selling price when a catalog product is mentioned without a price", () => {
    const d = parseUtterance("Ali ko 2 shampoo udhaar likh do", ctx);
    expect(d.items[0].product_id).toBe("prod-shampoo");
    expect(d.items[0].unit_price).toBe(250);
    expect(d.items[0].line_total).toBe(500);
    expect(d.total).toBe(500);
  });

  it("keeps a spoken price when given", () => {
    const d = parseUtterance("Ali ko 2 shampoo 300 ka udhaar likh do", ctx);
    expect(d.items[0].unit_price).toBe(300);
    expect(d.total).toBe(600);
  });
});

describe("test 2: ambiguous customer is never chosen silently", () => {
  it("two customers named Ali → asks which", () => {
    const twoAliCtx = { ...ctx, customers: TWO_ALIS };
    const d = parseUtterance("Ali ko udhaar 500 rupay likh do", twoAliCtx);
    expect(d.customer?.id).toBeNull();
    expect(d.customer?.candidates?.length).toBe(2);
    const q = d.questions.find((x) => x.id === "customer");
    expect(q).toBeTruthy();
    expect(q!.options?.length).toBe(2);
    expect(d.confidence).toBeLessThan(0.8);
  });

  it("matchCustomer returns no best when scores are close", () => {
    const m = matchCustomer("Ali", TWO_ALIS);
    expect(m.best).toBeNull();
    expect(m.candidates.length).toBe(2);
  });
});

describe("test 3: missing price auto-fills saved catalogue price", () => {
  it("quantity without price → price filled from stock, no question", () => {
    const d = parseUtterance("5 shampoo nikale", ctx);
    expect(d.items[0].product_id).toBe("prod-shampoo");
    expect(d.items[0].unit_price).toBe(250);
    expect(d.items[0].line_total).toBe(1250);
    expect(d.missing).not.toContain("price:0");
    expect(d.questions.find((x) => x.id === "price:0")).toBeUndefined();
  });

  it("still asks when the matched product has no saved price", () => {
    const noPriceCtx = { ...ctx, products: [...BASE_PRODUCTS, P({ name: "Surf", selling_price: 0 })] };
    const d = parseUtterance("2 surf nikale", noPriceCtx);
    expect(d.items[0].product_id).toBe("prod-surf");
    expect(d.items[0].unit_price).toBeNull();
    expect(d.missing).toContain("price:0");
    expect(d.questions.find((x) => x.id === "price:0")).toBeTruthy();
  });

  it("missing quantity → qty question", () => {
    const d = parseUtterance("cheeni 150 ka udhaar likh do", ctx);
    expect(d.items[0].qty).toBeNull();
    const q = d.questions.find((x) => x.id === "qty:0");
    expect(q).toBeTruthy();
  });
});

describe("example utterances", () => {
  it("Ali ko do kilo cheeni aur aik cooking oil 550 ka udhaar likh do", () => {
    const d = parseUtterance("Ali ko do kilo cheeni aur aik cooking oil 550 ka udhaar likh do.", ctx);
    expect(d.intent).toBe("sale_credit");
    expect(d.customer?.id).toBe("cust-ali");
    expect(d.items.length).toBe(2);
    const cheeni = d.items[0];
    expect(cheeni.name).toBe("Cheeni");
    expect(cheeni.qty).toBe(2);
    expect(cheeni.unit).toBe("kg");
    expect(cheeni.unit_price).toBe(150);
    expect(cheeni.line_total).toBe(300);
    const oil = d.items[1];
    expect(oil.product_id).toBe("prod-cooking-oil-1l");
    expect(oil.qty).toBe(1);
    expect(oil.unit_price).toBe(550);
    expect(oil.line_total).toBe(550);
    expect(d.total).toBe(850);
    expect(d.missing).not.toContain("price:0");
  });

  it("Ahmed ne pichlay udhaar ke 1,000 rupay de diye", () => {
    const d = parseUtterance("Ahmed ne pichlay udhaar ke 1,000 rupay de diye.", ctx);
    expect(d.intent).toBe("payment");
    expect(d.customer?.id).toBe("cust-ahmed");
    expect(d.total).toBe(1000);
    expect(d.items.length).toBe(0);
  });

  it("Do packets biscuits stock mein add karo", () => {
    const d = parseUtterance("Do packets biscuits stock mein add karo.", ctx);
    expect(d.intent).toBe("stock_in");
    expect(d.items[0].product_id).toBe("prod-biscuits");
    expect(d.items[0].qty).toBe(2);
    expect(d.items[0].unit).toBe("packet");
  });

  it("Customer ne doodh manga tha, stock khatam tha", () => {
    const d = parseUtterance("Customer ne doodh manga tha, stock khatam tha.", ctx);
    expect(d.intent).toBe("wanted_item");
    expect(d.items[0].name.toLowerCase()).toContain("doodh");
    expect(d.wanted?.reason).toBe("out_of_stock");
    expect(d.total).toBeNull();
  });

  it("Bilal ne blue lawn suit maangi, nahi thi", () => {
    const d = parseUtterance("Bilal ne blue lawn suit maangi, nahi thi", ctx);
    expect(d.intent).toBe("wanted_item");
    expect(d.customer?.id).toBe("cust-bilal");
    expect(d.items[0].product_id).toBe("prod-lawn-suit-3pc");
    expect(d.wanted?.variant_note).toBe("blue");
    expect(d.wanted?.reason).toBe("out_of_stock");
  });

  it("mixed payment: 1000 ka, 600 abhi diye → credit 400", () => {
    const d = parseUtterance("1000 ka, 600 abhi diye", ctx);
    expect(d.total).toBe(1000);
    expect(d.paid_now).toBe(600);
    expect(d.credit_amount).toBe(400);
    expect(d.intent).toBe("sale_credit");
  });
});

describe("edit / delete intents", () => {
  it("pehli entry mein 3 nahi 4 thay", () => {
    const d = parseUtterance("pehli entry mein 3 nahi 4 thay", ctx);
    expect(d.intent).toBe("update_entry");
    const c = (d as unknown as { correction: { field: string; old: number; value: number; target_hint: string } }).correction;
    expect(c.field).toBe("qty");
    expect(c.old).toBe(3);
    expect(c.value).toBe(4);
    expect(c.target_hint).toBe("first");
    expect(d.questions.some((q) => q.id === "target_entry")).toBe(true);
  });

  it("rate 2700 kar do", () => {
    const d = parseUtterance("rate 2700 kar do", ctx);
    expect(d.intent).toBe("update_entry");
    const c = (d as unknown as { correction: { field: string; value: number } }).correction;
    expect(c.field).toBe("price");
    expect(c.value).toBe(2700);
  });

  it("aakhri entry hata do", () => {
    const d = parseUtterance("aakhri entry hata do", ctx);
    expect(d.intent).toBe("delete_entry");
    expect(d.warnings.length).toBeGreaterThan(0);
  });

  it("Blue lawn suit aa gaya", () => {
    const d = parseUtterance("Blue lawn suit aa gaya", ctx);
    expect(d.intent).toBe("resolve_wanted");
    expect(d.items[0].product_id).toBe("prod-lawn-suit-3pc");
  });
});

describe("questions", () => {
  it("is hafte sab se zyada kya bika?", () => {
    const d = parseUtterance("is hafte sab se zyada kya bika?", ctx);
    expect(d.intent).toBe("question");
  });

  it("kis ka udhaar 30 din se purana hai?", () => {
    const d = parseUtterance("kis ka udhaar 30 din se purana hai?", ctx);
    expect(d.intent).toBe("question");
  });

  it("unrecognized text → clarify with chips", () => {
    const d = parseUtterance("hmm theek hai", ctx);
    expect(d.intent).toBe("clarify");
    expect(d.questions.length).toBeGreaterThan(0);
  });
});

describe("clarification flow", () => {
  it("answering qty + price makes draft ready", () => {
    let d = parseUtterance("5 shampoo nikale", ctx);
    d = applyClarification(d, "price:0", 250, ctx);
    expect(d.items[0].unit_price).toBe(250);
    expect(d.total).toBe(1250);
    expect(d.missing.filter((m) => m.startsWith("price:"))).toEqual([]);
    expect(d.questions.filter((q) => q.id === "price:0").length).toBe(0);
  });

  it("answering customer ambiguity resolves id", () => {
    const twoAliCtx = { ...ctx, customers: TWO_ALIS };
    let d = parseUtterance("Ali ko udhaar 500 rupay likh do", twoAliCtx);
    d = applyClarification(d, "customer", TWO_ALIS[0].id, twoAliCtx);
    expect(d.customer?.id).toBe(TWO_ALIS[0].id);
  });
});
