import { describe, expect, it } from "vitest";
import { mergeEnhancement, numbersInUtterance } from "@/lib/parser/rules";
import type { Draft, LlmGuess } from "@/lib/types";
import { C, P } from "./fixtures";

const products = [
  P({ name: "Lawn Suit", aliases: ["lawn"], selling_price: 1500, unit: "suit" }),
  P({ name: "Kurta", aliases: ["kurtay"], selling_price: 800 }),
  P({ name: "Aata", aliases: ["flour"], selling_price: 2600, unit: "bori" }),
];

const customers = [C({ name: "Ali Raza" }), C({ name: "Sana Bibi" }), C({ name: "Usman" })];

function mkDraft(partial: Partial<Draft>): Draft {
  return {
    id: "d1",
    shop_id: "shop-1",
    intent: "clarify",
    source: "voice",
    transcript: "Ali ko do lawn suit pandrah sau ka udhaar likh do",
    customer: null,
    items: [],
    total: null,
    paid_now: null,
    credit_amount: null,
    method: null,
    occurred_at: "2026-10-16T10:00:00.000Z",
    note: null,
    missing: [],
    confidence: 0.2,
    questions: [],
    warnings: [],
    wanted: null,
    target_entry: null,
    credit_limit_new: null,
    review_status: "pending",
    created_at: "2026-10-16T10:00:00.000Z",
    ...partial,
  };
}

const ctx = { shop_id: "shop-1", products, customers };

describe("numbersInUtterance", () => {
  it("extracts digits and roman-urdu number words", () => {
    const nums = numbersInUtterance("Ali ko do lawn suit pandrah sau ka udhaar likh do");
    expect(nums).toContain(2);
    expect(nums).toContain(1500);
  });

  it("handles multipliers like dhai hazaar", () => {
    expect(numbersInUtterance("dhai hazaar rupay jama karaye")).toContain(2500);
  });

  it("handles comma separated digits", () => {
    expect(numbersInUtterance("2,500 rupay cash mile")).toContain(2500);
  });
});

describe("mergeEnhancement", () => {
  it("upgrades clarify to sale_credit and fills verified fields", () => {
    const base = mkDraft({ transcript: "Ali ko do lawn suit pandrah sau ka udhaar likh do" });
    const guess: LlmGuess = {
      intent: "sale_credit",
      customer: "Ali Raza",
      items: [{ name: "lawn suit", qty: 2, unit_price: 1500, unit: "suit" }],
      confidence: 0.9,
    };
    const d = mergeEnhancement(base, guess, ctx);
    expect(d.intent).toBe("sale_credit");
    expect(d.customer?.id).toBe("cust-ali-raza");
    expect(d.items).toHaveLength(1);
    expect(d.items[0].qty).toBe(2);
    expect(d.items[0].unit_price).toBe(1500);
    expect(d.items[0].product_id).toBe("prod-lawn-suit");
    expect(d.total).toBe(3000);
    expect(d.confidence).toBeGreaterThan(0.4);
    expect(d.questions.some((q) => q.field === "intent")).toBe(false);
  });

  it("rejects invented numbers not present in the utterance", () => {
    const base = mkDraft({ transcript: "Ali ko kurta de diya cash" });
    const guess: LlmGuess = {
      intent: "sale_cash",
      customer: "Ali",
      items: [{ name: "kurta", qty: 4, unit_price: 999 }],
      total: 3996,
      confidence: 0.8,
    };
    const d = mergeEnhancement(base, guess, ctx);
    expect(d.items).toHaveLength(1);
    expect(d.items[0].qty).toBeNull();
    expect(d.items[0].unit_price).toBeNull();
    expect(d.total).toBeNull();
    expect(d.questions.some((q) => q.field === "qty:0")).toBe(true);
    expect(d.questions.some((q) => q.field === "price:0")).toBe(true);
  });

  it("never accepts hallucinated totals even when other fields verify", () => {
    const base = mkDraft({ transcript: "Sana ko ek lawn suit pandrah sau ka bech do" });
    const guess: LlmGuess = {
      intent: "sale_cash",
      customer: "Sana",
      items: [{ name: "lawn suit", qty: 1, unit_price: 1500 }],
      total: 5000,
      confidence: 0.9,
    };
    const d = mergeEnhancement(base, guess, ctx);
    expect(d.total).not.toBe(5000);
  });

  it("keeps unmatched customer as free text", () => {
    const base = mkDraft({ transcript: "Bilal ko do kurta saat sau ka udhaar likh do" });
    const guess: LlmGuess = { intent: "sale_credit", customer: "Bilal", confidence: 0.8 };
    const d = mergeEnhancement(base, guess, ctx);
    expect(d.customer?.text).toBe("Bilal");
    expect(d.customer?.id).toBeNull();
  });

  it("fills method for payment when rules missed it", () => {
    const base = mkDraft({ transcript: "Usman ne do hazaar paanch sau diye" });
    const guess: LlmGuess = { intent: "payment", customer: "Usman", total: 2500, method: "easypaisa" };
    const d = mergeEnhancement(base, guess, ctx);
    expect(d.intent).toBe("payment");
    expect(d.method).toBe("easypaisa");
    expect(d.total).toBe(2500);
  });

  it("returns the original draft when guess is null", () => {
    const base = mkDraft({});
    const d = mergeEnhancement(base, null, ctx);
    expect(d).toBe(base);
  });
});
