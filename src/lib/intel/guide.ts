import type { Customer, Lang } from "../types";
import { matchCustomer, numbersInUtterance } from "../parser/rules";

export type NavAction = {
  type: "navigate";
  href: string;
  label: string;
  kind: "customer" | "page";
};

const OPEN_WORDS = ["khol", "dikha", "dekh", "chalo", "jao", "le chalo", "le jao", "lay jao", "open", "show", "navigate", "le kar jao", "le chal", "go to", "take me"];

const PAGE_ROUTES: { words: string[]; href: string; label: string; label_en: string }[] = [
  { words: ["garam maal", "garam saman", "hot items", "garam wala"], href: "/stock?tab=garam", label: "Garam maal", label_en: "Hot items" },
  { words: ["mangwana", "mangwaya", "mangwa", "missed demand", "demand list"], href: "/stock?tab=mangwana", label: "Mangwana list", label_en: "Restock list" },
  { words: ["scan", "parche ki", "parcha scan", "bill ki photo", "tasveer"], href: "/scan", label: "Scan", label_en: "Scan" },
  { words: ["report", "munafa", "profit", "top seller", "top customer"], href: "/reports", label: "Reports", label_en: "Reports" },
  { words: ["bahi", "hisaab kitab", "hisab kitab", "kitaab", "ledger", "din ki bahi"], href: "/bahi", label: "Bahi (hisaab)", label_en: "Ledger" },
  { words: ["stock", "samaan", "saman", "maal list", "godown", "inventory"], href: "/stock", label: "Stock", label_en: "Stock" },
  { words: ["alert", "notification", "zaroori baat"], href: "/alerts", label: "Alerts", label_en: "Alerts" },
  { words: ["setting", "zubaan", "dark mode", "language"], href: "/settings", label: "Settings", label_en: "Settings" },
  { words: ["munshi chat", "chat khol", "munshi khol"], href: "/munshi", label: "Munshi", label_en: "Munshi chat" },
  { words: ["home", "ghar", "main page", "dashboard"], href: "/", label: "Home", label_en: "Home" },
];

export function findCustomerInText(text: string, customers: Customer[]): Customer | null {
  const t = text.toLowerCase();
  const full = customers.filter((c) => t.includes(c.name.toLowerCase()));
  if (full.length === 1) return full[0];
  if (full.length > 1) return null;
  const byToken = customers.filter((c) =>
    c.name
      .toLowerCase()
      .split(/\s+/)
      .some((tok) => tok.length >= 3 && t.includes(tok))
  );
  if (byToken.length === 1) return byToken[0];
  if (byToken.length > 1) {
    const m = matchCustomer(text, byToken);
    return m.best ?? null;
  }
  return null;
}

export function matchNavigation(text: string, customers: Customer[], lang: Lang = "roman"): NavAction | null {
  const t = text.toLowerCase().trim();
  if (/\b(kaise|kese|kaisay|how|kya|kahan)\b/.test(t) || t.includes("?")) return null;
  const hasOpen = OPEN_WORDS.some((w) => t.includes(w));
  if (!hasOpen) return null;

  const khataIntent = /\b(khata|khatay|khate|udhaar|udhar|hisaab|hisab|account|ledger)\b/.test(t) && !/\b(bahi|report)\b/.test(t);
  if (khataIntent) {
    const c = findCustomerInText(text, customers);
    if (c) return { type: "navigate", href: `/khata/${c.id}`, label: lang === "en" ? `${c.name}'s account` : `${c.name} ka khata`, kind: "customer" };
    return { type: "navigate", href: "/khata", label: lang === "en" ? "Khata list" : "Khata list", kind: "page" };
  }

  for (const r of PAGE_ROUTES) {
    if (r.words.some((w) => t.includes(w))) return { type: "navigate", href: r.href, label: lang === "en" ? r.label_en : r.label, kind: "page" };
  }
  return null;
}

const CLEAR_VERBS = /\b(clear|saaf|saf|khatam|khatm|band)\b/;
const CLEAR_CONTEXT = /\b(bill|hisaab|hisab|udhaar|udhar|khata|paisa|paise|payment|wasooli)\b/;
const FULL_WORDS = /\b(poora|pura|poori|puri|saara|sara|saari|sari|sab|full|mukammal)\b/;

export function isFullClear(text: string): boolean {
  const t = text.toLowerCase();
  if (numbersInUtterance(text).some((n) => n >= 100)) return false;
  if (CLEAR_VERBS.test(t) && CLEAR_CONTEXT.test(t)) return true;
  if (FULL_WORDS.test(t) && /\b(jama|jamaa|wasool|wasooli|clear|payment)\b/.test(t) && CLEAR_CONTEXT.test(t)) return true;
  return false;
}

export type HelpTopic = {
  id: string;
  keywords: string[];
  title: string;
  title_en: string;
  steps: string[];
  steps_en: string[];
};

const QUESTION_CUES = ["kaise", "kese", "kaisay", "kya", "kahan", "kaha", "how", "help", "madad", "batao", "bataye", "bata", "samjha", "seekh", "sikh", "what is"];

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "entry",
    keywords: ["entry", "sale likh", "sale kaise", "sale likhna", "bech", "becha", "bika", "nayi entry", "make an entry", "record a sale", "new entry"],
    title: "Entry kaise karein (sale / bechi)",
    title_en: "How to make an entry (sale)",
    steps: [
      "Munshi screen par neeche mic wala button dabayein.",
      "Saaf bolein: “Ali ko do lawn suit pandrah sau ka udhaar likh do”.",
      "Munshi draft dikhayega —customer, maal, rate sab check karein.",
      "Agar kuch adhoora ho to wohi screen par sawal aayega — jawab dein.",
      "“Haan, save karo” dabayein — entry ho gayi. (Likha hua bhejna ho to neeche type bhi kar sakte hain.)",
    ],
    steps_en: [
      "On the Munshi screen, tap the mic button at the bottom.",
      "Speak clearly: “Ali ko 2 lawn suit 2500 udhaar likh do”.",
      "Munshi shows a draft — check the customer, items and rate.",
      "If something is missing, he asks right there — just answer.",
      "Tap “Yes, save it” — done. You can also type at the bottom instead of speaking.",
    ],
  },
  {
    id: "payment",
    keywords: ["payment", "payment kaise", "jama", "wasooli", "paise mile", "paise aaye", "cash mila", "bill clear", "received payment", "pay back", "collect"],
    title: "Payment (paise wasool) kaise likhein",
    title_en: "How to record a payment",
    steps: [
      "Bolein: “Ali ne do hazaar paanch sau jama karaye”.",
      "Munshi payment ka draft dikhayega aur tareeqa poochhega — Cash / Easypaisa / JazzCash / Bank choose karein.",
      "Save karein — paisa khud purani udhaar entries mein sab se pehle wali se adjust hota hai (FIFO).",
      "Poora hisaab khatam karna ho to bolein: “Ali ka bill clear kar do” — baqi poora amount khud aa jayega.",
    ],
    steps_en: [
      "Say: “Ali ne 2500 jama karaye”.",
      "Munshi shows a payment draft and asks the method — pick Cash / Easypaisa / JazzCash / Bank.",
      "Save — the money is adjusted oldest-first into the pending credit (FIFO).",
      "To close the whole balance say: “Ali ka bill clear kar do” — the full remaining amount is filled in automatically.",
    ],
  },
  {
    id: "khata",
    keywords: ["khata", "customer", "grahak", "naya banda", "udhaar list", "account list", "customer list"],
    title: "Khata (customer) kaise kholein aur manage karein",
    title_en: "How to open and manage a customer's account",
    steps: [
      "Neeche “Khata” tab dabayein — sab customers aur unka udhaar dikhega.",
      "Kisi ka khata kholne ke liye us ke naam par tap karein — poori history, payment aur statement wahan hai.",
      "Naya customer: Khata page par “Naya customer” button — naam, phone, limit bhar dein.",
      "Chat se bhi ho sakta hai: bolein “Ali ka khata khol do” — seedha khul jayega.",
    ],
    steps_en: [
      "Tap the “Khata” tab below — every customer and their balance appears.",
      "Tap a name to open their account — full history, payments and statement live there.",
      "New customer: on the Khata page tap “New customer” — fill name, phone, limit.",
      "Works from chat too: say “Ali ka khata khol do” — it opens directly.",
    ],
  },
  {
    id: "stock",
    keywords: ["stock", "maal", "saman", "naya maal", "stock mein dalna", "add stock", "inventory"],
    title: "Stock mein maal add karna",
    title_en: "How to add stock",
    steps: [
      "Bolein: “Mere paas bees gaz kapra aaya, ek sau pachas rupay gaz” — ya Stock tab par jaa kar “Naya maal” button dabayein.",
      "Rate, quantity aur minimum stock bhar dein — save karein.",
      "Stock kam ho to app khud “Khatam hone wala” alert dega.",
      "Garam maal (zyada bikne wala) Stock page ke “Garam” tab mein dikhta hai.",
    ],
    steps_en: [
      "Say: “20 gaz kapra aaya, 150 rupay gaz” — or open the Stock tab and tap “New item”.",
      "Fill rate, quantity and minimum stock — save.",
      "When stock runs low the app raises a “Low stock” alert by itself.",
      "Hot items (fast sellers) appear in the “Hot” tab of the Stock page.",
    ],
  },
  {
    id: "mangwana",
    keywords: ["mangwana", "manga", "missed", "customer ne manga", "nahi mila", "wanted", "not available", "restock"],
    title: "Mangwana (missed demand) kaise darj karein",
    title_en: "How to record an unavailable item (missed demand)",
    steps: [
      "Jab customer koi cheez maange aur na ho, bolein: “Sana ko school bag chahiye tha nahi mila”.",
      "Munshi wajah pooch sakta hai — stock khatam / rate / aur rang chahiye tha.",
      "Jab maal aa jaye, bolein: “School bag aa gaya” — app customer ko batane ki list dega.",
      "Poori list Stock page ke “Mangwana” tab mein hai.",
    ],
    steps_en: [
      "When a customer asks for something you don't have, say: “Sana ko school bag chahiye tha nahi mila”.",
      "Munshi may ask the reason — out of stock / price / another variant.",
      "When it arrives say: “School bag aa gaya” — the app gives you the list of customers to tell.",
      "The full list lives in the “Mangwana” tab of the Stock page.",
    ],
  },
  {
    id: "statement",
    keywords: ["statement", "hisaab bhej", "whatsapp", "share", "parchi", "send statement"],
    title: "Customer ko hisaab (statement) bhejna",
    title_en: "How to send a statement to a customer",
    steps: [
      "Khata tab → customer ka khata kholein.",
      "“Statement” button dabayein, tareekh chunein, phir “WhatsApp par bhejein”.",
      "Ya “Link banao” se permanent link banayein — customer khud kisi bhi waqt dekh sakta hai.",
      "Print bhi ho sakta hai — apni dukaan ka naam aur payment number upar aata hai.",
    ],
    steps_en: [
      "Khata tab → open the customer's account.",
      "Tap “Statement”, pick the dates, then “Send on WhatsApp”.",
      "Or create a permanent link with “Make link” — the customer can check any time.",
      "You can print it too — your shop name and payment number are included.",
    ],
  },
  {
    id: "scan",
    keywords: ["scan", "parcha", "bill ki tasveer", "photo", "kaghaz", "scan bill"],
    title: "Purana parcha / bill scan karna",
    title_en: "How to scan an old bill",
    steps: [
      "Neeche “More” / ya Home se “Scan” kholein.",
      "Purche ki saaf tasveer lein — roshni achi ho.",
      "App tasveer se lines khud parhega — check karke save karein.",
      "Halka parcha ek ek kar ke scan karna behtar hai.",
    ],
    steps_en: [
      "Open “Scan” from the sidebar or menu.",
      "Take a clear photo of the bill — good lighting helps.",
      "The app reads the lines itself — check them and save.",
      "Old bills scan better one by one.",
    ],
  },
  {
    id: "report",
    keywords: ["report", "munafa", "profit", "top", "kitna bika", "how much sold", "today summary"],
    title: "Report aur munafa dekhna",
    title_en: "How to see reports and profit",
    steps: [
      "Bolein: “Aaj ka hisaab suna do” — Munshi seedha bata dega.",
      "Tafseel ke liye Reports kholein: 7 din ki biki, top items, top customers.",
      "Purana hisaab: Bahi tab mein tareekh ke hisab se dekhein.",
      "Garam maal (jo zyada bik raha hai) Reports aur Stock dono mein hai.",
    ],
    steps_en: [
      "Say: “Aaj ka hisaab suna do” — Munshi tells you directly.",
      "For detail open Reports: 7-day sales, top items, top customers.",
      "For old accounts open the Bahi tab and pick the date.",
      "Hot items appear in both Reports and Stock.",
    ],
  },
  {
    id: "qr",
    keywords: ["qr", "payment number", "account number", "iban", "easypaisa number", "qr code", "my number"],
    title: "Payment number aur QR code",
    title_en: "Payment number and QR code",
    steps: [
      "Settings → “Payment / QR code” section kholein.",
      "Easypaisa / JazzCash / Bank select karein, apna number ya IBAN likhein, save karein.",
      "QR code khud ban jayega — wohi permanent rehta hai.",
      "Customer QR scan kar ke ya number copy kar ke payment kar sakta hai. Number badalna ho to yahin se change karein — QR khud update ho jayega.",
    ],
    steps_en: [
      "Open Settings → “Payment / QR code”.",
      "Pick Easypaisa / JazzCash / Bank, enter your number or IBAN and save.",
      "The QR code is generated automatically and stays permanent.",
      "Customers can scan the QR or copy the number to pay. Change the number here anytime — the QR updates itself.",
    ],
  },
  {
    id: "offline",
    keywords: ["offline", "internet nahi", "net nahi", "bina internet", "no internet"],
    title: "Internet band ho to?",
    title_en: "What if the internet is down?",
    steps: [
      "Ghabrayein nahi — Munshi bina internet bhi entry leta hai.",
      "Entry phone mein mehfooz ho jati hai aur “Pending sync” dikhata hai.",
      "Internet aane par khud server par chali jati hai — kuch karne ki zaroorat nahi.",
    ],
    steps_en: [
      "Don't worry — Munshi records entries without internet too.",
      "The entry is saved on your phone and shows “Pending sync”.",
      "It syncs by itself when the internet returns — nothing to do.",
    ],
  },
  {
    id: "undo",
    keywords: ["undo", "galti", "wapas", "mistake", "bhool", "reverse"],
    title: "Ghalat entry wapas karna (undo)",
    title_en: "How to undo a wrong entry",
    steps: [
      "Bolein: “Jo abhi likha tha wapas kar do” — ya Bahi tab mein us entry ko dabaye rakhein (hold).",
      "Wajah likhein — hisaab khud theek ho jata hai.",
      "Ghalti se hatai gayi entry “Reversed” mein chali jati hai; galti ho gayi ho to wahan se restore karein.",
    ],
    steps_en: [
      "Say: “Jo abhi likha tha wapas kar do” — or hold that entry in the Bahi tab.",
      "Write the reason — accounts fix themselves.",
      "Reversed entries move to “Reversed”; restore them from there if you change your mind.",
    ],
  },
  {
    id: "security",
    keywords: ["pin", "login", "password", "security", "guard", "password kaise"],
    title: "Login aur security",
    title_en: "Login and security",
    steps: [
      "App aap ke naam aur PIN (ya mazboot password) se khulti hai.",
      "PIN/password phone mein hashed mehfooz rehta hai. Settings → Suraksha se mazboot password lagayein (8+ harf, bara-chhota harf, hindsa, special symbol).",
      "Staff ke liye alag member aur PIN bana sakte hain: Settings → Team.",
      "Staff ko udhaar limit ke bawajood dene ki ijazat (override) bhi control kar sakte hain.",
    ],
    steps_en: [
      "The app opens with your name and PIN (or a strong password).",
      "It is stored hashed on the phone. Set a strong password in Settings → Security (8+ chars, upper & lower case, digit, special symbol).",
      "Create separate members and PINs for staff: Settings → Team.",
      "You also control whether staff may override credit limits.",
    ],
  },
  {
    id: "munshi_name",
    keywords: ["munshi ka naam", "naam badal", "apna munshi", "name change", "rename"],
    title: "Munshi ka naam badalna",
    title_en: "How to rename your Munshi",
    steps: [
      "Settings → “Mera Munshi” section kholein.",
      "Naya naam likhein (misal: “Chacha Munshi”) aur Save dabayein.",
      "Naam permanent yaad rehta hai — jab bhi change karna ho yahin se karein.",
    ],
    steps_en: [
      "Open Settings → “Mera Munshi”.",
      "Type a new name (e.g. “Chacha Munshi”) and tap Save.",
      "The name is remembered permanently — change it here anytime.",
    ],
  },
];

export function searchHelp(text: string): HelpTopic | null {
  const t = text.toLowerCase();
  const isQuestion = QUESTION_CUES.some((q) => t.includes(q)) || t.includes("?");
  let best: HelpTopic | null = null;
  let bestScore = 0;
  for (const topic of HELP_TOPICS) {
    let score = 0;
    for (const k of topic.keywords) if (t.includes(k)) score += k.includes(" ") ? 2 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }
  if (!best) return null;
  if (!isQuestion && bestScore < 2) return null;
  return best;
}

export function helpText(topic: HelpTopic, lang: Lang = "roman"): string {
  const lines = [lang === "en" ? topic.title_en : topic.title, ""];
  const steps = lang === "en" ? topic.steps_en : topic.steps;
  steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  return lines.join("\n");
}

export function helpTitle(topic: HelpTopic, lang: Lang = "roman"): string {
  return lang === "en" ? topic.title_en : topic.title;
}
