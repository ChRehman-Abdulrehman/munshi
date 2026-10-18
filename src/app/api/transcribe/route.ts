import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 24 * 1024 * 1024;

const ROMAN_BIAS =
  "Pakistani dukandar ki Roman Urdu awaz. Misalein: Ali ko do lawn suit pandrah sau ka udhaar likh do; " +
  "Kiran ne do hazaar paanch sau jama karaye; bees gaz kapra aaya ek sau pachas rupay gaz; " +
  "Sana ko gul ahmed wala suit mangna tha stock khatam tha. Numbers digits mein likho.";

const URDU_SCRIPT = /[\u0600-\u06FF]/;

async function romanize(text: string, groq: string): Promise<string> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groq}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Transliterate this Urdu text into Roman Urdu (Latin letters) exactly as a Pakistani shopkeeper speaks. " +
              "Keep numbers as digits. Do not translate to English. Return only the transliteration.",
          },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) return text;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}

export async function POST(req: Request) {
  const groq = process.env.GROQ_API_KEY;
  if (!groq) {
    return NextResponse.json(
      { ok: false, error: "no_llm_key", message: "GROQ_API_KEY set nahi hai — browser ki awaz (Web Speech) use hogi." },
      { status: 501 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ ok: false, error: "no_audio" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large", message: "Recording bohot lambi hai — chhota record karein." }, { status: 413 });
  }

  const fd = new FormData();
  fd.append("file", audio, audio.name || "voice.webm");
  fd.append("model", process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3");
  fd.append("response_format", "json");
  fd.append("temperature", "0");
  fd.append("prompt", ROMAN_BIAS);
  const langHint = form.get("language");
  if (typeof langHint === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(langHint)) {
    fd.append("language", langHint.split("-")[0]);
  }

  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groq}` },
      body: fd,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "stt_network" }, { status: 502 });
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return NextResponse.json({ ok: false, error: "stt_failed", detail }, { status: 502 });
  }

  const data = (await res.json()) as { text?: string };
  let text = (data.text ?? "").trim();
  let romanized = false;

  if (text && URDU_SCRIPT.test(text)) {
    text = await romanize(text, groq);
    romanized = true;
  }

  return NextResponse.json({ ok: true, text, romanized, engine: "whisper" });
}
