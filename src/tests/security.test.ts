import { describe, expect, it } from "vitest";
import { hashPassword, hasPassword, sha256Hex, validatePassword, verifyCurrentSecret, verifyPassword } from "@/lib/security";
import type { ShopSettings } from "@/lib/types";

function settings(patch: Partial<ShopSettings> = {}): ShopSettings {
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
    ...patch,
  };
}

describe("validatePassword", () => {
  it("rejects an empty password", () => {
    const v = validatePassword("");
    expect(v.ok).toBe(false);
    expect(v.passed).toBe(0);
  });

  it("reports each requirement live", () => {
    const v = validatePassword("abcdefgh");
    expect(v.checks.len).toBe(true);
    expect(v.checks.lower).toBe(true);
    expect(v.checks.upper).toBe(false);
    expect(v.checks.digit).toBe(false);
    expect(v.checks.special).toBe(false);
    expect(v.ok).toBe(true);
  });

  it("accepts a strong full password", () => {
    const v = validatePassword("Munshi#2026");
    expect(v.ok).toBe(true);
    expect(v.passed).toBe(5);
  });

  it("needs 8+ characters", () => {
    expect(validatePassword("Aa1!aa").ok).toBe(false);
    expect(validatePassword("Aa1!aaa").checks.len).toBe(false);
    expect(validatePassword("Aa1!aaaa").checks.len).toBe(true);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("round-trips with PBKDF2 + salt", async () => {
    const { hash, salt } = await hashPassword("Munshi#2026");
    expect(hash.length).toBeGreaterThan(20);
    expect(salt.length).toBeGreaterThan(10);
    expect(await verifyPassword("Munshi#2026", hash, salt)).toBe(true);
    expect(await verifyPassword("Munshi#2027", hash, salt)).toBe(false);
  });

  it("uses a fresh salt each time", async () => {
    const a = await hashPassword("Munshi#2026");
    const b = await hashPassword("Munshi#2026");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("verifyCurrentSecret", () => {
  it("verifies against the set password first", async () => {
    const { hash, salt } = await hashPassword("Strong#1");
    const s = settings({ password_hash: hash, password_salt: salt });
    expect(hasPassword(s)).toBe(true);
    expect(await verifyCurrentSecret(s, "irrelevant", "Strong#1")).toBe(true);
    expect(await verifyCurrentSecret(s, "irrelevant", "Strong#2")).toBe(false);
  });

  it("falls back to the member PIN hash when no password is set", async () => {
    const s = settings();
    expect(hasPassword(s)).toBe(false);
    const memberHash = await sha256Hex("1234");
    expect(await verifyCurrentSecret(s, memberHash, "1234")).toBe(true);
    expect(await verifyCurrentSecret(s, memberHash, "4321")).toBe(false);
    expect(await verifyCurrentSecret(s, memberHash, "12")).toBe(false);
  });
});
