import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  q: z.string().min(1).max(500),
  snapshot: z.string().max(4000).optional(),
});

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
  const gemini = process.env.GEMINI_API_KEY;
  if (!groq && !gemini) {
    return NextResponse.json(
      { ok: false, error: "no_llm_key", message: "LLM key set nahi hai — app khud ka local jawab use karega." },
      { status: 501 }
    );
  }

  const prompt = `You are Munshi, a helpful assistant for a Pakistani shopkeeper. Answer in Roman Urdu (simple, friendly), max 3 sentences.
Shop data snapshot: ${parsed.data.snapshot ?? "(none)"}
Question: ${parsed.data.q}
Only use numbers from the snapshot. If the snapshot lacks the answer, say so honestly.`;

  try {
    if (groq) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groq}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const answer = data.choices?.[0]?.message?.content;
        if (answer) return NextResponse.json({ ok: true, answer, engine: "groq" });
      }
    }
    if (gemini) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL ?? "gemini-1.5-flash"}:generateContent?key=${gemini}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (answer) return NextResponse.json({ ok: true, answer, engine: "gemini" });
      }
    }
  } catch {
    void 0;
  }

  return NextResponse.json({ ok: false, error: "llm_failed" }, { status: 502 });
}
