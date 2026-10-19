"use client";

import * as React from "react";
import { AlertTriangle, Check, Mic, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import type { Draft, Entry, ParsedItem } from "@/lib/types";
import { draftToCommitInput } from "@/lib/commit-core";
import { draftSummary, applyClarification, type ParseContext } from "@/lib/parser/rules";
import { assessCredit } from "@/lib/ledger/credit";
import { money } from "@/lib/format";
import { useApp } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Progress } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import { enqueue } from "@/lib/offline/queue";
import { useOnline } from "@/lib/hooks";
import { uuid } from "@/lib/id";

export function ReviewCard({
  draft,
  onDraftChange,
  onSaved,
  onAskAgain,
}: {
  draft: Draft;
  onDraftChange: (d: Draft) => void;
  onSaved: (r: { entry: Entry | null; queued: boolean }) => void;
  onAskAgain?: () => void;
}) {
  const { repo, shop, products, customers, balances, lang, setSync, refreshAll, t } = useApp();
  const toast = useToast();
  const online = useOnline();
  const [saving, setSaving] = React.useState(false);
  const [confirmBulk, setConfirmBulk] = React.useState(false);
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [overrideReason, setOverrideReason] = React.useState("");
  const [blockInfo, setBlockInfo] = React.useState<string | null>(null);
  const [editIndex, setEditIndex] = React.useState<number | null>(null);

  const customer = draft.customer?.id ? customers.find((c) => c.id === draft.customer!.id) ?? null : null;
  const balance = customer ? balances.get(customer.id) ?? 0 : 0;

  const totals = React.useMemo(() => {
    const sum = draft.items.reduce((s, it) => s + Math.max(0, (it.qty ?? 0) * (it.unit_price ?? 0) - (it.discount ?? 0)), 0);
    const total = sum > 0 ? sum : draft.total ?? 0;
    const paid =
      draft.intent === "sale_cash"
        ? total
        : Math.min(draft.paid_now ?? 0, total);
    return { total, paid, credit: total - paid };
  }, [draft]);

  const assessment = React.useMemo(() => {
    if (!shop) return null;
    if (!customer || totals.credit <= 0) return null;
    return assessCredit({
      balance,
      limit: customer.credit_limit,
      shopDefaultLimit: shop.settings.default_credit_limit,
      creditAmount: totals.credit,
    });
  }, [shop, customer, balances, totals.credit, balance]);

  const setupCtx: ParseContext = React.useMemo(
    () => ({
      shop_id: shop?.id ?? "",
      products,
      customers,
    }),
    [shop, products, customers]
  );

  const question = draft.missing.length > 0 && draft.confidence < 0.7 ? draft.questions[0] ?? null : null;

  const isBulk = draft.intent === "sale_cash" || draft.intent === "sale_credit" ? draft.items.length >= 8 || totals.total >= 5000 : false;

  const doCommit = React.useCallback(
    async (override?: string) => {
      if (!repo || saving) return;
      const built = draftToCommitInput(draft);
      if (!built.ok) {
        toast.push("warning", t("rev_missing"));
        return;
      }
      const input = { ...built.input, override_reason: override ?? null };
      setSaving(true);
      setBlockInfo(null);

      if (!online && repo.mode === "supabase") {
        await enqueue({ id: uuid(), idempotency_key: input.idempotency_key, kind: "commit", payload: input });
        setSync("queued");
        setSaving(false);
        toast.push("info", t("rev_offline_queue"));
        onSaved({ entry: null, queued: true });
        return;
      }

      setSync("saving");
      const res = await repo.commit(input);
      if (res.ok) {
        setSync("saved");
        setSaving(false);
        await refreshAll();
        onSaved({ entry: res.entry, queued: false });
        return;
      }
      if (res.reason === "credit_block") {
        setSync("saved");
        setSaving(false);
        setBlockInfo(res.message || "Udhaar limit block.");
        return;
      }
      setSync("saved");
      setSaving(false);
      if (res.reason === "duplicate") {
        toast.push("warning", t("rev_duplicate"));
        return;
      }
      toast.push("error", res.message || t("rev_save_fail"));
    },
    [repo, draft, saving, toast, online, setSync, refreshAll, onSaved]
  );

  const onSaveTap = () => {
    if (isBulk && !confirmBulk) {
      setConfirmBulk(true);
      return;
    }
    setConfirmBulk(false);
    void doCommit();
  };

  const updateItem = (index: number, patch: Partial<ParsedItem>) => {
    const items = draft.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    onDraftChange({ ...draft, items });
  };

  const removeItem = (index: number) => {
    onDraftChange({ ...draft, items: draft.items.filter((_, i) => i !== index) });
  };

  const answerQuestion = (value: string | number) => {
    if (!question) return;
    onDraftChange(applyClarification(draft, question.field, value, setupCtx));
  };

  const isPayment = draft.intent === "payment";
  const isRefund = draft.intent === "refund";
  const isStock = draft.intent === "stock_in";

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white/60 px-4 py-2.5 dark:bg-night-card/60 dark:border-night-line">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            {isPayment ? "💵" : isRefund ? "↩️" : isStock ? "📦" : "🧾"}
          </span>
          <b className="text-[15px]">
            {isPayment ? t("rev_payment") : isRefund ? t("rev_refund") : isStock ? t("rev_stock_in") : t("rev_new_sale")}
          </b>
        </div>
        <div className="flex items-center gap-1.5">
          {customer && <Badge tone="muted">{customer.name}</Badge>}
          <Badge tone="primary">{Math.round(draft.confidence * 100)}{t("rev_certain")}</Badge>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-[15px] font-medium leading-relaxed">{draftSummary(draft, lang)}</p>

        {question && (
          <div className="rounded-2xl border border-saffron/60 bg-saffron-soft p-3">
            <p className="mb-2 text-sm font-bold">❓ {question.text}</p>
            <div className="flex flex-wrap gap-2">
              {(question.options ?? []).map((op) => (
                <button
                  key={op.value}
                  onClick={() => answerQuestion(op.label)}
                  className="press min-h-[40px] rounded-full border border-ink/20 bg-white px-4 text-sm font-semibold dark:bg-night-card dark:border-white/20"
                >
                  {op.label}
                </button>
              ))}
              {(question.chips ?? []).map((c, i) => (
                <button
                  key={`${c}-${i}`}
                  onClick={() => answerQuestion(c)}
                  className="press min-h-[40px] rounded-full border border-ink/20 bg-white px-4 text-sm font-semibold dark:bg-night-card dark:border-white/20"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {draft.items.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-line dark:border-night-line">
            {draft.items.map((it, i) => (
              <div
                key={i}
                className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0 dark:border-night-line"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{it.name || t("rev_new_item")}</p>
                  <p className="text-xs text-muted">
                    {it.qty ?? "?"} × {it.unit_price != null ? money(it.unit_price) : "?"}
                    {it.discount ? ` − ${money(it.discount)}` : ""}
                    {it.matched === "none" && <span className="ml-1 text-amberw">• {t("rev_new_item")}</span>}
                  </p>
                </div>
                <span className="tnum text-sm font-bold">
                  {it.qty != null && it.unit_price != null ? money(Math.max(0, it.qty * it.unit_price - it.discount)) : "—"}
                </span>
                <button onClick={() => setEditIndex(i)} aria-label={t("rev_edit_aria")} className="rounded-lg p-2 text-muted hover:bg-black/5 dark:hover:bg-white/10">
                  <Pencil size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl bg-primary-soft px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-primary">
              {isPayment ? t("rev_collection") : isRefund ? t("rev_refund") : t("rev_total")}
            </span>
            <span className="tnum text-2xl font-black">{money(totals.total)}</span>
          </div>
          {!isPayment && !isStock && (
            <div className="mt-1 flex justify-between text-[13px] text-muted">
              <span>{t("rev_received")}: <b className="tnum">{money(totals.paid)}</b></span>
              {totals.credit > 0 && <span>{t("rev_remaining")}: <b className="tnum text-brick">{money(totals.credit)}</b></span>}
            </div>
          )}
        </div>

        {customer && assessment && (
          <div className={`rounded-2xl border p-3 ${assessment.status === "block" ? "border-brick/50 bg-brick-soft" : assessment.status === "warn" ? "border-amberw/50 bg-amberw-soft" : "border-line"}`}>
            <div className="mb-1.5 flex items-center justify-between text-[13px] font-semibold">
              <span>
                {customer.name} {t("balance")}: <b className="tnum">{money(balance)}</b>
                {(assessment.limit ?? 0) > 0 && <> / {money(assessment.limit)}</>}
              </span>
              <Badge tone={assessment.status === "block" ? "red" : assessment.status === "warn" ? "amber" : "green"}>
                {assessment.status === "block" ? t("rev_over") : assessment.status === "warn" ? t("rev_near") : t("rev_ok")}
              </Badge>
            </div>
            <Progress value={assessment.pct} />
            <p className="mt-1.5 text-[13px]">
              {t("rev_after")}: <b className="tnum">{money(assessment.projected)}</b>
              {(assessment.limit ?? 0) > 0 ? ` (${Math.round(assessment.pct)}% ${lang === "en" ? "of limit" : "limit ka"})` : ""} — {assessment.message}
            </p>
          </div>
        )}

        {blockInfo && (
          <div className="rounded-2xl border border-brick bg-brick-soft p-3" role="alert">
            <p className="flex items-center gap-2 text-sm font-bold text-brick">
              <ShieldAlert size={18} /> {blockInfo}
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setBlockInfo(null)}>
                {t("rev_cancel")}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setOverrideOpen(true)}>
                {t("rev_override")}
              </Button>
            </div>
          </div>
        )}

        {confirmBulk && (
          <div className="rounded-2xl border border-amberw bg-amberw-soft p-3">
            <p className="flex items-center gap-2 text-sm font-bold">
              <AlertTriangle size={18} /> {t("rev_bulk_q")} ({draft.items.length} items, {money(totals.total)})
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmBulk(false)}>
                {t("rev_wait")}
              </Button>
              <Button size="sm" onClick={onSaveTap}>
                {t("rev_save")}
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={onSaveTap} disabled={saving || !!blockInfo}>
            {saving ? t("rev_saving") : <><Check size={18} /> {t("rev_save")}</>}
          </Button>
          {onAskAgain && (
            <Button variant="secondary" size="icon" onClick={onAskAgain} aria-label={t("rev_ask_again")}>
              <Mic size={18} />
            </Button>
          )}
        </div>
      </div>

      <ItemEditSheet
        open={editIndex !== null}
        item={editIndex !== null ? draft.items[editIndex] : null}
        onClose={() => setEditIndex(null)}
        onSave={(patch) => {
          if (editIndex !== null) updateItem(editIndex, patch);
          setEditIndex(null);
        }}
        onDelete={() => {
          if (editIndex !== null) removeItem(editIndex);
          setEditIndex(null);
        }}
      />

      <BottomSheet open={overrideOpen} onClose={() => setOverrideOpen(false)} title={t("rev_override_title")}>
        <p className="mb-2 text-sm text-muted">
          {t("rev_override_note")}
        </p>
        <Label htmlFor="override-reason">{t("rev_reason")}</Label>
        <Input
          id="override-reason"
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
          placeholder={t("rev_reason_ph")}
        />
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setOverrideOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={overrideReason.trim().length < 3}
            onClick={() => {
              setOverrideOpen(false);
              void doCommit(overrideReason.trim());
              setOverrideReason("");
            }}
          >
            {t("rev_confirm_override")}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

function ItemEditSheet({
  open,
  item,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  item: ParsedItem | null;
  onClose: () => void;
  onSave: (patch: Partial<ParsedItem>) => void;
  onDelete: () => void;
}) {
  const { t } = useApp();
  const [qty, setQty] = React.useState<string>("1");
  const [price, setPrice] = React.useState<string>("");
  const [name, setName] = React.useState<string>("");

  React.useEffect(() => {
    if (item) {
      setQty(item.qty != null ? String(item.qty) : "");
      setPrice(item.unit_price != null ? String(item.unit_price) : "");
      setName(item.name);
    }
  }, [item, open]);

  if (!item) return null;
  const q = parseFloat(qty) || 0;
  const p = parseFloat(price) || 0;

  return (
    <BottomSheet open={open} onClose={onClose} title={t("rev_item_edit")}>
      <div className="space-y-3">
        <div>
          <Label htmlFor="item-name">{t("nc_name")}</Label>
          <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="item-qty">{t("rev_qty")}</Label>
            <div className="flex items-center gap-2">
              <button onClick={() => setQty(String(Math.max(1, q - 1)))} className="press h-12 w-12 rounded-2xl border border-line text-xl font-bold dark:border-night-line" aria-label={t("rev_dec_aria")}>
                −
              </button>
              <Input id="item-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="text-center" />
              <button onClick={() => setQty(String(q + 1))} className="press h-12 w-12 rounded-2xl border border-line text-xl font-bold dark:border-night-line" aria-label={t("rev_inc_aria")}>
                +
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="item-price">{t("rev_price_each")}</Label>
            <Input id="item-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Rs" />
          </div>
        </div>
        <div className="flex justify-between rounded-2xl bg-primary-soft px-4 py-3 text-sm font-semibold">
          <span>{t("rev_line_total")}</span>
          <span className="tnum">{money(Math.max(0, q * p - item.discount))}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="text-brick" onClick={onDelete} aria-label={t("rev_del_aria")}>
            <Trash2 size={18} /> {t("rev_remove")}
          </Button>
          <Button className="flex-1" onClick={() => onSave({ name: name.trim() || item.name, qty: q || null, unit_price: p || null })}>
            {t("rev_done")}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
