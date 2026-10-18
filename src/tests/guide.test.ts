import { describe, expect, it } from "vitest";
import { findCustomerInText, helpText, helpTitle, isFullClear, matchNavigation, searchHelp } from "@/lib/intel/guide";
import { draftFromPartial } from "@/lib/parser/rules";
import { C, P } from "./fixtures";

const customers = [
  C({ name: "Ali Mobile", id: "cust-ali-mobile" }),
  C({ name: "Ali Street 4", id: "cust-ali-street4" }),
  C({ name: "Bilal", id: "cust-bilal" }),
  C({ name: "Sana Bibi", id: "cust-sana" }),
];

const products = [P({ name: "Lawn Suit" })];
const ctx = { shop_id: "shop-1", products, customers };

describe("matchNavigation", () => {
  it("opens a specific customer's khata when the name is unambiguous", () => {
    const nav = matchNavigation("Bilal ka khata khol do", customers);
    expect(nav?.href).toBe("/khata/cust-bilal");
    expect(nav?.kind).toBe("customer");
  });

  it("falls back to the khata list when the name is ambiguous", () => {
    const nav = matchNavigation("Ali ka khata khol do", customers);
    expect(nav?.href).toBe("/khata");
    expect(nav?.kind).toBe("page");
  });

  it("navigates to stock and tabs", () => {
    expect(matchNavigation("stock kholo", customers)?.href).toBe("/stock");
    expect(matchNavigation("garam maal dikhao", customers)?.href).toBe("/stock?tab=garam");
    expect(matchNavigation("mangwana list kholo", customers)?.href).toBe("/stock?tab=mangwana");
  });

  it("does not hijack questions", () => {
    expect(matchNavigation("khata kaise kholun", customers)).toBeNull();
    expect(matchNavigation("Ali ka khata kaise kholein?", customers)).toBeNull();
  });

  it("returns null when there is no open-action or page match", () => {
    expect(matchNavigation("Ali ka khata", customers)).toBeNull();
    expect(matchNavigation("Aaj ka hisaab suna do", customers)).toBeNull();
  });
});

describe("findCustomerInText", () => {
  it("finds a unique customer by first-name token", () => {
    expect(findCustomerInText("bilal ka hisaab dikhao", customers)?.id).toBe("cust-bilal");
  });

  it("returns null when multiple customers share the token", () => {
    expect(findCustomerInText("ali ka khata", customers)).toBeNull();
  });
});

describe("isFullClear", () => {
  it("detects bill clear phrases", () => {
    expect(isFullClear("Ali ka bill clear kar do")).toBe(true);
    expect(isFullClear("Ali ka poora hisaab jama kar do")).toBe(true);
    expect(isFullClear("Sana ka khata band kar do")).toBe(true);
  });

  it("does not trigger when an explicit amount is given", () => {
    expect(isFullClear("Usman ne do hazaar paanch sau jama karaye")).toBe(false);
    expect(isFullClear("poora 5000 jama kar do")).toBe(false);
  });

  it("does not trigger on plain sales", () => {
    expect(isFullClear("Ali ko do lawn suit udhaar likh do")).toBe(false);
  });
});

describe("searchHelp", () => {
  it("answers how-to questions about entries", () => {
    expect(searchHelp("entry kaise karein")?.id).toBe("entry");
    expect(searchHelp("payment kaise likhun?")?.id).toBe("payment");
  });

  it("answers munshi-name change question", () => {
    expect(searchHelp("munshi ka naam kaise badlein")?.id).toBe("munshi_name");
  });

  it("does not treat normal commands as help", () => {
    expect(searchHelp("Ali ka khata khol do")).toBeNull();
    expect(searchHelp("Ali ko 2 lawn suit udhaar likh do")).toBeNull();
  });
});

describe("English mode", () => {
  it("returns English nav labels", () => {
    const nav = matchNavigation("Bilal ka khata khol do", customers, "en");
    expect(nav?.label).toBe("Bilal's account");
    expect(nav?.kind).toBe("customer");
    expect(matchNavigation("stock kholo", customers, "en")?.label).toBe("Stock");
    expect(matchNavigation("hot items show karo", customers, "en")?.href).toBe("/stock?tab=garam");
  });

  it("answers English help questions", () => {
    const topic = searchHelp("how do I add stock?");
    expect(topic?.id).toBe("stock");
    expect(helpText(topic!, "en")).toContain("How to add stock");
    expect(helpTitle(topic!, "en")).toBe("How to add stock");
  });

  it("matches English clear phrases", () => {
    expect(isFullClear("clear Ali's full bill")).toBe(true);
    expect(isFullClear("clear bill 5000")).toBe(false);
  });
});

describe("draftFromPartial", () => {
  it("builds a payment draft with the full balance", () => {
    const d = draftFromPartial(ctx, {
      intent: "payment",
      source: "voice",
      transcript: "Bilal ka bill clear kar do",
      customer: { text: "Bilal", id: "cust-bilal" },
      total: 2500,
      confidence: 0.9,
    });
    expect(d.intent).toBe("payment");
    expect(d.total).toBe(2500);
    expect(d.customer?.id).toBe("cust-bilal");
    expect(d.questions.some((q) => q.field === "method")).toBe(true);
    expect(d.confidence).toBeGreaterThan(0.5);
    expect(d.id).toBeTruthy();
    expect(d.shop_id).toBe("shop-1");
  });

  it("applies sale_credit arithmetic", () => {
    const d = draftFromPartial(ctx, {
      intent: "sale_credit",
      transcript: "test",
      total: 3000,
      paid_now: 1000,
    });
    expect(d.credit_amount).toBe(2000);
  });
});
