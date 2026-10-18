import { describe, expect, it } from "vitest";
import { localizeAlert } from "@/lib/i18n";

describe("localizeAlert", () => {
  it("keeps roman text as-is for roman lang", () => {
    const a = { title: "Ali limit ke qareeb", message: "Balance Rs 4800 ho gaya — limit Rs 5000 ka 96%." };
    expect(localizeAlert(a, "roman")).toEqual(a);
  });

  it("translates credit-limit alert to English", () => {
    const out = localizeAlert(
      { title: "Ali limit ke qareeb", message: "Balance Rs 4800 ho gaya — limit Rs 5000 ka 96%.", actionLabel: "Customer dekhein" },
      "en"
    );
    expect(out.title).toBe("Ali is near the limit");
    expect(out.message).toBe("Balance reached Rs 4800 — 96% of the Rs 5000 limit.");
    expect(out.actionLabel).toBe("View customer");
  });

  it("translates payment alert to English", () => {
    const out = localizeAlert({ title: "Bilal ne payment ki", message: "Ab dobara udhaar de sakte hain. Naya balance Rs 1200." }, "en");
    expect(out.title).toBe("Bilal made a payment");
    expect(out.message).toBe("You can give credit again. New balance Rs 1200.");
  });

  it("translates hot-item alert (with and without low stock) to English", () => {
    const low = localizeAlert({ title: "Lawn Suit garam ho gaya!", message: "Is hafte 14 suit bik gaye — stock sirf 3 bacha hai." }, "en");
    expect(low.title).toBe("Lawn Suit is trending!");
    expect(low.message).toBe("14 suit sold this week — only 3 left in stock.");
    const plain = localizeAlert({ title: "Lawn Suit garam ho gaya!", message: "Is hafte 14 suit bik gaye." }, "en");
    expect(plain.message).toBe("14 suit sold this week.");
  });

  it("translates wanted/arrival status alert and status word", () => {
    const out = localizeAlert(
      { title: "Mangwana update", message: "Chiffon 3 pcs — status: customer_notified", actionLabel: "Stock dekhein" },
      "en"
    );
    expect(out.title).toBe("Arrival update");
    expect(out.message).toBe("Chiffon 3 pcs — status: customer notified");
    expect(out.actionLabel).toBe("View stock");
  });

  it("translates to Urdu", () => {
    const out = localizeAlert({ title: "Ali ne payment ki", message: "Ab dobara udhaar de sakte hain. Naya balance Rs 500." }, "ur");
    expect(out.title).toBe("Ali نے ادائیگی کی");
    expect(out.message).toBe("اب دوبارہ ادھار دے سکتے ہیں۔ نیا بیلنس Rs 500۔");
  });

  it("leaves unknown text unchanged", () => {
    const out = localizeAlert({ title: "Kuch aur baat", message: "Koi naya message." }, "en");
    expect(out.title).toBe("Kuch aur baat");
    expect(out.message).toBe("Koi naya message.");
  });
});
