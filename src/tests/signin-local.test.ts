import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { LocalRepo } from "@/lib/repo/local";

const repo = new LocalRepo();

describe("local signIn / demo flow", () => {
  let shopId = "";

  beforeAll(() => {
    // fresh in-memory IndexedDB per vitest process
  });

  it("creates a shop on first sign-in (empty browser)", async () => {
    const s = await repo.signIn({ name: "Ali", pin: "5678", shopName: "Test Shop" });
    shopId = s.shop.id;
    expect(s.shop.name).toBe("Test Shop");
    expect(s.member.role).toBe("owner");
    expect(s.shop.is_demo).toBe(false);
  });

  it("rejects a wrong pin while a shop exists", async () => {
    await expect(repo.signIn({ name: "Ali", pin: "0000" })).rejects.toThrow(/galat/i);
  });

  it("accepts the correct pin again", async () => {
    const s = await repo.signIn({ name: "Ali", pin: "5678" });
    expect(s.shop.id).toBe(shopId);
  });

  it("demo button works even when a session already exists (no signIn needed)", async () => {
    await repo.setDemoMode(true);
    const s = await repo.getSession();
    expect(s?.shop.is_demo).toBe(true);
    expect(s?.shop.name).toBe("Ali Cloth House, Lahore");
  });

  it("logs back into the demo shop with pin 1234 (was broken before)", async () => {
    const s = await repo.signIn({ name: "Demo", pin: "1234" });
    expect(s.shop.is_demo).toBe(true);
  });

  it("signs back into the user's own shop while demo session is active", async () => {
    const s = await repo.signIn({ name: "Ali", pin: "5678" });
    expect(s.shop.id).toBe(shopId);
    expect(s.shop.is_demo).toBe(false);
  });
});
