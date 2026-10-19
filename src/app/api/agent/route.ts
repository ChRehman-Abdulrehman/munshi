import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1).max(40),
  lang: z.enum(["roman", "ur", "en"]).default("roman"),
  snapshot: z.string().max(4000).optional(),
});

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_shop_summary",
      description: "Aaj ka hisaab: entries count, sale total, payments, top udhaar, low stock. Use for 'aaj ka hisaab', 'summary', 'kaise chal raha hai'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_info",
      description: "Kisi customer ka udhaar/balance, phone, credit limit aur aakhri entries. Always use for any customer-specific question.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Customer ka naam jaisa owner ne bola" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_entries",
      description: "Aakhri kuch entries (aaj ki). Har entry: type, customer, amount, time.",
      parameters: {
        type: "object",
        properties: { count: { type: "number", description: "Kitni entries chahiye (default 5)" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock_info",
      description: "Stock status: koi product ka stock, low stock list, hot items (sab se zyada bikne wale).",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Product ka naam (optional — khali chhoro to poori list)" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dues",
      description: "Sab customers jinka udhaar baqi hai — naam ke saath, sab se zyada pehle.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_report",
      description: "Sales/payments/refunds ka total pichhle kitne din ka.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "Kitne din ka report (default 7)" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_page",
      description: "App ka koi page kholo: home, khata, bahi, stock, reports, settings, munshi.",
      parameters: {
        type: "object",
        properties: { page: { type: "string", enum: ["home", "khata", "bahi", "stock", "reports", "settings", "munshi"] } },
        required: ["page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_customer_khata",
      description: "Kisi customer ka khata page kholo.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_entry",
      description: "Nayi entry ka draft tayyar karo (sale, udhaar, payment, refund, stock). Ye save NAHI hota — owner screen par confirm karta hai. Numbers wohi jo owner ne bole.",
      parameters: {
        type: "object",
        properties: {
          intent: { type: "string", enum: ["sale_cash", "sale_credit", "payment", "refund", "stock_in"] },
          customer_name: { type: "string", description: "Customer ka naam (sale_credit/payment ke liye zaroori)" },
          items: {
            type: "array",
            description: "Item lines (sale/stock ke liye)",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                qty: { type: "number" },
                unit_price: { type: "number" },
              },
              required: ["name"],
            },
          },
          total: { type: "number", description: "Total rupees (agar owner ne bola)" },
          paid_now: { type: "number", description: "Sale par isi waqt mila cash" },
          method: { type: "string", enum: ["cash", "easypaisa", "jazzcash", "bank", "credit"] },
        },
        required: ["intent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_customer",
      description: "Naya customer add karne ka draft (owner confirm karega).",
      parameters: {
        type: "object",
        properties: { name: { type: "string" }, phone: { type: "string" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_credit_limit",
      description: "Customer ki udhaar limit badalne ka draft (owner confirm karega).",
      parameters: {
        type: "object",
        properties: { name: { type: "string" }, limit: { type: "number" } },
        required: ["name", "limit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "undo_last_entry",
      description: "Aakhri entry wapas (reverse) karne ka draft (owner confirm karega). Purani entry kabhi delete nahi hoti — sirf reverse.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

function systemPrompt(lang: string): string {
  const langLine =
    lang === "en"
      ? "Reply in simple English, max 3 short sentences."
      : lang === "ur"
        ? "Jawab Urdu script mein dein (devanagari nahi), chhota aur saada — max 3 chhote jumlay."
        : "Reply in Roman Urdu (simple, friendly), max 3 short sentences.";
  return `You are Munshi — the AI manager inside a voice-first shop ledger app used by a Pakistani shopkeeper.
The owner speaks Roman Urdu / Urdu / English. ${langLine}

RULES:
1) For ANY business data (balances, sales, stock, entries, dues) you MUST call a tool first. NEVER invent numbers.
2) Actions (sale, payment, refund, stock, add customer, credit limit, undo) are prepared as drafts for the owner to CONFIRM on screen — after calling prepare_entry/add_customer/set_credit_limit/undo_last_entry, tell the owner the draft is ready and to check & confirm it.
3) If a tool returns "not found" or missing info, ask the owner one short question instead of guessing.
4) Owner app ke pages bhi khol sakta hai — use open_page / open_customer_khata.
5) Never mention tool names or JSON to the owner. Be natural.`;
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation" }, { status: 400 });
  }

  const groq = process.env.GROQ_API_KEY;
  if (!groq) {
    return NextResponse.json({ ok: false, error: "no_llm_key" }, { status: 501 });
  }

  const { messages, lang, snapshot } = parsed.data;
  const sys = systemPrompt(lang) + (snapshot ? `\n\nSHOP SNAPSHOT (for context only — jab number chahiye to tool call karo):\n${snapshot}` : "");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groq}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
        temperature: 0.2,
        tools: TOOLS,
        tool_choice: "auto",
        messages: [{ role: "system", content: sys }, ...messages],
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "llm_failed", status: res.status }, { status: 502 });
    }
    const data = (await res.json()) as { choices?: { message?: Record<string, unknown> }[] };
    const message = data.choices?.[0]?.message;
    if (!message) return NextResponse.json({ ok: false, error: "empty" }, { status: 502 });
    return NextResponse.json({ ok: true, message });
  } catch {
    return NextResponse.json({ ok: false, error: "llm_failed" }, { status: 502 });
  }
}
