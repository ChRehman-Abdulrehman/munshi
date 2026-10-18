import { NextResponse } from "next/server";
import { z } from "zod";
import { parseUtterance } from "@/lib/parser/rules";
import { FEWSHOT } from "@/lib/parser/fewshot";
import type { Customer, Product } from "@/lib/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  text: z.string().min(1).max(2000),
  source: z.enum(["voice", "text", "ocr"]).default("text"),
  shop_id: z.string().min(1),
  products: z.array(z.record(z.string(), z.unknown())).max(1000).default([]),
  customers: z.array(z.record(z.string(), z.unknown())).max(2000).default([]),
});

const SYSTEM_PROMPT = `You are Munshi, an assistant for a Pakistani shopkeeper. The user speaks mixed Roman Urdu / Urdu / English.
Extract a structured draft as JSON with keys:
- intent: sale_cash|sale_credit|payment|refund|stock_in|wanted_item|resolve_wanted|update_entry|delete_entry|undo|set_credit_limit|add_customer|add_product|set_reminder|question
- customer: exact customer name from the KNOWN CUSTOMERS list if it matches, else the spoken name, else null
- items: array of { name (exact product name from KNOWN PRODUCTS if it matches), qty (number|null), unit (string|null), unit_price (number|null) }
- total: number|null (total rupees mentioned or agreed)
- paid_now: number|null (cash received on the spot; for full credit sale use null)
- method: cash|easypaisa|jazzcash|bank|credit|null
- credit_limit_new: number|null (only for set_credit_limit)
- correction: { field: "qty"|"unit_price"|"total", value: number } | null (only for update_entry)
- wanted_reason: out_of_stock|price|variant|deferred|other|null
- missing: string[] (fields the user did NOT state, e.g. unit_price)
- confidence: 0..1

STRICT RULES:
- NEVER invent quantities, prices or totals the user did not say. Only use numbers that appear in the utterance either as digits (2500, 1,200) or as Roman/Urdu number words (pandrah sau = 1500, dhai hazaar = 2500, dedh = 1.5). If a number is not in the utterance, put the field in missing and use null.
- "udhaar" / "khata" / "baqi" / "credit pe" means sale_credit. "cash" / "naqad" means cash payment.
- Return ONLY JSON, no markdown.`;

function nameList(rows: Record<string, unknown>[], key: string, limit: number): string {
  return rows
    .slice(0, limit)
    .map((r) => String(r[key] ?? "").trim())
    .filter(Boolean)
    .join(" | ");
}

async function llmEnhance(bodyText: string, ruleDraft: unknown, products: Record<string, unknown>[], customers: Record<string, unknown>[]): Promise<unknown | null> {
  const groq = process.env.GROQ_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  const context = `KNOWN PRODUCTS: ${nameList(products, "name", 120) || "(none yet)"}
KNOWN CUSTOMERS: ${nameList(customers, "name", 200) || "(none yet)"}
Utterance: ${bodyText}
Rule parser guess: ${JSON.stringify(ruleDraft)}`;
  try {
    if (groq) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groq}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...FEWSHOT.flatMap((ex) => [
              { role: "user", content: `Utterance: ${ex.user}` },
              { role: "assistant", content: JSON.stringify(ex.draft) },
            ]),
            { role: "user", content: context },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      return content ? JSON.parse(content) : null;
    }
    if (gemini) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-1.5-flash"}:generateContent?key=${gemini}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${context}` }] }],
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
          }),
        }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return content ? JSON.parse(content) : null;
    }
  } catch {
    return null;
  }
  return null;
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
    return NextResponse.json({ ok: false, error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }
  const { text, source, shop_id, products, customers } = parsed.data;

  const ruleDraft = parseUtterance(text, {
    shop_id,
    products: products as unknown as Product[],
    customers: customers as unknown as Customer[],
  }, source);

  const enhanced = await llmEnhance(
    text,
    {
      intent: ruleDraft.intent,
      customer: ruleDraft.customer?.text ?? null,
      items: ruleDraft.items.map((i) => ({ name: i.name, qty: i.qty, unit_price: i.unit_price, unit: i.unit })),
      total: ruleDraft.total,
      paid_now: ruleDraft.paid_now,
      method: ruleDraft.method,
      confidence: ruleDraft.confidence,
      missing: ruleDraft.missing,
    },
    products,
    customers
  );

  return NextResponse.json({
    ok: true,
    draft: ruleDraft,
    llm: enhanced,
    llm_used: enhanced !== null,
  });
}
