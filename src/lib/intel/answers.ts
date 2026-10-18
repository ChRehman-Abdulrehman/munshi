import type { Customer, Entry, Lang, Product, Shop, WantedRequest } from "../types";
import { allBalancesFromEntries } from "../ledger/balance";
import { computeHotItems, topSellers } from "./hot";
import { computeLowStock } from "./lowstock";
import { groupWanted } from "./demand";
import { money } from "../format";
import { foldWord, matchCustomer, normalize } from "../parser/rules";

export type AnswerContext = {
  shop: Shop;
  entries: Entry[];
  products: Product[];
  customers: Customer[];
  wanted: WantedRequest[];
  balances?: Map<string, number>;
  now?: Date;
};

export function answerLocally(question: string, ctx: AnswerContext, lang: Lang = "roman"): string {
  const en = lang === "en";
  const now = ctx.now ?? new Date();
  const q = normalize(question);
  const active = ctx.entries.filter((e) => e.status === "active");
  const todayKey = now.toISOString().slice(0, 10);
  const todayEntries = active.filter((e) => e.occurred_at.slice(0, 10) === todayKey);
  const todaySales = todayEntries.filter((e) => e.type === "sale").reduce((s, e) => s + e.total, 0);
  const todayCash = todayEntries.filter((e) => e.type === "sale").reduce((s, e) => s + e.paid_now, 0) + todayEntries.filter((e) => e.type === "payment").reduce((s, e) => s + e.total, 0);
  const balances = ctx.balances ?? allBalancesFromEntries(active, []);

  const customerMatch = matchCustomer(q, ctx.customers);
  const customer = customerMatch.best;
  const wantsBalance =
    /\b(kitna|kitne|balance|baqi|baaki|udhaar|udhar|lena|lenay|dena|owe|owes|owing|due|pending)\b/.test(q) ||
    (customer && /\b(kitna|hisab|hisaab|khata|account|statement)\b/.test(q));

  if (customer && wantsBalance) {
    const c = customer;
    const bal = balances.get(c.id) ?? 0;
    const limit = c.credit_limit ?? ctx.shop.settings.default_credit_limit;
    if (bal <= 0) return en
      ? `${c.name}'s account is clear — nothing owed. ${limit > 0 ? `The limit is ${money(limit)}.` : ""}`
      : `${c.name} ka hisaab saaf hai — kuch udhaar baqi nahi. ${limit > 0 ? `Limit ${money(limit)} hai.` : ""}`;
    return en
      ? `${c.name} owes ${money(bal)}${limit > 0 ? ` (limit ${money(limit)})` : ""}. You can see the full history in Khata.`
      : `${c.name} ka udhaar baqi: ${money(bal)}${limit > 0 ? ` (limit ${money(limit)})` : ""}. Purana hisaab Khata mein dekh sakte hain.`;
  }

  if (/\b(total|kul|sab|poora)\b.*\b(udhaar|udhar|baqi|baaki)\b/.test(q) || /\b(udhaar|udhar)\b.*\b(total|kul)\b/.test(q) || /\b(total|all)\b.*\b(credit|due|outstanding)\b/.test(q)) {
    const total = [...balances.values()].reduce((s, v) => s + Math.max(0, v), 0);
    const count = [...balances.values()].filter((v) => v > 0.5).length;
    return en
      ? `Total outstanding: ${money(total)} (from ${count} customers). Full details are in Khata.`
      : `Kul udhaar baqi: ${money(total)} (${count} customers se). Khata mein sab tafseel hai.`;
  }

  if (/\b(garam|hot)\b/.test(q)) {
    const hot = computeHotItems(active, ctx.products, ctx.shop.settings, now).slice(0, 3);
    if (!hot.length) return en
      ? "No hot items right now — let a bit more selling happen and I'll figure it out myself."
      : "Abhi koi garam item nahi — thodi sale aur hone dein, main khud pata laga lunga.";
    return en
      ? `Hot items: ${hot.map((h) => `${h.name} (${h.units} sold)`).join(", ")}.`
      : `Garam maal: ${hot.map((h) => `${h.name} (${h.units} bike)`).join(", ")}.`;
  }

  if (/\b(mangwan|mangwa|order|mangwana)\b/.test(q) || /\bmangi\b/.test(q)) {
    const groups = groupWanted(ctx.wanted);
    if (!groups.length) return en
      ? "Nothing is pending right now. When something is missing, I'll remember it."
      : "Abhi koi mangta hua maal nahi. Jab koi cheez na mile, main yaad rakh lunga.";
    return en
      ? `To order: ${groups.slice(0, 3).map((g) => `${g.item_text} (asked ${g.count}x)`).join(", ")}.`
      : `Mangwana hai: ${groups.slice(0, 3).map((g) => `${g.item_text} (${g.count}x manga gaya)`).join(", ")}.`;
  }

  if (/\b(kam|low|khatam|khatm)\b.*\b(stock|maal|saaman)\b/.test(q) || /\bstock\b.*\b(kam|khatam|khatm)\b/.test(q)) {
    const low = computeLowStock(ctx.products, computeHotItems(active, ctx.products, ctx.shop.settings, now)).slice(0, 3);
    if (!low.length) return en
      ? "Stock is fine — nothing is close to running out."
      : "Stock theek hai — koi cheez khatam hone ke qareeb nahi.";
    return en
      ? `Running out: ${low.map((l) => `${l.product.name} (${l.product.stock_qty} left)`).join(", ")}.`
      : `Khatam hone wala: ${low.map((l) => `${l.product.name} (${l.product.stock_qty} baqi)`).join(", ")}.`;
  }

  if (/\b(top|sab se zyada|sab se ziada|best|champ)\b/.test(q) || /\bkya bik/.test(q)) {
    const from = new Date(now.getTime() - 7 * 86400000).toISOString();
    const top = topSellers(active, { from, to: now.toISOString(), by: "units", limit: 3 });
    if (!top.length) return en ? "No sales recorded this week yet." : "Is hafte abhi koi sale record nahi hui.";
    return en
      ? `Top sellers this week: ${top.map((t) => `${t.name} (${t.units} sold)`).join(", ")}.`
      : `Is hafte sab se zyada: ${top.map((t) => `${t.name} (${t.units} bike)`).join(", ")}.`;
  }

  if (/\b(aaj|today|hisaab|summary)\b/.test(q) && !/\b(kal|parso|yesterday)\b/.test(q)) {
    const sales = todayEntries.filter((e) => e.type === "sale").length;
    const payments = todayEntries.filter((e) => e.type === "payment").reduce((s, e) => s + e.total, 0);
    return en
      ? `Today's sales ${money(todaySales)} (${sales} entries), cash collected ${money(todayCash)}${payments > 0 ? ` (includes ${money(payments)} of older dues) ` : ""}.`
      : `Aaj ki sale ${money(todaySales)} (${sales} entries), cash wasool ${money(todayCash)}${payments > 0 ? ` (is mein ${money(payments)} purana udhaar bhi) ` : ""}.`;
  }

  if (/\b(kal|yesterday)\b/.test(q)) {
    const y = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    const yEntries = active.filter((e) => e.occurred_at.slice(0, 10) === y);
    const sales = yEntries.filter((e) => e.type === "sale").reduce((s, e) => s + e.total, 0);
    return en ? `Yesterday's sales: ${money(sales)}.` : `Kal ki sale: ${money(sales)}.`;
  }

  const saleToday = en
    ? `Today's sales ${money(todaySales)}, cash ${money(todayCash)}.`
    : `Aaj ki sale ${money(todaySales)}, cash ${money(todayCash)}.`;
  return en
    ? `${saleToday} Ask me anything else — like "How much does Ali owe?" or "Which items are hot?"`
    : `${saleToday} Aur kuch poochna ho — jaise “Ali ka kitna udhaar hai?” ya “garam maal kaun sa hai?” — to bata dein.`;
}
