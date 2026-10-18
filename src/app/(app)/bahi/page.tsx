"use client";

import * as React from "react";
import { useApp } from "@/components/providers";
import { useAsync } from "@/lib/hooks";
import { money, fmtDate, fmtTime } from "@/lib/format";
import { Badge, statusTone } from "@/components/ui/badge";
import { Chip, EmptyState, Skeleton } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Download, BookOpenCheck, Undo2, RotateCcw } from "lucide-react";
import type { Entry } from "@/lib/types";
import { saleStatus } from "@/lib/ledger/balance";
import { csvFromRows, downloadText, downloadAllCsv } from "@/lib/export";
import { fill, saleStatusLabel } from "@/lib/i18n";

type Range = "today" | "yesterday" | "week" | "all";
type TypeFilter = "all" | "sale" | "payment" | "refund" | "stock_in";

export default function BahiPage() {
  const { repo, customers, products, lang, refreshAll, t } = useApp();
  const toast = useToast();
  const [range, setRange] = React.useState<Range>("today");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [reverseTarget, setReverseTarget] = React.useState<Entry | null>(null);
  const [reason, setReason] = React.useState("");
  const [restoreTarget, setRestoreTarget] = React.useState<Entry | null>(null);

  const entriesQ = useAsync(() => (repo ? repo.listEntries({ includeReversed: true }) : Promise.resolve([])), [repo]);
  const allocQ = useAsync(() => (repo ? repo.listAllocations() : Promise.resolve([])), [repo]);

  const from = React.useMemo(() => {
    const now = new Date();
    if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (range === "yesterday") {
      const y = new Date(now.getTime() - 86400000);
      return new Date(y.getFullYear(), y.getMonth(), y.getDate()).toISOString();
    }
    if (range === "week") return new Date(now.getTime() - 7 * 86400000).toISOString();
    return "1970-01-01T00:00:00.000Z";
  }, [range]);

  const to = React.useMemo(() => {
    if (range === "yesterday") {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }
    return new Date(Date.now() + 86400000).toISOString();
  }, [range]);

  const list = React.useMemo(() => {
    let out = (entriesQ.data ?? []).filter((e) => e.occurred_at >= from && e.occurred_at < to);
    if (typeFilter !== "all") out = out.filter((e) => e.type === typeFilter);
    return out.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }, [entriesQ.data, from, to, typeFilter]);

  const dayTotals = React.useMemo(() => {
    const active = list.filter((e) => e.status === "active");
    const sales = active.filter((e) => e.type === "sale").reduce((s, e) => s + e.total, 0);
    const cash = active.filter((e) => e.type === "sale").reduce((s, e) => s + e.paid_now, 0) + active.filter((e) => e.type === "payment").reduce((s, e) => s + e.total, 0);
    const credit = active.filter((e) => e.type === "sale").reduce((s, e) => s + e.credit_amount, 0);
    return { sales, cash, credit };
  }, [list]);

  const nameOf = (id?: string | null) => (id ? customers.find((c) => c.id === id)?.name ?? "—" : "—");

  const doReverse = async () => {
    if (!repo || !reverseTarget) return;
    if (reason.trim().length < 3) {
      toast.push("warning", t("bh_reason_warn"));
      return;
    }
    const res = await repo.reverse(reverseTarget.id, reason.trim());
    if (res.ok) {
      toast.push("success", t("bh_reversed_toast"));
      setReverseTarget(null);
      setReason("");
      await refreshAll();
      entriesQ.reload();
    } else {
      toast.push("error", res.message);
    }
  };

  const doRestore = async () => {
    if (!repo || !restoreTarget) return;
    const res = await repo.restore(restoreTarget.id);
    if (res.ok) {
      toast.push("success", t("bh_restored_toast"));
      setRestoreTarget(null);
      await refreshAll();
      entriesQ.reload();
    } else {
      toast.push("error", res.message);
    }
  };

  const exportCsv = () => {
    const rows = list.map((e) => ({
      tareekh: e.occurred_at,
      qism: e.type,
      customer: nameOf(e.customer_id),
      tafseel: e.lines.map((l) => `${l.description} x${l.qty}`).join("; "),
      total: e.total,
      mila_abhi: e.paid_now,
      udhaar: e.credit_amount,
      tareeqa: e.method,
      halat: e.status,
      status: e.type === "sale" ? saleStatus(e, allocQ.data ?? []) : "",
    }));
    const csv = csvFromRows(["tareekh", "qism", "customer", "tafseel", "total", "mila_abhi", "udhaar", "tareeqa", "halat", "status"], rows);
    downloadText(`munshi-bahi-${range}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.push("success", t("bh_csv_toast"));
  };

  const exportAll = async () => {
    if (!repo) return;
    try {
      const files = await repo.exportAll();
      downloadAllCsv(files);
      toast.push("success", fill(t("bh_export_n"), { n: String(files.length) }));
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("bh_export_fail"));
    }
  };

  const pressTimer = React.useRef<number | null>(null);

  const startPress = (e: Entry) => {
    if (e.status !== "active") return;
    pressTimer.current = window.setTimeout(() => {
      setReverseTarget(e);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 650);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">Bahi</h1>
          <p className="text-xs text-muted">{t("bh_sub")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download size={14} /> CSV
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <p className="text-[11px] text-muted">{t("bh_sales")}</p>
          <p className="tnum text-[15px] font-black">{money(dayTotals.sales, lang)}</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-[11px] text-muted">{t("bh_cash_in")}</p>
          <p className="tnum text-[15px] font-black text-primary">{money(dayTotals.cash, lang)}</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-[11px] text-muted">{t("bh_credit_out")}</p>
          <p className="tnum text-[15px] font-black text-brick">{money(dayTotals.credit, lang)}</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {(["today", "yesterday", "week", "all"] as Range[]).map((r) => (
          <Chip key={r} active={range === r} onClick={() => setRange(r)}>
            {r === "today" ? t("bh_today") : r === "yesterday" ? t("bh_yest") : r === "week" ? t("bh_week") : t("f_all")}
          </Chip>
        ))}
        <span className="w-2" />
        {(["all", "sale", "payment", "refund", "stock_in"] as TypeFilter[]).map((tf) => (
          <Chip key={tf} active={typeFilter === tf} onClick={() => setTypeFilter(tf)}>
            {tf === "all" ? t("bh_t_all") : tf === "sale" ? t("bh_t_sale") : tf === "payment" ? t("bh_t_payment") : tf === "refund" ? t("bh_t_refund") : t("bh_t_stock")}
          </Chip>
        ))}
      </div>

      {entriesQ.loading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState icon={<BookOpenCheck size={28} />} line={t("bh_empty")} />
      ) : (
        <div className="space-y-2">
          {list.map((e) => (
            <div
              key={e.id}
              onPointerDown={() => startPress(e)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              className={`card flex select-none items-center gap-3 p-3 ${e.status === "reversed" ? "opacity-60" : ""}`}
            >
              <span className="text-lg" aria-hidden>
                {e.type === "sale" ? "🧾" : e.type === "payment" ? "💵" : e.type === "refund" ? "↩️" : e.type === "stock_in" ? "📦" : "⚙️"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">
                  {nameOf(e.customer_id) !== "—" ? nameOf(e.customer_id) : e.lines.map((l) => l.description).join(", ") || e.type}
                </p>
                <p className="truncate text-xs text-muted">
                  {fmtDate(e.occurred_at, lang)} {fmtTime(e.occurred_at)}
                  {e.lines.length > 0 && <> • {e.lines.map((l) => `${l.description} ×${l.qty}`).join(", ")}</>}
                </p>
              </div>
              <div className="text-right">
                <p className="tnum text-[14px] font-black">{money(e.total, lang)}</p>
                <div className="mt-0.5 flex justify-end gap-1">
                  {e.status === "reversed" ? (
                    <>
                      <Badge tone="muted">Reversed</Badge>
                      <button onClick={() => setRestoreTarget(e)} className="rounded-lg p-1 text-primary" aria-label="Restore">
                        <RotateCcw size={14} />
                      </button>
                    </>
                  ) : (
                    e.type === "sale" && <Badge tone={statusTone(saleStatus(e, allocQ.data ?? []))}>{saleStatusLabel(saleStatus(e, allocQ.data ?? []), lang)}</Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={exportAll}>
          <Download size={16} /> {t("bh_export_all")}
        </Button>
      </div>

      <BottomSheet open={reverseTarget !== null} onClose={() => setReverseTarget(null)} title={t("bh_reverse_title")}>
        <p className="mb-2 text-sm text-muted">
          {t("bh_reverse_note")}
        </p>
        {reverseTarget && (
          <div className="mb-3 rounded-2xl border border-line p-3 text-sm dark:border-night-line">
            <div className="flex justify-between">
              <b>{reverseTarget.lines.map((l) => l.description).join(", ") || reverseTarget.type}</b>
              <span className="tnum font-bold">{money(reverseTarget.total, lang)}</span>
            </div>
            <p className="text-xs text-muted">{fmtDate(reverseTarget.occurred_at, lang)} {fmtTime(reverseTarget.occurred_at)}</p>
          </div>
        )}
        <Label htmlFor="b-reason">{t("sk_reason_label")} *</Label>
        <Input id="b-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("bh_reason_ph")} />
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setReverseTarget(null)}>
            {t("bh_cancel")}
          </Button>
          <Button variant="danger" className="flex-1" onClick={doReverse}>
            <Undo2 size={16} /> Reverse
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={restoreTarget !== null} onClose={() => setRestoreTarget(null)} title={t("bh_restore_title")}>
        <p className="mb-3 text-sm text-muted">{t("bh_restore_note")}</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setRestoreTarget(null)}>
            {t("bh_cancel")}
          </Button>
          <Button className="flex-1" onClick={doRestore}>
            <RotateCcw size={16} /> {t("bh_restore_btn")}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
