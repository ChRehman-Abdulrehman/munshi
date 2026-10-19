import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { LocalRepo } from "@/lib/repo/local";

const repo = new LocalRepo();
let aishaShopId = "";
let bilalShopId = "";

describe("login / naya account banana (reported bug)", () => {
  it("1. khali browser par pehla account ban jata hai", async () => {
    const s = await repo.signIn({ name: "Aisha Khan", pin: "aisha1234", shopName: "Aisha Boutique" });
    aishaShopId = s.shop.id;
    expect(s.shop.name).toBe("Aisha Boutique");
    expect(s.shop.is_demo).toBe(false);
    expect(s.member.role).toBe("owner");
  });

  it("2. demo ke baad bhi naya account ban sakta hai (ye tha asli bug)", async () => {
    await repo.setDemoMode(true);
    const demo = await repo.getSession();
    expect(demo?.shop.is_demo).toBe(true);

    const s = await repo.signIn({ name: "Bilal Ahmed", pin: "bilal1234", shopName: "Bilal General Store" });
    bilalShopId = s.shop.id;
    expect(s.shop.is_demo).toBe(false);
    expect(s.shop.name).toBe("Bilal General Store");
    expect(s.shop.id).not.toBe(aishaShopId);
  });

  it("3. usi password se dobara login hota hai", async () => {
    await repo.signOut();
    const s = await repo.signIn({ name: "Bilal Ahmed", pin: "bilal1234" });
    expect(s.shop.id).toBe(bilalShopId);
  });

  it("4. shop naam likh kar login (case/space farq se bhi) — nayi dukaan nahi banti", async () => {
    await repo.signOut();
    const s = await repo.signIn({ name: "Bilal", pin: "bilal1234", shopName: "  bilal   general store " });
    expect(s.shop.id).toBe(bilalShopId);
  });

  it("5. usi naam par ghalat password ab bhi reject hota hai", async () => {
    await expect(repo.signIn({ name: "Bilal", pin: "wrongpass9", shopName: "Bilal General Store" })).rejects.toThrow(/galat/i);
  });

  it("6. purane account me bhi login chalta hai", async () => {
    const s = await repo.signIn({ name: "Aisha Khan", pin: "aisha1234" });
    expect(s.shop.id).toBe(aishaShopId);
  });

  it("7. 8-character password se naya account + login (relaxed rule)", async () => {
    await repo.signOut();
    const s = await repo.signIn({ name: "Sana", pin: "sana1234", shopName: "Sana Tailors" });
    expect(s.shop.name).toBe("Sana Tailors");
    await repo.signOut();
    const back = await repo.signIn({ name: "Sana", pin: "sana1234" });
    expect(back.shop.id).toBe(s.shop.id);
  });
});
