import { describe, expect, it } from "vitest";
import { findNameDupes, pickByLast4 } from "@/lib/intel/dupes";
import { C } from "./fixtures";

const customers = [
  C({ name: "Ali Raza", phone: "0300 1234567" }),
  C({ name: "Ali Raza", phone: "0321 7654321" }),
  C({ name: "Sana Bibi", phone: "0333 1112223" }),
];

describe("findNameDupes", () => {
  it("detects two customers with the same name mentioned in text", () => {
    const dup = findNameDupes("Ali Raza ko 2 suit udhaar likh do", customers);
    expect(dup).not.toBeNull();
    expect(dup!.cands).toHaveLength(2);
  });

  it("ignores unique names", () => {
    expect(findNameDupes("Sana Bibi ko 500 udhaar", customers)).toBeNull();
  });

  it("ignores names not mentioned", () => {
    expect(findNameDupes("Aaj ka hisaab suna do", customers)).toBeNull();
  });
});

describe("pickByLast4", () => {
  const cands = customers.slice(0, 2);

  it("picks the candidate whose phone ends with the 4 digits", () => {
    expect(pickByLast4(cands, "4567")?.phone).toBe("0300 1234567");
    expect(pickByLast4(cands, "4321")?.phone).toBe("0321 7654321");
  });

  it("returns null when digits do not match", () => {
    expect(pickByLast4(cands, "9999")).toBeNull();
    expect(pickByLast4(cands, "chalo ali raza")).toBeNull();
  });
});
