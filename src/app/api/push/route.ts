import { NextResponse } from "next/server";
import { z } from "zod";
import { serviceSupabase } from "../_lib/server";

export const runtime = "nodejs";

const SubSchema = z.object({
  endpoint: z.string().url().max(500),
  keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(300) }),
  shop_id: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = SubSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation" }, { status: 400 });
  }

  const sb = serviceSupabase();
  if (!sb) {
    return NextResponse.json(
      { ok: true, stored: false, message: "Local mode: notifications sirf is phone par (browser) milti hain." },
      { status: 200 }
    );
  }

  const { error } = await sb.from("push_subscriptions").upsert(
    {
      endpoint: parsed.data.endpoint,
      keys: parsed.data.keys,
      shop_id: parsed.data.shop_id ?? null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    return NextResponse.json({ ok: false, error: "server", message: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, stored: true });
}
