import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { LocalRepo } from "@/lib/repo/local";
import { hashPassword, setShopPassword, validatePassword, verifyPassword } from "@/lib/security";

describe("password rules", () => {
  it("accepts an 8-character password without uppercase/special", () => {
    expect(validatePassword("pakistan1").ok).toBe(true);
    expect(validatePassword("shop1234").ok).toBe(true);
  });

  it("accepts a strong 8+ character password", () => {
    expect(validatePassword("Munshi@123").ok).toBe(true);
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("short7!").ok).toBe(false);
    expect(validatePassword("1234").ok).toBe(false);
  });

  it("hash + verify round-trips an 8-char password", async () => {
    const { hash, salt } = await hashPassword("pakistan1");
    expect(await verifyPassword("pakistan1", hash, salt)).toBe(true);
    expect(await verifyPassword("pakistan2", hash, salt)).toBe(false);
  });
});

describe("set password then login with the same password", () => {
  const repo = new LocalRepo();

  it("works end-to-end (the reported bug)", async () => {
    const s1 = await repo.signIn({ name: "Ali", pin: "5678", shopName: "Test Shop" });
    await setShopPassword((patch) => repo.updateShopSettings(patch), "pakistan1");
    const shopAfter = await repo.getShop();
    expect(shopAfter.settings.password_hash).toBeTruthy();

    const s2 = await repo.signIn({ name: "Ali", pin: "pakistan1" });
    expect(s2.shop.id).toBe(s1.shop.id);
    expect(s2.member.id).toBe(s1.member.id);
  });

  it("old pin stops working, new password still logs in", async () => {
    await expect(repo.signIn({ name: "Ali", pin: "5678" })).rejects.toThrow(/galat/i);
    const s = await repo.signIn({ name: "Ali", pin: "pakistan1" });
    expect(s.shop.name).toBe("Test Shop");
  });
});
