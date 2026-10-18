import type { Customer, Draft, Intent, LlmGuess, ParsedItem, PayMethod, Product, Question, WantedReason } from "../types";
import { lineTotal, round2 } from "../ledger/balance";
import { uuid } from "../id";
import { DAY_WORDS, INTENT_WORDS, MULTIPLIERS, NUMBER_WORDS, REASON_MAP, STOPWORDS, UNIT_CANON, UNITS } from "./aliases";

export type ParseContext = {
  shop_id: string;
  products: Product[];
  customers: Customer[];
  now?: Date;
};

const URDU_DIGITS: Record<string, string> = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };

const URDU_NUMBERS: Record<string, number> = {
  "ایک": 1, "دو": 2, "تین": 3, "چار": 4, "پانچ": 5, "چھ": 6, "سات": 7, "آٹھ": 8, "نو": 9, "دس": 10,
  "سو": 100, "ہزار": 1000,
};

const URDU_UNITS: Record<string, string> = {
  "کلو": "kg", "پیکٹ": "packet", "عدد": "pc", "درجن": "dozen", "لیٹر": "litre", "میٹر": "meter",
};

const URDU_INTENTS = {
  credit: ["ادھار", "اُدھار", "باقی", "لکھ دو"],
  cash: ["کیش", "نقد"],
  payment: ["دے دیے", "دے دیا", "ادائیگی", "جمع"],
  delete: ["ہٹا دو", "مٹا دو"],
  wanted: ["مانگا تھا", "مانگی تھی", "مانگا", "مانگی"],
  not_available: ["نہیں تھی", "نہیں تھا", "ختم تھا", "ختم ہے", "اسٹاک ختم"],
  stock_in: ["اسٹاک میں", "مال آیا", "نئے آئے"],
};

const PRICE_SUFFIX = new Set(["ka", "ke", "ki", "each", "per", "rate", "rupay", "rupees", "rs", "hisab", "hisaab", "mein", "me", "for", "@", "x"]);
const NOISE_WORDS = new Set(["at", "pkr", "rs", "rupay", "rupees", "price", "of", "the", "a", "an", "waqai", "sirf", "only"]);
const SALE_VERBS = new Set(["bika", "biki", "bikay", "becha", "bechi", "sale", "hui", "hua", "hue", "nikale", "nikala", "diye", "diyay"]);
const WRITE_VERBS = ["likh do", "likhdo", "likh dein", "likh", "add karo", "add kardo", "daalo", "karo", "kar do", "save karo", "save kar"];

export function normalize(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/[۰-۹]/g, (d) => URDU_DIGITS[d] ?? d);
  s = s.replace(/\u060C/g, ",").replace(/[؟?]/g, " ? ");
  s = s.replace(/[۔.!؛;:()"'`]/g, " ");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}

export function foldWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/ph/g, "f")
    .replace(/gh/g, "g")
    .replace(/ck/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function similarity(a: string, b: string): number {
  const x = foldWord(a), y = foldWord(b);
  if (x === y) return 1;
  if (!x || !y) return 0;
  const d = levenshtein(x, y);
  return 1 - d / Math.max(x.length, y.length);
}

function tokenSimilarity(a: string, b: string): number {
  const fa = foldWord(a), fb = foldWord(b);
  if (fa === fb) return 1;
  if (fa.length <= 2 || fb.length <= 2) return fa === fb ? 1 : 0;
  const s = similarity(fa, fb);
  if (fa.includes(fb) || fb.includes(fa)) return Math.max(s, 0.88);
  return s;
}

export function phraseSimilarity(nameTokens: string[], targetTokens: string[]): number {
  if (!nameTokens.length || !targetTokens.length) return 0;
  let coveredName = 0;
  for (const nt of nameTokens) {
    let best = 0;
    for (const tt of targetTokens) best = Math.max(best, tokenSimilarity(nt, tt));
    if (best >= 0.8) coveredName++;
  }
  let coveredTarget = 0;
  for (const tt of targetTokens) {
    let best = 0;
    for (const nt of nameTokens) best = Math.max(best, tokenSimilarity(tt, nt));
    if (best >= 0.8) coveredTarget++;
  }
  return (coveredName / nameTokens.length) * 0.65 + (coveredTarget / targetTokens.length) * 0.35;
}

function isNumberToken(t: string, next?: string, prev?: string): boolean {
  if (URDU_NUMBERS[t] !== undefined) return true;
  if (NUMBER_WORDS[t] === undefined && MULTIPLIERS[t] === undefined) {
    if (!/^\d+([.,]\d+)?$/.test(t)) return false;
    return true;
  }
  if ((t === "do" || t === "de") && !next) return false;
  if ((t === "do" || t === "de") && prev && ["likh", "kar", "karo", "add", "de", "hata", "band"].includes(prev)) return false;
  if (t === "saath" && next !== "rupay") return false;
  return true;
}

function parseNumberAt(tokens: string[], i: number): { value: number; consumed: number } | null {
  let total = 0;
  let cur = 0;
  let consumed = 0;
  let matched = false;
  for (let j = i; j < tokens.length; j++) {
    const t = tokens[j];
    const un = URDU_NUMBERS[t];
    const nw = NUMBER_WORDS[t];
    const mult = MULTIPLIERS[t];
    const rawDigits = /^\d+([.,]\d+)?$/.test(t) ? parseFloat(t.replace(/,/g, "")) : null;
    if (un !== undefined) {
      cur += un;
      matched = true;
      consumed++;
    } else if (mult !== undefined && matched) {
      total += (cur === 0 ? 1 : cur) * mult;
      cur = 0;
      consumed++;
    } else if (rawDigits !== null) {
      cur += rawDigits;
      matched = true;
      consumed++;
      if (consumed === 1) break;
    } else if (nw !== undefined && isNumberToken(t, tokens[j + 1], tokens[j - 1])) {
      cur += nw;
      matched = true;
      consumed++;
    } else {
      break;
    }
  }
  if (!matched) return null;
  return { value: total + cur, consumed };
}

export function numbersInUtterance(text: string): number[] {
  const tokens = normalize(text).split(/\s+/).filter(Boolean);
  const out: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const n = parseNumberAt(tokens, i);
    if (n) {
      out.push(n.value);
      i += n.consumed - 1;
    }
  }
  return out;
}

function extractDate(text: string, now: Date): string {
  for (const [word, offset] of Object.entries(DAY_WORDS)) {
    if (text.includes(word)) {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return d.toISOString();
    }
  }
  return now.toISOString();
}

function containsAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function detectMethod(text: string): PayMethod | null {
  if (containsAny(text, ["easypaisa", "easy paisa", "easy paisa"]) || text.includes("ایزی")) return "easypaisa";
  if (containsAny(text, ["jazzcash", "jazz cash"]) || text.includes("جاز")) return "jazzcash";
  if (containsAny(text, ["bank", "account transfer", "transfer"])) return "bank";
  if (containsAny(text, INTENT_WORDS.cash) || containsAny(text, URDU_INTENTS.cash)) return "cash";
  return null;
}

export function detectIntent(text: string, hasItems: boolean, hasAmount: boolean): Intent {
  const startsQuestion = INTENT_WORDS.question_starts.some((q) => text.startsWith(q + " ") || text === q);
  const hasWriteVerb = WRITE_VERBS.some((v) => text.includes(v));
  if (startsQuestion && !hasWriteVerb) return "question";
  if (text.endsWith("?") && !hasWriteVerb) return "question";

  const hasDelete = containsAny(text, INTENT_WORDS.delete) || containsAny(text, URDU_INTENTS.delete);
  const mentionsEntry = containsAny(text, ["entry", "aurat", "aakhri", "akhri", "pehli", "pichli", "last", "first", "wo wali", "us wali"]);
  if (hasDelete && mentionsEntry) return "delete_entry";
  if (containsAny(text, INTENT_WORDS.undo)) return "undo";

  const correction = /\d+\s+nahi\s+\d+/.test(text) || /\b(rate|qty|quantity|price)\b.*\b(kar|karo|kardo|kar do|badlo|badal)\b/.test(text);
  if (containsAny(text, INTENT_WORDS.update) || correction) {
    if (mentionsEntry || correction || containsAny(text, ["pehli", "aakhri", "pichli", "us", "wo"])) return "update_entry";
  }

  const hasResolve = containsAny(text, INTENT_WORDS.resolve);
  if (hasResolve && hasItems) return "resolve_wanted";

  const hasWanted = containsAny(text, INTENT_WORDS.wanted) || containsAny(text, URDU_INTENTS.wanted);
  const hasNotAvail = containsAny(text, INTENT_WORDS.not_available) || containsAny(text, URDU_INTENTS.not_available);
  if (hasWanted && (hasNotAvail || !hasAmount) && !containsAny(text, ["add karo", "stock mein add"])) return "wanted_item";
  if (hasNotAvail && !hasAmount && hasItems && containsAny(text, ["ne ", "ne"]) && containsAny(text, INTENT_WORDS.wanted)) return "wanted_item";

  if (containsAny(text, INTENT_WORDS.stock_in) || containsAny(text, URDU_INTENTS.stock_in)) return "stock_in";

  if (containsAny(text, INTENT_WORDS.limit) && /\d/.test(text)) return "set_credit_limit";
  if (containsAny(text, INTENT_WORDS.add_customer)) return "add_customer";
  if (containsAny(text, INTENT_WORDS.add_product)) return "add_product";
  if (containsAny(text, INTENT_WORDS.reminder)) return "set_reminder";

  const hasPayment = containsAny(text, INTENT_WORDS.payment) || containsAny(text, URDU_INTENTS.payment);
  const oldDebt = containsAny(text, ["pichlay udhaar", "pichle udhaar", "pichla udhaar", "purana udhaar", "purane udhaar", "pichla hisaab", "previous udhaar"]);
  if (hasPayment && oldDebt) return "payment";
  const billedKa = /(^|[\s,])\d[\d,]*\s*ka\b/.test(text) || /\d[\d,]*\s*ka\s*,/.test(text);
  if (hasPayment && billedKa && !hasItems) return "sale_credit";
  const saleSignal = hasItems && (containsAny(text, [...SALE_VERBS, "sale", "bika", "becha"]) || containsAny(text, INTENT_WORDS.credit));
  if (hasPayment && !saleSignal && hasAmount && !billedKa) return "payment";
  if (hasPayment && hasAmount && !hasItems && !billedKa) return "payment";

  const hasRefund = containsAny(text, ["wapas kiye", "wapis kiye", "refund", "return", "wapas kar diya", "wapis kar diya"]);
  if (hasRefund) return "refund";

  if (hasItems) {
    const credit = containsAny(text, INTENT_WORDS.credit) || containsAny(text, URDU_INTENTS.credit);
    const cash = containsAny(text, INTENT_WORDS.cash) || containsAny(text, URDU_INTENTS.cash) || containsAny(text, ["bika", "becha", "biki", "sale hui", "sale hua", "sale"]);
    if (credit && !cash) return "sale_credit";
    return "sale_cash";
  }
  if (hasAmount && containsAny(text, INTENT_WORDS.credit)) return "sale_credit";
  return "clarify";
}

type MatchResult<T> = { best: T | null; candidates: T[]; score: number; method: "exact" | "alias" | "fuzzy" | "none" };

export function matchProduct(name: string, products: Product[]): MatchResult<Product> {
  const nameTokens = name.split(/\s+/).filter((t) => t && !STOPWORDS.has(t));
  if (!nameTokens.length) return { best: null, candidates: [], score: 0, method: "none" };
  const scored: { p: Product; score: number; method: "exact" | "alias" | "fuzzy" }[] = [];
  for (const p of products) {
    if (!p.active) continue;
    const pName = normalize(p.name).split(/\s+/);
    let s = phraseSimilarity(nameTokens, pName);
    let method: "exact" | "alias" | "fuzzy" = "fuzzy";
    if (foldWord(name) === foldWord(p.name)) {
      s = 1;
      method = "exact";
    }
    for (const alias of p.aliases) {
      const aTokens = normalize(alias).split(/\s+/);
      const as = phraseSimilarity(nameTokens, aTokens);
      if (foldWord(name) === foldWord(alias)) {
        s = Math.max(s, 1);
        method = "alias";
      } else if (as > s) {
        s = as;
        method = "fuzzy";
      }
    }
    if (s >= 0.62) scored.push({ p, score: s, method });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return { best: null, candidates: [], score: 0, method: "none" };
  const best = scored[0];
  if (best.score >= 0.86) {
    const near = scored.filter((x) => x.score >= best.score - 0.08 && x.score >= 0.72);
    return { best: best.p, candidates: near.map((x) => x.p), score: best.score, method: best.method };
  }
  const near = scored.filter((x) => x.score >= 0.62 && x.score >= best.score - 0.1);
  return { best: best.p, candidates: near.map((x) => x.p), score: best.score, method: near.length >= 1 && best.score >= 0.72 ? best.method : "fuzzy" };
}

export function matchCustomer(name: string, customers: Customer[]): MatchResult<Customer> {
  const nameTokens = normalize(name).split(/\s+/).filter((t) => t && !STOPWORDS.has(t));
  if (!nameTokens.length) return { best: null, candidates: [], score: 0, method: "none" };
  const scored: { c: Customer; score: number }[] = [];
  for (const c of customers) {
    const cTokens = normalize(c.name).split(/\s+/).filter(Boolean);
    const s = phraseSimilarity(nameTokens, cTokens);
    if (s >= 0.6) scored.push({ c, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return { best: null, candidates: [], score: 0, method: "none" };
  const best = scored[0];
  return { best: best.score >= 0.86 ? best.c : null, candidates: scored.filter((x) => x.score >= 0.7).map((x) => x.c), score: best.score, method: best.score >= 0.86 ? "fuzzy" : "none" };
}

const GENERIC_CUSTOMER_WORDS = new Set(["customer", "gahak", "grahak", "banda", "bandah", "koi", "kise", "someone", "ek", "aik", "admi", "aadmi"]);

function stripCustomerPrefix(text: string): { customerText: string | null; rest: string } {
  const m = text.match(/^([a-z\u0600-\u06FF][a-z\u0600-\u06FF\s]{0,28}?)\s+(ko|ne|کو|نے)\s+/);
  if (!m) return { customerText: null, rest: text };
  const candidate = m[1].trim();
  const words = candidate.split(/\s+/);
  if (words.some((w) => SALE_VERBS.has(w) || GENERIC_CUSTOMER_WORDS.has(w) || ["kya", "kaun", "kon", "kitna"].includes(w))) return { customerText: null, rest: text };
  if (words.length > 3) return { customerText: null, rest: text };
  return { customerText: candidate, rest: text.slice(m[0].length) };
}

const METHOD_PHRASES = [
  "udhaar likh do", "udhar likh do", "likh do", "likhdo", "likh dein", "likh dena", "likh den",
  "save karo", "save kar do", "add karo", "add kardo", "stock mein add karo", "stock me add karo",
  "stock mein daalo", "stock me daalo", "daal do", "nikal do", "cash sale", "credit sale", "khatay mein",
];

export function extractMoneyPhrases(text: string): { rest: string; paidAmount: number | null; hadPaymentVerb: boolean } {
  let rest = text;
  let paidAmount: number | null = null;
  let hadPaymentVerb = false;
  const re = /(\d[\d,]*)\s*(?:rupay|rupees|rs)?\s*(?:ke|ka|ki)?\s*(?:abhi|foran|naqad)?\s*(de diye|de diya|di diye|di diya|diye|diya|jama kar diya|jama|ada kar diya|ada)\b/g;
  rest = rest.replace(re, (_m, num) => {
    paidAmount = parseFloat(String(num).replace(/,/g, ""));
    hadPaymentVerb = true;
    return " ";
  });
  for (const p of METHOD_PHRASES) rest = rest.split(p).join(" ");
  return { rest: rest.replace(/\s+/g, " ").trim(), paidAmount, hadPaymentVerb };
}

export function parseItems(chunk: string, products: Product[]): { items: ParsedItem[]; strayPrice: number | null } {
  const cleaned = chunk
    .split(/\s+/)
    .filter((t) => !NOISE_WORDS.has(t))
    .join(" ")
    .replace(/\b(total|bill|kul|sab mila kar|kul mila kar)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { items: [], strayPrice: null };
  const parts = cleaned
    .split(/\s+aur\s+|\s+and\s+|,|\+|\s+sath\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: ParsedItem[] = [];
  let strayPrice: number | null = null;
  for (const part of parts) {
    const tokens = part.split(/\s+/).filter(Boolean);
    const consumed = new Set<number>();
    let price: number | null = null;
    let priceRaw: string | null = null;
    let unitWordUsed: string | null = null;

    for (let j = 0; j < tokens.length; j++) {
      if (consumed.has(j)) continue;
      const num = parseNumberAt(tokens, j);
      if (!num) continue;
      const afterIdx = j + num.consumed;
      const after = tokens[afterIdx];
      if (after && PRICE_SUFFIX.has(after)) {
        price = num.value;
        for (let k = j; k <= afterIdx; k++) consumed.add(k);
        break;
      }
    }

    let qty: number | null = null;
    let unit = "";
    for (let j = 0; j < tokens.length; j++) {
      if (consumed.has(j)) continue;
      const t = tokens[j];
      const isNum = isNumberToken(t, tokens[j + 1], tokens[j - 1]) && (URDU_NUMBERS[t] !== undefined || NUMBER_WORDS[t] !== undefined || /^\d+([.,]\d+)?$/.test(t));
      if (!isNum) continue;
      const num = parseNumberAt(tokens, j);
      if (!num) continue;
      qty = num.value;
      for (let k = j; k < j + num.consumed; k++) consumed.add(k);
      const afterIdx = j + num.consumed;
      const nextTok = tokens[afterIdx];
      if (nextTok && (UNITS.includes(nextTok) || URDU_UNITS[nextTok])) {
        unit = UNIT_CANON[nextTok] ?? URDU_UNITS[nextTok] ?? nextTok;
        unitWordUsed = nextTok;
        consumed.add(afterIdx);
      }
      break;
    }
    void priceRaw;

    const nameTokens = tokens.filter((t, idx) => !consumed.has(idx) && !STOPWORDS.has(t) && !PRICE_SUFFIX.has(t) && !NOISE_WORDS.has(t) && !UNITS.includes(t));
    let name = nameTokens.join(" ").trim();

    if (!name && price !== null && !qty) {
      if (items.length) {
        const prev = items[items.length - 1];
        if (prev.unit_price === null) {
          prev.unit_price = price;
          if (prev.qty !== null) prev.line_total = lineTotal(prev.qty, price, prev.discount);
        } else if (strayPrice === null) {
          strayPrice = price;
        }
      } else if (strayPrice === null) {
        strayPrice = price;
      }
      continue;
    }
    if (!name && qty === null && price === null) continue;
    if (!name && qty !== null && unitWordUsed) name = unitWordUsed;

    const match = name ? matchProduct(name, products) : { best: null, candidates: [], score: 0, method: "none" as const };
    const matchedProduct = match.best && match.score >= 0.86 && match.candidates.length <= 1 ? match.best : null;
    const finalName = matchedProduct ? matchedProduct.name : name;
    if (!unit && matchedProduct) unit = matchedProduct.unit;
    const autoPrice = price === null && matchedProduct && matchedProduct.selling_price > 0 ? matchedProduct.selling_price : price;
    items.push({
      name: finalName || name || "?",
      product_id: matchedProduct?.id ?? null,
      qty,
      unit: unit || "pc",
      unit_price: autoPrice,
      discount: 0,
      line_total: qty !== null && autoPrice !== null ? lineTotal(qty, autoPrice) : null,
      matched: matchedProduct ? match.method : "none",
    });
  }
  return { items, strayPrice };
}

function detectWantedReason(text: string): "out_of_stock" | "price" | "variant" | "deferred" | "other" {
  for (const r of REASON_MAP) if (containsAny(text, r.words)) return r.reason;
  if (containsAny(text, URDU_INTENTS.not_available)) return "out_of_stock";
  return "other";
}

function firstNumberIn(text: string): number | null {
  const tokens = text.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d+([.,]\d+)?$/.test(tokens[i])) return parseFloat(tokens[i].replace(/,/g, ""));
    const n = parseNumberAt(tokens, i);
    if (n && (URDU_NUMBERS[tokens[i]] !== undefined || NUMBER_WORDS[tokens[i]] !== undefined)) return n.value;
  }
  return null;
}

function detectSpokenTotal(text: string): number | null {
  const m = text.match(/(?:total|bill|kul|sab mila kar|kul mila kar|poory|pooray)\s+(\d[\d,]*)/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));
  const m2 = text.match(/(\d[\d,]*)\s+(?:ka bill|total|rupay ka bill)/);
  if (m2) return parseFloat(m2[1].replace(/,/g, ""));
  return null;
}

function detectPaidNow(text: string): number | null {
  const m = text.match(/(\d[\d,]*)\s*(?:rupay|rupees|rs)?\s*(?:abhi|foran|naqad|cash)\s*(?:diye|diya|de diye|de diya)/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));
  const m2 = text.match(/(\d[\d,]*)\s+(?:diye|diya)\s+(?:baqi|baaki|udhaar)/);
  if (m2) return parseFloat(m2[1].replace(/,/g, ""));
  const m3 = text.match(/(\d[\d,]*)\s+(?:diye|diya)$/);
  if (m3) return parseFloat(m3[1].replace(/,/g, ""));
  return null;
}

function detectPaymentAmount(text: string): number | null {
  const m = text.match(/(\d[\d,]*)\s*(?:rupay|rupees|rs)?\s*(?:ke|ka|ki)?\s*(?:de diye|de diya|diye|diya|jama|ada|wapis)/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));
  const m2 = text.match(/(?:de diye|de diya|jama|payment)\s+(\d[\d,]*)/);
  if (m2) return parseFloat(m2[1].replace(/,/g, ""));
  return null;
}

function buildQuestions(draft: Draft, ctx: ParseContext): Question[] {
  const qs: Question[] = [];
  if (draft.intent === "clarify") {
    qs.push({
      id: "intent",
      field: "intent",
      text: "Samajh nahi aaya. Kya karna hai?",
      type: "choice",
      chips: ["Sale likho", "Udhaar likho", "Payment mili", "Naya maal aaya"],
      options: [
        { label: "Sale likho", value: "sale_cash" },
        { label: "Udhaar likho", value: "sale_credit" },
        { label: "Payment mili", value: "payment" },
        { label: "Naya maal aaya", value: "stock_in" },
      ],
    });
    return qs;
  }

  const isSale = draft.intent === "sale_cash" || draft.intent === "sale_credit";
  if (isSale) {
    if (draft.customer?.candidates && draft.customer.candidates.length > 1 && !draft.customer.id) {
      qs.push({
        id: "customer",
        field: "customer",
        text: `Kaunsa ${draft.customer.text}?`,
        type: "choice",
        options: draft.customer.candidates.map((c) => ({ label: `${c.name}${c.phone ? " — " + c.phone.slice(-4).padStart(7, "•") : ""}`, value: c.id })),
      });
    } else if (isSale && draft.intent === "sale_credit" && !draft.customer?.id && !draft.customer?.text) {
      qs.push({
        id: "customer",
        field: "customer",
        text: "Kis customer ka udhaar likhna hai?",
        type: "text",
        chips: [],
      });
    }
    draft.items.forEach((item, idx) => {
      if (item.qty === null) {
        qs.push({ id: `qty:${idx}`, field: `qty:${idx}`, text: `${item.name} ki kitni quantity?`, type: "number" });
      }
    });
    draft.items.forEach((item, idx) => {
      if (item.unit_price === null) {
        const p = ctx.products.find((x) => x.id === item.product_id);
        const chips = p && p.selling_price > 0 ? [`Rs ${p.selling_price}`, "Aur rate batao"] : [];
        qs.push({ id: `price:${idx}`, field: `price:${idx}`, text: `${item.name} ka rate kya hai?${p ? ` (saved price: Rs ${p.selling_price})` : ""}`, type: "number", chips });
      }
    });
    if (draft.intent === "sale_credit" && !draft.method) {
      qs.push({
        id: "method",
        field: "method",
        text: "Poora udhaar hai ya kuch cash mila?",
        type: "choice",
        chips: ["Poora udhaar", "Kuch cash mila"],
        options: [
          { label: "Poora udhaar", value: "credit" },
          { label: "Kuch cash mila", value: "cash" },
        ],
      });
    }
    if (draft.total !== null && draft.missing.includes("total_conflict")) {
      const itemsSum = draft.items.reduce((s, i) => s + (i.line_total ?? 0), 0);
      qs.push({
        id: "total_conflict",
        field: "total_conflict",
        text: `Aapne Rs ${draft.total} bataya, items ka total Rs ${itemsSum} banta hai. Kaunsa sahi hai?`,
        type: "choice",
        options: [
          { label: `Items ka total: Rs ${itemsSum}`, value: "items" },
          { label: `Mera number: Rs ${draft.total}`, value: "spoken" },
        ],
      });
    }
  }

  if (draft.intent === "payment" && !draft.method) {
    qs.push({
      id: "method",
      field: "method",
      text: "Payment kis tareeqay se mili?",
      type: "choice",
      chips: ["Cash", "Easypaisa", "JazzCash", "Bank"],
      options: [
        { label: "Cash", value: "cash" },
        { label: "Easypaisa", value: "easypaisa" },
        { label: "JazzCash", value: "jazzcash" },
        { label: "Bank", value: "bank" },
      ],
    });
  }

  if (draft.intent === "update_entry" || draft.intent === "delete_entry") {
    const hint = draft.target_entry?.line_index === undefined ? "aakhri ya pehli?" : null;
    qs.push({
      id: "target_entry",
      field: "target_entry",
      text: hint ?? "Kaunsi entry theek karni hai?",
      type: "choice",
      chips: ["Aaj ki aakhri", "Koi aur"],
    });
  }
  return qs;
}

function computeConfidence(draft: Draft): number {
  if (draft.intent === "question") return 0.95;
  let c = 0.92;
  if (draft.intent === "clarify") return 0.2;
  if (draft.customer?.candidates && draft.customer.candidates.length > 1 && !draft.customer.id) c -= 0.25;
  if ((draft.intent === "sale_credit") && !draft.customer?.id && !draft.customer?.text) c -= 0.2;
  for (const item of draft.items) {
    if (item.qty === null) c -= 0.15;
    if (item.unit_price === null && (draft.intent === "sale_cash" || draft.intent === "sale_credit")) c -= 0.15;
    if (item.matched === "none") c -= 0.08;
  }
  if (draft.missing.includes("total_conflict")) c -= 0.2;
  if (draft.missing.includes("method")) c -= 0.1;
  return Math.max(0.05, Math.min(0.98, round2(c)));
}

export function parseUtterance(input: string, ctx: ParseContext, source: "voice" | "text" | "ocr" = "text"): Draft {
  const now = ctx.now ?? new Date();
  const text = normalize(input);
  const hasAmount = /\d/.test(text) || Object.keys(NUMBER_WORDS).some((w) => text.includes(` ${w} `));

  const { customerText, rest } = stripCustomerPrefix(text);
  const money = extractMoneyPhrases(rest);
  const { items, strayPrice } = parseItems(money.rest, ctx.products);

  let customer: Draft["customer"] = null;
  if (customerText) {
    const m = matchCustomer(customerText, ctx.customers);
    customer = {
      text: customerText,
      id: m.best?.id ?? null,
      candidates: m.candidates.length > 1 || (m.candidates.length === 1 && !m.best) ? m.candidates : undefined,
    };
  } else {
    for (const c of ctx.customers) {
      const cTokens = normalize(c.name).split(/\s+/);
      const tTokens = text.split(/\s+/);
      if (cTokens.length && phraseSimilarity(cTokens, tTokens) >= 0.9) {
        const m = matchCustomer(c.name, ctx.customers);
        customer = { text: m.best?.name ?? c.name, id: m.best?.id ?? null, candidates: m.candidates.length > 1 ? m.candidates : undefined };
        break;
      }
    }
  }

  let intent = detectIntent(text, items.length > 0, hasAmount || money.paidAmount !== null || detectSpokenTotal(text) !== null);
  if (intent === "sale_cash" || intent === "sale_credit") {
    const weak = items.length > 0 && items.every((i) => i.qty === null && i.unit_price === null && i.matched === "none");
    const anySignal = hasAmount || money.paidAmount !== null || containsAny(text, INTENT_WORDS.credit) || containsAny(text, [...SALE_VERBS, "bika", "becha", "biki"]);
    if (weak && !anySignal) intent = "clarify";
  }
  if (intent === "clarify" && items.length > 0) {
    const meaningful = items.some((i) => i.matched !== "none" || i.qty !== null || i.unit_price !== null);
    if (!meaningful) items.length = 0;
  }
  const draft: Draft = {
    id: uuid(),
    shop_id: ctx.shop_id,
    intent,
    source,
    transcript: input,
    customer,
    items,
    total: null,
    paid_now: null,
    credit_amount: null,
    method: detectMethod(text),
    occurred_at: extractDate(text, now),
    note: null,
    missing: [],
    confidence: 0,
    questions: [],
    warnings: [],
    wanted: null,
    review_status: "pending",
    created_at: now.toISOString(),
  };

  if (intent === "clarify" && items.length > 0) {
    const credit = containsAny(text, INTENT_WORDS.credit);
    draft.intent = credit ? "sale_credit" : "sale_cash";
  }

  if (draft.intent === "sale_cash" || draft.intent === "sale_credit") {
    if (draft.intent === "sale_credit" && !draft.method) draft.method = "credit";
    if (draft.intent === "sale_cash" && !draft.method) draft.method = "cash";

    const itemsSum = draft.items.length && draft.items.every((i) => i.line_total !== null)
      ? round2(draft.items.reduce((s, i) => s + (i.line_total ?? 0), 0))
      : null;
    const spoken = detectSpokenTotal(text);
    if (spoken !== null && itemsSum !== null && Math.abs(spoken - itemsSum) > 1) {
      draft.total = spoken;
      draft.missing.push("total_conflict");
      draft.warnings.push("Aapka bataya total items se match nahi karta.");
    } else if (strayPrice !== null && !draft.items.length) {
      draft.total = strayPrice;
      draft.note = "Bill total";
    } else {
      draft.total = itemsSum;
    }

    const paid = money.paidAmount;
    if (paid !== null && draft.total !== null && paid > 0 && paid < draft.total) {
      draft.paid_now = paid;
      draft.intent = "sale_credit";
    } else if (paid !== null && draft.total !== null && paid >= draft.total) {
      draft.paid_now = draft.total;
      draft.intent = "sale_cash";
      if (!draft.method || draft.method === "credit") draft.method = "cash";
    } else if (draft.intent === "sale_cash" && draft.total !== null) {
      draft.paid_now = draft.total;
      draft.method = "cash";
    } else if (draft.intent === "sale_credit") {
      draft.paid_now = draft.total !== null ? 0 : null;
    }

    if (draft.total !== null && draft.paid_now !== null) {
      draft.credit_amount = round2(Math.max(0, draft.total - draft.paid_now));
    }
    draft.items.forEach((item, idx) => {
      if (item.qty === null) draft.missing.push(`qty:${idx}`);
      if (item.unit_price === null) draft.missing.push(`price:${idx}`);
    });
  } else if (draft.intent === "payment") {
    const amount = money.paidAmount ?? detectPaymentAmount(text) ?? firstNumberIn(text);
    draft.items = [];
    draft.total = amount;
    draft.paid_now = amount;
    draft.credit_amount = null;
    if (!draft.method) draft.missing.push("method");
    if (!draft.customer?.id && !draft.customer?.text) {
      draft.missing.push("customer");
      draft.warnings.push("Kis customer ka payment hai?");
    }
  } else if (draft.intent === "stock_in") {
    draft.items = draft.items.map((i) => ({ ...i, qty: i.qty ?? 1 }));
    draft.total = null;
    draft.paid_now = null;
    if (!draft.items.length) draft.missing.push("items");
  } else if (draft.intent === "wanted_item" || draft.intent === "resolve_wanted") {
    const rawText = draft.intent === "wanted_item" ? itemsFromWanted(money.rest) : itemsFromWanted(money.rest);
    const source = items[0]?.name && items[0].matched !== "none" ? items[0].name : rawText || items[0]?.name || "";
    const vm = matchWithVariant(source, ctx.products);
    const item: ParsedItem = {
      name: vm.product?.name ?? source,
      product_id: vm.product?.id ?? null,
      qty: items[0]?.qty ?? (draft.intent === "wanted_item" ? 1 : 1),
      unit: items[0]?.unit ?? vm.product?.unit ?? "pc",
      unit_price: draft.intent === "wanted_item" ? items[0]?.unit_price ?? vm.product?.selling_price ?? null : null,
      discount: 0,
      line_total: null,
      matched: vm.product ? "fuzzy" : "none",
    };
    draft.items = item.name ? [item] : [];
    if (draft.intent === "wanted_item") {
      draft.wanted = {
        qty: item.qty ?? 1,
        reason: detectWantedReason(text),
        contact_permission: containsAny(text, ["number do", "contact karo", "bata do", "phone", "rabta"]),
        expected_price: item.unit_price,
        variant_note: vm.variant,
      };
      draft.total = null;
      draft.paid_now = null;
    } else {
      if (containsAny(text, ["stock mein aa", "stock me aa", "add karo", "add kardo"])) draft.note = "stock_in_too";
    }
  } else if (draft.intent === "set_credit_limit") {
    draft.credit_limit_new = firstNumberIn(text);
  } else if (draft.intent === "update_entry") {
    const m = text.match(/(\d[\d,]*)\s+nahi\s+(\d[\d,]*)/);
    if (m) {
      (draft as Draft & { correction?: { field: string; old: number; value: number; target_hint: string | null } }).correction = {
        field: "qty",
        old: parseFloat(m[1].replace(/,/g, "")),
        value: parseFloat(m[2].replace(/,/g, "")),
        target_hint: text.includes("pehli") ? "first" : text.includes("aakhri") || text.includes("akhri") ? "last" : null,
      };
    } else {
      const rateM = text.match(/rate\s+(\d[\d,]*)/);
      const limitM = text.match(/(?:qty|quantity)\s+(\d[\d,]*)/);
      const val = rateM ? parseFloat(rateM[1].replace(/,/g, "")) : limitM ? parseFloat(limitM[1].replace(/,/g, "")) : firstNumberIn(text);
      (draft as Draft & { correction?: { field: string; old: number | null; value: number | null; target_hint: string | null } }).correction = {
        field: rateM ? "price" : "qty",
        old: null,
        value: val,
        target_hint: text.includes("aakhri") || text.includes("akhri") ? "last" : null,
      };
    }
  } else if (draft.intent === "delete_entry") {
    draft.target_entry = { id: text.includes("pehli") ? "first" : "last", line_index: undefined };
    draft.warnings.push("Entry hata rahe hain. Ye wapas lai ja sakti hai (undo).");
  }

  draft.questions = buildQuestions(draft, ctx);
  draft.confidence = computeConfidence(draft);
  return draft;
}

const COLOR_WORDS = new Set(["blue", "red", "black", "white", "green", "grey", "gray", "pink", "yellow", "brown", "purple", "orange", "sky", "maroon", "beige", "golden", "gold", "silver"]);

export function matchWithVariant(name: string, products: Product[]): { product: Product | null; variant: string | null; score: number } {
  const tokens = normalize(name).split(/\s+/).filter(Boolean);
  const full = matchProduct(tokens.join(" "), products);
  if (full.best && full.score >= 0.86 && full.candidates.length <= 1) return { product: full.best, variant: null, score: full.score };
  const colors = tokens.filter((t) => COLOR_WORDS.has(t));
  const reduced = tokens.filter((t) => !COLOR_WORDS.has(t));
  if (colors.length && reduced.length) {
    const r = matchProduct(reduced.join(" "), products);
    if (r.best && r.score >= 0.86) return { product: r.best, variant: colors.join(" "), score: r.score };
  }
  return { product: null, variant: colors.length ? colors.join(" ") : null, score: full.score };
}

function itemsFromWanted(text: string): string {
  const cleaned = text
    .replace(/[,،]/g, " ")
    .split(/\s+/)
    .filter((t) => !STOPWORDS.has(t) && !["manga", "maanga", "maangi", "mangi", "tha", "thi", "ne", "ko", "nahi", "stock", "khatam", "mojood", "maujood", "customer", "gahak", "grahak", "gaye", "gayi"].includes(t))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

export function applyClarification(draft: Draft, field: string, value: string | number, ctx: ParseContext): Draft {
  const d: Draft = JSON.parse(JSON.stringify(draft));
  if (field === "customer") {
    const byId = ctx.customers.find((c) => c.id === value);
    if (byId) {
      d.customer = { text: byId.name, id: byId.id };
    } else if (typeof value === "string" && value.trim()) {
      d.customer = { text: value.trim(), id: null };
      d.warnings = d.warnings.filter((w) => !w.includes("Kis customer"));
    }
  } else if (field.startsWith("qty:")) {
    const idx = parseInt(field.split(":")[1], 10);
    if (d.items[idx]) {
      d.items[idx].qty = typeof value === "number" ? value : parseFloat(String(value));
      if (d.items[idx].unit_price !== null && d.items[idx].qty !== null) {
        d.items[idx].line_total = lineTotal(d.items[idx].qty!, d.items[idx].unit_price!, d.items[idx].discount);
      }
    }
  } else if (field.startsWith("price:")) {
    const idx = parseInt(field.split(":")[1], 10);
    if (d.items[idx]) {
      const v = typeof value === "number" ? value : parseFloat(String(value).replace(/[^\d.]/g, ""));
      if (!Number.isNaN(v)) {
        d.items[idx].unit_price = v;
        if (d.items[idx].qty !== null) {
          d.items[idx].line_total = lineTotal(d.items[idx].qty!, v, d.items[idx].discount);
        }
      }
    }
  } else if (field === "method") {
    d.method = value as PayMethod;
    d.missing = d.missing.filter((m) => m !== "method");
  } else if (field === "intent") {
    d.intent = value as Intent;
    d.missing = d.missing.filter((m) => m !== "intent");
  } else if (field === "total_conflict") {
    if (value === "spoken") {
      d.missing = d.missing.filter((m) => m !== "total_conflict");
      d.warnings = d.warnings.filter((w) => !w.includes("match nahi"));
    } else {
      d.total = round2(d.items.reduce((s, i) => s + (i.line_total ?? 0), 0));
      d.missing = d.missing.filter((m) => m !== "total_conflict");
      d.warnings = d.warnings.filter((w) => !w.includes("match nahi"));
    }
  } else if (field === "quantity_value") {
    const idx = parseInt(String(value).split("|")[0] || "0", 10);
    const v = parseFloat(String(value).split("|")[1] ?? "0");
    if (d.items[idx]) {
      d.items[idx].qty = v;
      if (d.items[idx].unit_price !== null) d.items[idx].line_total = lineTotal(v, d.items[idx].unit_price!, 0);
    }
  }

  if (d.intent === "sale_cash" || d.intent === "sale_credit") {
    const allPriced = d.items.every((i) => i.line_total !== null && i.qty !== null);
    const sum = allPriced ? round2(d.items.reduce((s, i) => s + (i.line_total ?? 0), 0)) : null;
    if (sum !== null && !d.missing.includes("total_conflict") && d.items.length) d.total = sum;
    if (d.total !== null && d.paid_now !== null) d.credit_amount = round2(Math.max(0, d.total - d.paid_now));
    else if (d.total !== null && d.intent === "sale_credit" && d.paid_now === null) {
      d.paid_now = 0;
      d.credit_amount = d.total;
    }
    d.missing = d.missing.filter((m) => {
      if (m.startsWith("qty:")) return d.items[parseInt(m.split(":")[1], 10)]?.qty === null;
      if (m.startsWith("price:")) return d.items[parseInt(m.split(":")[1], 10)]?.unit_price === null;
      return true;
    });
  }
  d.questions = buildQuestions(d, ctx);
  d.confidence = computeConfidence(d);
  return d;
}

const LLM_INTENTS: Intent[] = [
  "sale_cash",
  "sale_credit",
  "payment",
  "refund",
  "stock_in",
  "wanted_item",
  "resolve_wanted",
  "update_entry",
  "delete_entry",
  "undo",
  "set_credit_limit",
  "add_customer",
  "add_product",
  "set_reminder",
];

export function mergeEnhancement(draft: Draft, guess: LlmGuess | null, ctx: ParseContext): Draft {
  if (!guess || typeof guess !== "object") return draft;
  const d: Draft = JSON.parse(JSON.stringify(draft)) as Draft;
  const spoken = new Set(numbersInUtterance(d.transcript).map((n) => round2(n)));
  const hasSpoken = (v: number | null | undefined): v is number => v !== null && v !== undefined && spoken.has(round2(v));

  if ((d.intent === "clarify" || d.confidence < 0.4) && guess.intent && (LLM_INTENTS as string[]).includes(guess.intent)) {
    d.intent = guess.intent as Intent;
  }

  if (guess.customer && !d.customer?.id) {
    const m = matchCustomer(guess.customer, ctx.customers);
    d.customer = {
      text: m.best?.name ?? guess.customer,
      id: m.best?.id ?? null,
      candidates: m.candidates.length > 1 && !m.best ? m.candidates : d.customer?.candidates,
    };
  }

  if (d.items.length === 0 && Array.isArray(guess.items) && guess.items.length) {
    const items: ParsedItem[] = [];
    for (const gi of guess.items.slice(0, 20)) {
      const name = String(gi?.name ?? "").trim();
      if (!name) continue;
      const m = matchProduct(name, ctx.products);
      const qty = hasSpoken(gi.qty) ? round2(gi.qty) : null;
      const unitPrice = hasSpoken(gi.unit_price) ? round2(gi.unit_price) : null;
      items.push({
        name: m.best?.name ?? name,
        product_id: m.best?.id ?? null,
        qty,
        unit: String(gi.unit ?? m.best?.unit ?? "pc"),
        unit_price: unitPrice,
        discount: 0,
        line_total: qty !== null && unitPrice !== null ? round2(qty * unitPrice) : null,
        matched: m.best ? m.method : "none",
      });
    }
    if (items.length) d.items = items;
  } else if (d.items.length && Array.isArray(guess.items)) {
    guess.items.slice(0, d.items.length).forEach((gi, i) => {
      const it = d.items[i];
      if (!it) return;
      if (it.qty === null && hasSpoken(gi.qty)) it.qty = round2(gi.qty);
      if (it.unit_price === null && hasSpoken(gi.unit_price)) it.unit_price = round2(gi.unit_price);
      if (it.qty !== null && it.unit_price !== null) it.line_total = round2(it.qty * it.unit_price - it.discount);
      if (!it.product_id && gi.name) {
        const m = matchProduct(String(gi.name), ctx.products);
        if (m.best) {
          it.product_id = m.best.id;
          it.name = m.best.name;
          it.matched = m.method;
        }
      }
    });
  }

  if (d.total === null && hasSpoken(guess.total)) d.total = round2(guess.total);
  if (d.paid_now === null && hasSpoken(guess.paid_now)) d.paid_now = round2(guess.paid_now);
  if (d.credit_limit_new == null && hasSpoken(guess.credit_limit_new)) d.credit_limit_new = round2(guess.credit_limit_new);
  if (!d.method && guess.method && (["cash", "easypaisa", "jazzcash", "bank", "credit"] as string[]).includes(guess.method)) {
    d.method = guess.method as PayMethod;
  }
  if (
    d.intent === "wanted_item" &&
    d.wanted &&
    guess.wanted_reason &&
    (["out_of_stock", "price", "variant", "deferred", "other"] as string[]).includes(guess.wanted_reason)
  ) {
    d.wanted.reason = guess.wanted_reason as WantedReason;
  }

  if (d.intent === "sale_cash" || d.intent === "sale_credit") {
    const allPriced = d.items.length > 0 && d.items.every((i) => i.line_total !== null && i.qty !== null);
    const sum = allPriced ? round2(d.items.reduce((s, i) => s + (i.line_total ?? 0), 0)) : null;
    if (sum !== null && d.total === null && !d.missing.includes("total_conflict")) d.total = sum;
    if (d.total !== null && d.paid_now !== null) d.credit_amount = round2(Math.max(0, d.total - d.paid_now));
    else if (d.total !== null && d.intent === "sale_credit" && d.paid_now === null) {
      d.paid_now = 0;
      d.credit_amount = d.total;
    }
  }

  d.missing = d.missing.filter((m) => {
    if (m.startsWith("qty:")) return d.items[parseInt(m.split(":")[1], 10)]?.qty === null;
    if (m.startsWith("price:")) return d.items[parseInt(m.split(":")[1], 10)]?.unit_price === null;
    if (m === "method") return d.method === null;
    if (m === "items") return d.items.length === 0;
    return true;
  });
  d.questions = buildQuestions(d, ctx);
  d.confidence = Math.max(d.confidence, computeConfidence(d));
  return d;
}

export function draftFromPartial(ctx: ParseContext, partial: Partial<Draft>): Draft {
  const now = new Date();
  const d: Draft = {
    id: uuid(),
    shop_id: ctx.shop_id,
    intent: "clarify",
    source: "text",
    transcript: "",
    customer: null,
    items: [],
    total: null,
    paid_now: null,
    credit_amount: null,
    method: null,
    occurred_at: now.toISOString(),
    note: null,
    missing: [],
    confidence: 0,
    questions: [],
    warnings: [],
    wanted: null,
    target_entry: null,
    credit_limit_new: null,
    review_status: "pending",
    created_at: now.toISOString(),
    ...partial,
  };
  if (d.intent === "sale_cash" || d.intent === "sale_credit") {
    const allPriced = d.items.length > 0 && d.items.every((i) => i.line_total !== null && i.qty !== null);
    const sum = allPriced ? round2(d.items.reduce((s, i) => s + (i.line_total ?? 0), 0)) : null;
    if (sum !== null && d.total === null && !d.missing.includes("total_conflict")) d.total = sum;
    if (d.total !== null && d.paid_now !== null) d.credit_amount = round2(Math.max(0, d.total - d.paid_now));
    else if (d.total !== null && d.intent === "sale_credit" && d.paid_now === null) {
      d.paid_now = 0;
      d.credit_amount = d.total;
    }
  }
  d.questions = buildQuestions(d, ctx);
  d.confidence = computeConfidence(d);
  return d;
}

export function draftSummary(draft: Draft, lang: "roman" | "ur" | "en" = "roman"): string {
  if (draft.intent === "question") return draft.transcript;
  const lines: string[] = [];
  const who = draft.customer?.id ? ctxName(draft.customer.candidates, draft.customer.id) ?? draft.customer.text : draft.customer?.text;
  if (draft.intent === "sale_cash" || draft.intent === "sale_credit") {
    if (who) lines.push(`Customer: ${who}`);
    for (const i of draft.items) {
      const q = i.qty === null ? "?" : i.qty;
      const p = i.unit_price === null ? "rate?" : `Rs ${i.unit_price}`;
      lines.push(`${i.name} — ${q} ${i.unit} × ${p}`);
    }
    if (draft.total !== null) lines.push(`Total: Rs ${draft.total}`);
    if (draft.intent === "sale_credit" && draft.credit_amount !== null) lines.push(`Udhaar: Rs ${draft.credit_amount}${draft.paid_now ? `, cash: Rs ${draft.paid_now}` : ""}`);
    else lines.push("Cash sale");
  } else if (draft.intent === "payment") {
    lines.push(`Payment${who ? ` — ${who}` : ""}: Rs ${draft.total ?? "?"}`);
  } else if (draft.intent === "stock_in") {
    lines.push(`Stock mein: ${draft.items.map((i) => `${i.qty ?? 1} ${i.unit} ${i.name}`).join(", ")}`);
  } else if (draft.intent === "wanted_item") {
    lines.push(`Mangwana: ${draft.items[0]?.name ?? "?"} × ${draft.wanted?.qty ?? 1}${who ? ` (${who})` : ""}`);
    const reasonText: Record<string, string> = { out_of_stock: "Stock khatam tha", price: "Rate zyada tha", variant: "Doosra rang/size chahiye tha", deferred: "Baad mein lena tha", other: "Wajah note nahi hui" };
    lines.push(reasonText[draft.wanted?.reason ?? "other"]);
  } else if (draft.intent === "add_customer") {
    lines.push(`Naya customer: ${who ?? draft.customer?.text ?? "?"}`);
  } else if (draft.intent === "resolve_wanted") {
    lines.push(`Aa gaya: ${draft.items[0]?.name ?? "?"}`);
  } else if (draft.intent === "update_entry") {
    const c = (draft as Draft & { correction?: { field: string; old: number | null; value: number | null } }).correction;
    lines.push(c ? `Correction: ${c.field === "qty" ? "quantity" : "rate"} ${c.old !== null ? c.old + " → " : ""}${c.value}` : "Entry update");
  } else if (draft.intent === "delete_entry") {
    lines.push("Aakhri entry hatani hai");
  } else if (draft.intent === "set_credit_limit") {
    lines.push(`Nayi udhaar limit: Rs ${draft.credit_limit_new ?? "?"}`);
  }
  return lines.join("\n");
}

function ctxName(candidates: Customer[] | undefined, id: string): string | null {
  return candidates?.find((c) => c.id === id)?.name ?? null;
}
