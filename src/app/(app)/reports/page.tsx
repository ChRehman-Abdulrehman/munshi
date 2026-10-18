"use client";

import * as React from "react";
import { useApp } from "@/components/providers";
import { useAsync } from "@/lib/hooks";
import { money, dateOnly } from "@/lib/format";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Chip, Skeleton } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { downloadAllCsv } from "@/lib/export";
import { topSellers } from "@/lib/intel/hot";
import { customerStats, topCustomersBy, overdueCustomers } from "@/lib/intel/customers";
import { groupWanted } from "@/lib/intel/demand";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3, Download, ShieldCheck, PackagePlus } from "lucide-react";
import { fill } from "@/lib/i18n";

type Range = "today" | "week" | "month" | "all";

export default function ReportsPage() {
  const { repo, shop, customers, products, lang, t } = useApp();
  const toast = useToast();
  const [range, setRange] = React.useState<Range>("week");
  const [recon, setRecon] = React.useState<{ ok: boolean; diffs: { customer_id: string; derived: number; displayed: number; diff: number }[]; checked: number } | null>(null);
  const [reconBusy, setReconBusy] = React.useState(false);

  const from = React.useMemo(() => {
    const now = new Date();
    if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (range === "week") return new Date(now.getTime() - 7 * 86400000).toISOString();
    if (range === "month") return new Date(now.getTime() - 30 * 86400000).toISOString();
    return "1970-01-01T00:00:00.000Z";
  }, [range]);

  const entriesQ = useAsync(() => (repo ? repo.listEntries({ from }) : Promise.resolve([])), [repo, from]);
  const payQ = useAsync(() => (repo ? repo.listPayments() : Promise.resolve([])), [repo]);
  const balQ = useAsync(() => (repo ? repo.balanceMap() : Promise.resolve(new Map<string, number>())), [repo]);
  const wantedQ = useAsync(() => (repo ? repo.listWanted() : Promise.resolve([])), [repo]);
  const auditQ = useAsync(() => (repo ? repo.listAudit({ limit: 20 }) : Promise.resolve([])), [repo]);

  const entries = entriesQ.data ?? [];
  const payments = payQ.data ?? [];
  const balances = balQ.data ?? new Map<string, number>();
  const to = new Date().toISOString();

  const data = React.useMemo(() => {
    const active = entries.filter((e) => e.status === "active");
    const sales = active.filter((e) => e.type === "sale");
    const totalSales = sales.reduce((s, e) => s + e.total, 0);
    const cashIn = sales.reduce((s, e) => s + e.paid_now, 0) + active.filter((e) => e.type === "payment").reduce((s, e) => s + e.total, 0);
    const creditGiven = sales.reduce((s, e) => s + e.credit_amount, 0);
    const profit = sales.reduce((s, e) => {
      const cost = e.lines.reduce((c, l) => {
        const p = l.product_id ? products.find((pp) => pp.id === l.product_id) : null;
        return c + (p?.cost_price != null ? l.qty * p.cost_price : 0);
      }, 0);
      return s + e.total - cost;
    }, 0);

    const days: { label: string; sales: number }[] = [];
    const buckets = range === "today" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 60;
    for (let i = buckets - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = dateOnly(d.toISOString());
      const t = sales.filter((e) => dateOnly(e.occurred_at) === key).reduce((s, e) => s + e.total, 0);
      if (range === "month" && i % 5 !== 0 && i !== 0) continue;
      days.push({ label: d.toLocaleDateString("en", range === "today" ? { weekday: "short" } : { day: "numeric", month: "short" }), sales: Math.round(t) });
    }
    return { totalSales, cashIn, creditGiven, profit, days };
  }, [entries, range, products]);

  const top = React.useMemo(() => topSellers(entries, { from, to, by: "units", limit: 8 }), [entries, from, to]);

  const stats = React.useMemo(() => {
    if (!shop) return [];
    return customerStats(customers, entries, payments, balances, { from, to, shopOverdueDays: shop.settings.overdue_days });
  }, [customers, entries, payments, balances, shop, from, to]);

  const topCustomers = React.useMemo(() => topCustomersBy(stats, "value", 5), [stats]);
  const overdue = React.useMemo(() => overdueCustomers(stats), [stats]);
  const wantedGroups = React.useMemo(() => groupWanted(wantedQ.data ?? []), [wantedQ.data]);

  const doReconcile = async () => {
    if (!repo) return;
    setReconBusy(true);
    const res = await repo.reconcile();
    setRecon(res);
    setReconBusy(false);
    if (res.ok) toast.push("success", fill(t("rp_recon_toast_ok"), { n: String(res.checked) }));
    else toast.push("warning", fill(t("rp_recon_toast_diff"), { n: String(res.diffs.length) }));
  };

  const exportAll = async () => {
    if (!repo) return;
    try {
      const files = await repo.exportAll();
      downloadAllCsv(files);
      toast.push("success", fill(t("rp_export_n"), { n: String(files.length) }));
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("bh_export_fail"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">{t("reports")}</h1>
        <Button size="sm" variant="outline" onClick={exportAll}>
          <Download size={14} /> Export
        </Button>
      </div>

      <div className="flex gap-2">
        {(["today", "week", "month", "all"] as Range[]).map((r) => (
          <Chip key={r} active={range === r} onClick={() => setRange(r)}>
            {r === "today" ? t("rt_today") : r === "week" ? t("rt_7") : r === "month" ? t("rt_30") : t("f_all")}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardTitle>{t("rp_total_sales")} {range === "all" ? t("rp_all_paren") : ""}</CardTitle>
          {entriesQ.loading ? <Skeleton className="mt-2 h-7 w-24" /> : <CardValue>{money(data.totalSales, lang)}</CardValue>}
        </Card>
        <Card>
          <CardTitle>{t("rp_cash_in")}</CardTitle>
          {entriesQ.loading ? <Skeleton className="mt-2 h-7 w-24" /> : <CardValue className="text-primary">{money(data.cashIn, lang)}</CardValue>}
        </Card>
        <Card>
          <CardTitle>{t("rp_credit_given")}</CardTitle>
          {entriesQ.loading ? <Skeleton className="mt-2 h-7 w-24" /> : <CardValue className="text-brick">{money(data.creditGiven, lang)}</CardValue>}
        </Card>
        <Card>
          <CardTitle>{t("rp_profit")}</CardTitle>
          {entriesQ.loading ? <Skeleton className="mt-2 h-7 w-24" /> : <CardValue>{money(data.profit, lang)}</CardValue>}
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-3">{t("rp_trend")}</CardTitle>
        {data.days.length > 1 ? (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.days}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => money(Number(v), lang)} contentStyle={{ borderRadius: 16, border: "1px solid #EDE6DA" }} />
                <Bar dataKey="sales" fill="#0B6B4F" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted">{t("rp_today_sales")} {money(data.totalSales, lang)}</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-2">{t("rp_top_sellers")}</CardTitle>
          {top.length === 0 ? (
            <p className="py-3 text-sm text-muted">{t("rp_no_sales")}</p>
          ) : (
            <div className="space-y-2">
              {top.map((tp, i) => (
                <div key={tp.product_id} className="flex items-center gap-3 text-[14px]">
                  <span className="w-5 text-center font-black text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{tp.name}</span>
                  <span className="text-muted">{tp.units} {t("sk_units_word")}</span>
                  <span className="tnum w-20 text-right font-bold">{money(tp.value, lang)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle className="mb-2">{t("rp_good_customers")}</CardTitle>
          {topCustomers.length === 0 ? (
            <p className="py-3 text-sm text-muted">{t("rp_no_purch")}</p>
          ) : (
            <div className="space-y-2">
              {topCustomers.map((s) => (
                <div key={s.customer.id} className="flex items-center gap-3 text-[14px]">
                  <span className="min-w-0 flex-1 truncate font-semibold">{s.customer.name}</span>
                  <span className="text-muted">{fill(t("rp_visit_n"), { n: String(s.visits) })}</span>
                  <span className="tnum w-20 text-right font-bold">{money(s.total_value, lang)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-2 flex items-center gap-1.5"><PackagePlus size={14} /> {t("rp_demand_title")}</CardTitle>
          {wantedGroups.length === 0 ? (
            <p className="py-3 text-sm text-muted">{t("rp_nothing_yet")}</p>
          ) : (
            <div className="space-y-2">
              {wantedGroups.slice(0, 6).map((g) => (
                <div key={g.key} className="flex items-center gap-3 text-[14px]">
                  <span className="min-w-0 flex-1 truncate font-semibold">{g.item_text}</span>
                  <Badge tone="saffron">{g.count}× </Badge>
                  <span className="text-muted">{g.total_qty} {t("rp_qty")}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle className="mb-2">{t("rp_overdue_title")}</CardTitle>
          {overdue.length === 0 ? (
            <p className="py-3 text-sm text-muted">{t("rp_all_on_time")}</p>
          ) : (
            <div className="space-y-2">
              {overdue.slice(0, 6).map((s) => (
                <div key={s.customer.id} className="flex items-center gap-3 text-[14px]">
                  <span className="min-w-0 flex-1 truncate font-semibold">{s.customer.name}</span>
                  <Badge tone="red">{t("rp_badge_old")}</Badge>
                  <span className="tnum w-24 text-right font-bold text-brick">{money(s.balance, lang)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="space-y-2">
        <CardTitle className="flex items-center gap-1.5"><ShieldCheck size={14} /> {t("rp_recon_title")}</CardTitle>
        <p className="text-[13px] text-muted">{t("rp_recon_note")}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={doReconcile} disabled={reconBusy}>
            {reconBusy ? t("rp_recon_busy") : t("rp_recon_btn")}
          </Button>
          {recon && (
            <Badge tone={recon.ok ? "green" : "red"}>
              {recon.ok ? fill(t("rp_recon_ok"), { n: String(recon.checked) }) : fill(t("rp_recon_diff"), { n: String(recon.diffs.length) })}
            </Badge>
          )}
        </div>
        {recon && !recon.ok && (
          <div className="space-y-1 rounded-2xl bg-brick-soft p-3 text-[13px]">
            {recon.diffs.map((d) => (
              <p key={d.customer_id}>
                {customers.find((c) => c.id === d.customer_id)?.name ?? d.customer_id}: {fill(t("rp_recon_line"), { a: money(d.derived, lang), b: money(d.displayed, lang), c: money(d.diff, lang) })}
              </p>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle className="mb-2">{t("rp_audit_title")}</CardTitle>
        {(auditQ.data ?? []).length === 0 ? (
          <p className="py-3 text-sm text-muted">{t("rp_audit_empty")}</p>
        ) : (
          <div className="space-y-1.5 text-[13px]">
            {(auditQ.data ?? []).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-muted">
                <Badge tone="muted">{a.action}</Badge>
                <span className="min-w-0 flex-1 truncate">{a.actor} • {a.entity}</span>
                <span>{new Date(a.created_at).toLocaleString("en-PK")}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="no-print">
        <CardTitle className="mb-2 flex items-center gap-1.5"><BarChart3 size={14} /> Backup</CardTitle>
        <p className="mb-2 text-[13px] text-muted">{t("rp_backup_note")}</p>
        <Button variant="outline" size="sm" onClick={exportAll}>
          <Download size={14} /> {t("rp_download_all")}
        </Button>
      </Card>
    </div>
  );
}
