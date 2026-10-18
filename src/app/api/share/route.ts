import { NextResponse } from "next/server";
import { notConfigured, serviceSupabase } from "../_lib/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.json({ ok: false, error: "token_required" }, { status: 400 });

  const sb = serviceSupabase();
  if (!sb) return notConfigured();

  const { data, error } = await sb.rpc("get_share_by_token", { token });
  if (error) return NextResponse.json({ ok: false, error: "server", message: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const price = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
  const bundle = data as {
    customer: { name: string };
    entries: { total: number; credit_amount: number; paid_now: number; occurred_at: string; type: string; status: string }[];
  };
  const active = (bundle.entries ?? []).filter((e) => e.status === "active");
  const purchases = active.filter((e) => e.type === "sale").reduce((s, e) => s + e.total, 0);
  const closing = active.reduce((s, e) => (e.type === "sale" ? s + e.credit_amount : e.type === "payment" || e.type === "refund" ? s - e.total : s), 0);

  return NextResponse.json({
    ok: true,
    statement: {
      summary: `${bundle.customer.name}: kharidari ${price(purchases)}, baqi ${price(closing)}`,
      bundle,
    },
  });
}
