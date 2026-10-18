export const NUMBER_WORDS: Record<string, number> = {
  aik: 1, ek: 1, "1": 1, eik: 1,
  do: 2, dou: 2, "2": 2,
  teen: 3, tin: 3, "3": 3,
  char: 4, chaar: 4, "4": 4,
  paanch: 5, panch: 5, "5": 5,
  che: 6, cheh: 6, chhe: 6, "6": 6,
  saat: 7, "7": 7,
  aath: 8, "8": 8,
  nau: 9, "9": 9,
  das: 10, "10": 10,
  gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19,
  bees: 20, pachees: 25, tees: 30, chalees: 40, pachas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
  sau: 100, so: 100,
  dedh: 1.5, dhai: 2.5, sava: 1.25, adha: 0.5,
};

export const MULTIPLIERS: Record<string, number> = {
  sau: 100, so: 100, hazaar: 1000, hazar: 1000, thousand: 1000, lakh: 100000, million: 1000000,
};

export const UNITS = [
  "kilo", "kg", "kgs", "gram", "gramme", "g", "packet", "packets", "pack", "packs",
  "pcs", "piece", "pieces", "pc", "dozen", "darzan", "bori", "bag", "bags",
  "litre", "liter", "ltr", "l", "meter", "metre", "gaz", "yard", "set", "sets",
  "bottle", "bottles", "tube", "tubes", "dabba", "dabbay", "tin", "tins", "carton",
  "roll", "rolls", "thaan", "suit", "suits", "jori", "jora", "jore", "nos", "no",
];

export const UNIT_CANON: Record<string, string> = {
  kg: "kg", kgs: "kg", kilo: "kg", gram: "g", gramme: "g", g: "g",
  packet: "packet", packets: "packet", pack: "packet", packs: "packet",
  pcs: "pc", piece: "pc", pieces: "pc", pc: "pc", nos: "pc", no: "pc",
  dozen: "dozen", darzan: "dozen",
  bori: "bori", bag: "bag", bags: "bag",
  litre: "litre", liter: "litre", ltr: "litre", l: "litre",
  meter: "meter", metre: "meter", gaz: "gaz", yard: "gaz",
  set: "set", sets: "set",
  bottle: "bottle", bottles: "bottle", tube: "tube", tubes: "tube",
  dabba: "dabba", dabbay: "dabba", tin: "tin", tins: "tin", carton: "carton",
  roll: "roll", rolls: "roll", thaan: "thaan",
  suit: "suit", suits: "suit", jori: "jori", jora: "jori", jore: "jori",
};

export const INTENT_WORDS = {
  payment: ["de diye", "de diya", "de di", "diye", "diya", "payment mili", "payment mil gayi", "paisay diye", "paisa diya", "ada kar", "wapis kiye", "jama", "jama kar", "accounts payment", "account payment", "qarz wapis"],
  cash: ["cash", "naqad", "naqd", "nagad", "cash sale", "foran diye", "abhi diye", "poory paise", "pooray paise"],
  credit: ["udhaar", "udhar", "baaki", "baqi", "likh do", "likhdo", "khata", "credit"],
  stock_in: ["stock mein add", "stock me add", "stock mein daalo", "stock me daalo", "maal aaya", "maal aaye", "nai aaye", "naye aaye", "naya maal", "aaye hain", "aa gaye hain", "stock in", "restock", "store mein add"],
  wanted: ["manga tha", "maanga tha", "mangi thi", "maangi thi", "manga tha lekin", "manga", "maanga", "maangi", "mangi", "chahiye thi", "chah raha tha", "chah rahe the", "poocha tha", "poochha tha", "puchha tha"],
  not_available: ["nahi thi", "nahi tha", "stock khatam", "khatam tha", "khatam hai", "mojood nahi", "maujood nahi", "available nahi", "nahi mila", "nahi mili", "khatam ho gaya"],
  resolve: ["aa gaya", "aa gaye", "aa gai", "mangwa liya", "mangwa li", "mangwa lia", "stock mein aa gaya", "stock me aa gaya", "order aa gaya", "arrive ho gaya"],
  delete: ["hata do", "hataao", "hatao", "mita do", "mitao", "delete karo", "delete kar do", "remove karo", "nikal do", "cancel karo", "cancel kar do"],
  undo: ["undo", "undo karo", "wapas lao", "wapas kar do", "pichla wapas", "pichli wapas", "last undo"],
  update: ["badal do", "badlo", "theek karo", "theek kar do", "change karo", "change kar do", "sahi kar do", "correct karo", "edit karo", "update karo", "nahi thay", "nahi tha", "nahi thi", "nahi the", "rate kar do", "rate kardo"],
  limit: ["limit karo", "limit kar do", "limit badhao", "limit badha do", "limit set karo", "limit rakho", "limit lagao"],
  add_customer: ["naya customer", "naya grahak", "naya customer add", "customer add karo", "naya banda", "add customer"],
  add_product: ["naya product", "naya maal add", "product add karo", "item add karo"],
  reminder: ["yaad dilana", "yaad dilao", "yaad dila do", "reminder laga", "reminder lagao", "reminder set karo"],
  question_starts: ["kya", "kitna", "kitne", "kitni", "kaun", "kon", "kis", "konsa", "kaunsa", "kaunsi", "kaunse", "kab", "kahan", "kaise", "how", "what", "which", "who", "when", "how much", "how many", "top", "sab se", "sabse", "sab se zyada", "sabse zyada"],
};

export const DAY_WORDS: Record<string, number> = {
  aaj: 0, today: 0,
  kal: -1, yesterday: -1,
  parso: -2, parson: -2,
  "pichlay hafte": -7, "pichhle hafte": -7, "last week": -7,
};

export const REASON_MAP: { words: string[]; reason: "out_of_stock" | "price" | "variant" | "deferred" | "other" }[] = [
  { words: ["stock khatam", "khatam tha", "nahi thi", "nahi tha", "mojood nahi", "maujood nahi", "nahi mila", "nahi mili", "available nahi"], reason: "out_of_stock" },
  { words: ["mehnga", "price zyada", "rate zyada", "daam zyada", "expensive"], reason: "price" },
  { words: ["rang", "color", "design", "size", "different", "aur wala", "doosra wala", "variant"], reason: "variant" },
  { words: ["baad mein", "abhi nahi", "kal aaye ga", "phir aana", "deferred", "soch rahe"], reason: "deferred" },
];

export const STOPWORDS = new Set([
  "ko", "ne", "ke", "ki", "ka", "se", "mein", "me", "par", "pe", "aur", "and", "bhi",
  "liye", "wala", "wali", "walay", "hai", "hain", "tha", "thi", "the", "ho", "gaya", "gayi", "gaye",
  "do", "de", "dena", "karo", "kar", "kardo", "likh", "likho", "likhdo", "add", "daalo", "aaj", "kal", "parso",
  "please", "plz", "bhai", "sahab", "sahib", "ji", "sir",
  "stock", "udhaar", "udhar", "baaki", "baqi", "credit", "khata", "cash", "naqad", "naqd",
  "sale", "bika", "biki", "bikay", "becha", "bechi", "hui", "hua", "huay", "nikale", "nikala",
  "diye", "diya", "dey", "dena", "jama", "ada", "aa", "aya", "ayi", "aaye", "abhi", "foran",
  "mil", "mili", "mila", "milay", "wapis", "wapas", "poora", "pooray", "poory", "kuch",
]);
