"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/components/providers";
import { useAsync } from "@/lib/hooks";
import { money, fmtDate, relTime } from "@/lib/format";
import { Avatar, Chip, EmptyState, Skeleton } from "@/components/ui/bits";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { Input, Label } from "@/components/ui/input";
import { Progress } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, FileText, Link2, MessageCircle, Phone, Printer, Undo2, Wallet } from "lucide-react";
import { customerStatusBadge, isOverdue } from "@/lib/ledger/credit";
import { saleStatus } from "@/lib/ledger/balance";
import { buildStatement, statementWhatsAppText } from "@/lib/statements";
import { paymentLine } from "@/lib/pay";
import { buildPublicShareUrl, useCopyToClipboard, whatsappLink } from "@/lib/share";
import { custBadgeLabel, fill, saleStatusLabel } from "@/lib/i18n";
import type { Entry } from "@/lib/types";
import { uuid } from "@/lib/id";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { repo, shop, lang, refreshAll, refreshAlerts, t } = useApp();
  const toast = useToast();
  const [copied, copy] = useCopyToClipboard();

  const [payOpen, setPayOpen] = React.useState(false);
  const [stmtOpen, setStmtOpen] = React.useState(false);
  const [reverseTarget, setReverseTarget] = React.useState<Entry | null>(null);
  const [reverseReason, setReverseReason] = React.useState("");

  const customerQ = useAsync(() => (repo ? repo.getCustomer(params.id) : Promise.resolve(null)), [repo, params.id]);
  const entriesQ = useAsync(() => (repo ? repo.listEntries({ customer_id: params.id }) : Promise.resolve([])), [repo, params.id]);
  const payQ = useAsync(() => (repo ? repo.listPayments(params.id) : Promise.resolve([])), [repo, params.id]);
  const balQ = useAsync(() => (repo ? repo.customerBalance(params.id) : Promise.resolve(0)), [repo, params.id]);
  const allocQ = useAsync(() => (repo ? repo.listAllocations() : Promise.resolve([])), [repo]);

  const customer = customerQ.data;
  const entries = entriesQ.data ?? [];
  const payments = payQ.data ?? [];
  const allocations = allocQ.data ?? [];
  const balance = balQ.data ?? 0;

  const timeline = React.useMemo(() => {
    const rows: { id: string; at: string; kind: "sale" | "payment" | "refund" | "stock" | "adjustment"; title: string; detail: string; amount: number; status?: string; entry?: Entry }[] = [];
    for (const e of entries) {
      if (e.type === "stock_in") continue;
      rows.push({
        id: e.id,
        at: e.occurred_at,
        kind: e.type === "sale" ? "sale" : e.type === "refund" ? "refund" : "adjustment",
        title: e.lines.map((l) => l.description).join(", ") || (e.type === "payment" ? t("bh_t_payment") : e.type),
        detail: e.lines.map((l) => `${l.qty} × ${money(l.unit_price, lang)}`).join(", "),
        amount: e.type === "refund" ? -e.total : e.type === "sale" ? e.total : 0,
        status: e.type === "sale" ? saleStatus(e, allocations, payments.filter((p) => !p.entry_id)) : undefined,
        entry: e,
      });
    }
    for (const p of payments) {
      rows.push({
        id: p.id,
        at: p.date,
        kind: "payment",
        title: t("cd_payment_btn"),
        detail: p.method,
        amount: -p.amount,
      });
    }
    rows.sort((a, b) => b.at.localeCompare(a.at));
    return rows;
  }, [entries, payments, allocations, lang]);

  const doPayment = async (amount: number, method: string) => {
    if (!repo || !customer) return;
    const res = await repo.commit({
      idempotency_key: uuid(),
      type: "payment",
      customer_id: customer.id,
      occurred_at: new Date().toISOString(),
      total: amount,
      paid_now: amount,
      method: method as "cash",
      source: "manual",
      note: null,
      lines: [],
    });
    if (res.ok) {
      toast.push("success", fill(t("cd_wasool_toast"), { amt: money(amount, lang) }));
      setPayOpen(false);
      await refreshAll();
      await refreshAlerts();
      balQ.reload();
      entriesQ.reload();
      payQ.reload();
    } else {
      toast.push("error", res.message);
    }
  };

  const doReverse = async () => {
    if (!repo || !reverseTarget) return;
    if (reverseReason.trim().length < 3) {
      toast.push("warning", t("bh_reason_warn"));
      return;
    }
    const res = await repo.reverse(reverseTarget.id, reverseReason.trim());
    if (res.ok) {
      toast.push("success", t("cd_reverse_toast"));
      setReverseTarget(null);
      setReverseReason("");
      await refreshAll();
      balQ.reload();
      entriesQ.reload();
      payQ.reload();
    } else {
      toast.push("error", res.message);
    }
  };

  const statement = React.useMemo(() => {
    if (!customer) return null;
    const from = new Date(Date.now() - 30 * 86400000).toISOString();
    const to = new Date().toISOString();
    return buildStatement({ customer, entries, payments, allocations, from, to, initialBalance: 0 });
  }, [customer, entries, payments, allocations]);

  if (customerQ.loading) {
    return <div className="space-y-3"><Skeleton className="h-28 rounded-3xl" /><Skeleton className="h-40 rounded-3xl" /></div>;
  }
  if (!customer) {
    return <EmptyState icon={<FileText size={28} />} line={t("cd_not_found")} actionLabel={t("cd_khata_back")} onAction={() => router.push("/khata")} />;
  }

  const limit = customer.credit_limit ?? shop?.settings.default_credit_limit ?? 0;
  const pct = limit > 0 ? Math.min(100, (Math.max(0, balance) / limit) * 100) : balance > 0 ? 100 : 0;
  const badge = customerStatusBadge(balance, customer.credit_limit, shop?.settings.default_credit_limit ?? 0);
  const overdue = isOverdue({
    oldestUnpaidAt: entries.filter((e) => e.type === "sale" && e.status === "active" && e.credit_amount > 0).map((e) => e.occurred_at).sort()[0] ?? null,
    paymentTermsDays: customer.payment_terms_days,
    shopOverdueDays: shop?.settings.overdue_days ?? 30,
  }) && balance > 0.5;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 no-print">
        <button onClick={() => router.push("/khata")} className="rounded-xl p-2 text-muted hover:bg-black/5 dark:hover:bg-white/10" aria-label={t("cd_back")}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-black">{customer.name}</h1>
        {overdue && <Badge tone="red">{t("ow_overdue")}</Badge>}
        <Badge tone={statusTone(badge)}>{custBadgeLabel(badge, lang)}</Badge>
      </div>

      <div className="card space-y-3 p-4 no-print">
        <div className="flex items-center gap-3">
          <Avatar name={customer.name} className="h-14 w-14 text-lg" />
          <div className="min-w-0 flex-1">
            <p className="tnum text-2xl font-black text-brick">{money(balance, lang)}</p>
            <p className="text-xs text-muted">{t("cd_baqi")} {limit > 0 && <>• {t("kh_limit_word")} {money(limit, lang)}</>}</p>
          </div>
          <div className="flex gap-1.5">
            {customer.phone && (
              <>
                <a href={`tel:${customer.phone}`} className="press flex h-11 w-11 items-center justify-center rounded-2xl border border-line dark:border-night-line" aria-label="Call">
                  <Phone size={18} />
                </a>
                <a
                  href={whatsappLink(customer.phone, fill(t("cd_wa_msg"), { name: customer.name, shop: shop?.name ?? "Munshi", amt: money(balance, lang) }))}
                  target="_blank"
                  rel="noreferrer"
                  className="press flex h-11 w-11 items-center justify-center rounded-2xl border border-line text-primary dark:border-night-line"
                  aria-label="WhatsApp"
                >
                  <MessageCircle size={18} />
                </a>
              </>
            )}
          </div>
        </div>
        {limit > 0 && <Progress value={pct} />}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setPayOpen(true)}>
            <Wallet size={18} /> {t("cd_payment_btn")}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setStmtOpen(true)}>
            <FileText size={18} /> Statement
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-muted">{t("cd_timeline")}</h2>
        {timeline.length === 0 ? (
          <EmptyState icon={<FileText size={24} />} line={t("cd_timeline_empty")} />
        ) : (
          timeline.map((row) => (
            <div key={row.id} className="card flex items-center gap-3 p-3">
              <span className="text-lg" aria-hidden>
                {row.kind === "payment" ? "💵" : row.kind === "sale" ? "🧾" : row.kind === "refund" ? "↩️" : "⚙️"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">{row.title}</p>
                <p className="truncate text-xs text-muted">
                  {fmtDate(row.at, lang)} • {relTime(row.at, lang)}
                  {row.detail ? ` • ${row.detail}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className={`tnum text-[14px] font-black ${row.amount > 0 ? "text-brick" : row.amount < 0 ? "text-primary" : ""}`}>
                  {row.amount > 0 ? `+${money(row.amount, lang)}` : row.amount < 0 ? money(-row.amount, lang) : "—"}
                </p>
                {row.status && <Badge tone={statusTone(row.status)} className="mt-0.5">{saleStatusLabel(row.status, lang)}</Badge>}
              </div>
              {row.entry && row.entry.status === "active" && (
                <button
                  onClick={() => setReverseTarget(row.entry!)}
                  className="rounded-xl p-2 text-muted hover:bg-black/5 hover:text-brick dark:hover:bg-white/10"
                  aria-label={t("bh_reverse_title")}
                >
                  <Undo2 size={16} />
                </button>
              )}
              {row.entry && row.entry.status === "reversed" && <Badge tone="muted">Reversed</Badge>}
            </div>
          ))
        )}
      </div>

      <BottomSheet open={payOpen} onClose={() => setPayOpen(false)} title={fill(t("cd_pay_title"), { name: customer.name })}>
        <PaymentForm balance={balance} onSave={doPayment} />
      </BottomSheet>

      <BottomSheet open={stmtOpen} onClose={() => setStmtOpen(false)} title="Statement" className="max-w-2xl">
        {statement && (
          <div className="space-y-3">
            <div className="flex gap-2 no-print">
              <a
                href={whatsappLink(customer.phone, statementWhatsAppText(statement, shop?.name ?? "Munshi", paymentLine(shop?.settings.payment_info ?? null, shop?.name)))}
                target="_blank"
                rel="noreferrer"
                className="press flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-white"
              >
                <MessageCircle size={16} /> WhatsApp
              </a>
              <button
                onClick={async () => {
                  if (!repo) return;
                  try {
                    const { link, token } = await repo.createShareLink({
                      customer_id: customer.id,
                      from_date: statement.from,
                      to_date: statement.to,
                      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
                    });
                    const url = buildPublicShareUrl(token);
                    await copy(url);
                    toast.push("success", fill(t("cd_link_created"), { date: fmtDate(link.expires_at, lang) }));
                  } catch (e) {
                    toast.push("error", e instanceof Error ? e.message : t("cd_link_fail"));
                  }
                }}
                className="press flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-line text-sm font-bold dark:border-night-line"
              >
                <Link2 size={16} /> {copied ? t("cd_copied") : t("cd_link_btn")}
              </button>
              <button
                onClick={() => window.print()}
                className="press flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-line text-sm font-bold dark:border-night-line"
              >
                <Printer size={16} /> Print / PDF
              </button>
            </div>
            <div className="print-area rounded-2xl border border-line p-4 dark:border-night-line">
              <div className="mb-3 text-center">
                <p className="text-lg font-black">{shop?.name}</p>
                <p className="text-sm text-muted">
                  {fill(t("cd_stmt_sub"), { name: customer.name, from: fmtDate(statement.from, lang), to: fmtDate(statement.to, lang) })}
                </p>
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-muted dark:border-night-line">
                    <th className="py-1.5">{t("cd_th_date")}</th>
                    <th className="py-1.5">{t("cd_th_detail")}</th>
                    <th className="py-1.5 text-right">{t("cd_th_debit")}</th>
                    <th className="py-1.5 text-right">{t("cd_th_credit")}</th>
                    <th className="py-1.5 text-right">{t("cd_th_balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.map((l, i) => (
                    <tr key={i} className="border-b border-line/60 dark:border-night-line/60">
                      <td className="py-1.5">{fmtDate(l.date, lang)}</td>
                      <td className="py-1.5">{l.description}</td>
                      <td className="tnum py-1.5 text-right">{l.debit > 0 ? money(l.debit, lang) : "—"}</td>
                      <td className="tnum py-1.5 text-right">{l.credit > 0 ? money(l.credit, lang) : "—"}</td>
                      <td className="tnum py-1.5 text-right font-bold">{money(l.balance, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-xl bg-cream p-2 dark:bg-night-card">
                  <p className="text-xs text-muted">{t("cd_purchases")}</p>
                  <p className="tnum font-bold">{money(statement.total_purchases, lang)}</p>
                </div>
                <div className="rounded-xl bg-cream p-2 dark:bg-night-card">
                  <p className="text-xs text-muted">{t("cd_paid")}</p>
                  <p className="tnum font-bold">{money(statement.total_paid, lang)}</p>
                </div>
                <div className="rounded-xl bg-brick/10 p-2">
                  <p className="text-xs text-muted">{t("cd_baqi_word")}</p>
                  <p className="tnum font-bold text-brick">{money(statement.closing_balance, lang)}</p>
                </div>
              </div>
              <p className="mt-3 text-center text-[11px] text-muted">
                {fill(t("cd_stmt_footer"), { shop: shop?.name ?? "Munshi" })}
              </p>
            </div>
          </div>
        )}
      </BottomSheet>

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
            <p className="text-xs text-muted">{fmtDate(reverseTarget.occurred_at, lang)}</p>
          </div>
        )}
        <Label htmlFor="rev-reason">{t("sk_reason_label")}</Label>
        <Input id="rev-reason" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder={t("cd_reason_ph")} />
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setReverseTarget(null)}>
            {t("bh_cancel")}
          </Button>
          <Button variant="danger" className="flex-1" onClick={doReverse}>
            Reverse
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

function PaymentForm({ balance, onSave }: { balance: number; onSave: (amount: number, method: string) => Promise<void> }) {
  const { t } = useApp();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("cash");
  const [busy, setBusy] = React.useState(false);
  const a = parseFloat(amount) || 0;

  const methods = [
    { v: "cash", label: "Cash" },
    { v: "easypaisa", label: "EasyPaisa" },
    { v: "jazzcash", label: "JazzCash" },
    { v: "bank", label: "Bank" },
  ];

  return (
    <div className="space-y-3">
      {balance > 0 && (
        <div className="flex items-center gap-2">
          <Chip active={a === balance} onClick={() => setAmount(String(balance))}>
            {fill(t("cd_poora"), { amt: money(balance) })}
          </Chip>
          <Chip onClick={() => setAmount(String(Math.round(balance / 2)))}>{t("cd_aadha")}</Chip>
        </div>
      )}
      <div>
        <Label htmlFor="pay-amount">{t("cd_amount_label")}</Label>
        <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="text-xl font-bold" />
      </div>
      <div className="flex flex-wrap gap-2">
        {methods.map((m) => (
          <Chip key={m.v} active={method === m.v} onClick={() => setMethod(m.v)}>
            {m.label}
          </Chip>
        ))}
      </div>
      <Button
        className="w-full"
        disabled={busy || a <= 0}
        onClick={async () => {
          setBusy(true);
          await onSave(a, method);
          setBusy(false);
        }}
      >
        {busy ? t("sk_saving") : fill(t("cd_wasool_btn"), { amt: money(a) })}
      </Button>
    </div>
  );
}
