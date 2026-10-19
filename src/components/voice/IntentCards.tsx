"use client";

import * as React from "react";
import type { Customer, Draft, Entry } from "@/lib/types";
import { useApp } from "@/components/providers";
import { fill } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { CheckCircle2, PackagePlus, Undo2, UserPlus, Wallet } from "lucide-react";

export function WantedCard({ draft, onDone }: { draft: Draft; onDone: (text: string) => void }) {
  const { repo, refreshAlerts, t, lang } = useApp();
  const toast = useToast();
  const [qty, setQty] = React.useState(String(draft.wanted?.qty ?? 1));
  const [reason, setReason] = React.useState(draft.wanted?.reason ?? "out_of_stock");
  const [permission, setPermission] = React.useState(draft.wanted?.contact_permission ?? false);
  const [busy, setBusy] = React.useState(false);

  const itemText = draft.items[0]?.name || draft.transcript;

  const save = async () => {
    if (!repo) return;
    setBusy(true);
    try {
      await repo.addWanted({
        item_text: itemText,
        product_id: draft.items[0]?.product_id ?? null,
        variant_note: null,
        qty: parseFloat(qty) || 1,
        customer_id: draft.customer?.id ?? null,
        contact_permission: permission,
        reason: reason as "out_of_stock" | "price" | "variant" | "deferred" | "other",
        expected_price: draft.items[0]?.unit_price ?? null,
        status: "new",
        linked_entry_id: null,
        notes: null,
      });
      await refreshAlerts();
      toast.push("success", t("wanted_saved"));
      onDone(
        lang === "en"
          ? `📝 “${itemText}” added to the restock list (${qty} ${draft.items[0]?.unit || ""}).`.trim()
          : `📝 “${itemText}” mangwane ki list mein daal diya (${qty} ${draft.items[0]?.unit || ""}).`.trim()
      );
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("rev_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  const reasons: { value: string; label: string }[] = [
    { value: "out_of_stock", label: t("wanted_r_stock") },
    { value: "price", label: t("wanted_r_price") },
    { value: "variant", label: t("wanted_r_variant") },
    { value: "deferred", label: t("wanted_r_deferred") },
    { value: "other", label: t("wanted_r_other") },
  ];

  return (
    <div className="card space-y-3 p-4">
      <p className="flex items-center gap-2 text-[15px] font-bold">
        <PackagePlus size={18} className="text-saffron" /> {t("wanted_title")}
      </p>
      <div className="rounded-2xl bg-saffron-soft px-3 py-2 text-[14px] font-semibold">{itemText}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="w-qty">{t("rev_qty")}</Label>
          <Input id="w-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <Label>{t("wanted_reason")}</Label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as never)}
            className="h-12 w-full rounded-2xl border border-line bg-white px-3 text-[15px] dark:bg-night-card dark:border-night-line"
          >
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {draft.customer?.id && (
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} className="h-5 w-5 accent-[#0B6B4F]" />
          {fill(t("wanted_notify"), { name: draft.customer.text })}
        </label>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={save} disabled={busy}>
          {busy ? t("sk_saving") : t("wanted_save")}
        </Button>
      </div>
      <p className="text-xs text-muted">
        {lang === "en"
          ? `Reason: ${reasons.find((r) => r.value === reason)?.label ?? reason} — this feeds the “missed demand” report.`
          : `Wajah: ${reasons.find((r) => r.value === reason)?.label ?? reason} — ye data reports mein “kitna maal mangta reh gaya” ginega.`}
      </p>
    </div>
  );
}

export function AddCustomerCard({ draft, onDone }: { draft: Draft; onDone: (text: string, customer?: Customer) => void }) {
  const { repo, refreshAll, t, lang } = useApp();
  const toast = useToast();
  const [name, setName] = React.useState(draft.customer?.text ?? "");
  const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    if (!repo || name.trim().length < 2) {
      toast.push("warning", t("nc_err_name"));
      return;
    }
    setBusy(true);
    try {
      const c = await repo.upsertCustomer({ name: name.trim(), phone: phone.trim() || null, notes: null, credit_limit: null, payment_terms_days: null });
      await refreshAll();
      toast.push("success", fill(t("nc_added_toast"), { name: c.name }));
      onDone(`👤 ${fill(t("nc_created_msg"), { name: c.name })}`, c);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("rev_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-3 p-4">
      <p className="flex items-center gap-2 text-[15px] font-bold">
        <UserPlus size={18} className="text-primary" /> {t("nc_title")}
      </p>
      <div>
        <Label htmlFor="nc-name">{t("nc_name")}</Label>
        <Input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="nc-phone">{t("nc_phone")}</Label>
        <Input id="nc-phone" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))} inputMode="tel" placeholder={t("nc_phone_ph")} />
      </div>
      <Button className="w-full" onClick={save} disabled={busy}>
        {busy ? t("sk_saving") : t("nc_save")}
      </Button>
    </div>
  );
}

export function CreditLimitCard({ draft, onDone }: { draft: Draft; onDone: (text: string) => void }) {
  const { repo, customers, refreshAll, t, lang } = useApp();
  const toast = useToast();
  const customer = draft.customer?.id ? customers.find((c) => c.id === draft.customer!.id) : null;
  const [limit, setLimit] = React.useState(String(draft.credit_limit_new ?? customer?.credit_limit ?? ""));
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (!customer) return null;

  const save = async () => {
    if (!repo) return;
    const val = parseFloat(limit);
    if (!isFinite(val) || val < 0) {
      toast.push("warning", t("cl_err_limit"));
      return;
    }
    setBusy(true);
    try {
      await repo.setCreditLimit(customer.id, val, reason || "voice command");
      await refreshAll();
      toast.push("success", fill(t("cl_set_msg"), { name: customer.name, limit: String(val) }));
      onDone(lang === "en" ? `🔒 ${customer.name}'s new credit limit: ${money(val)}.` : `🔒 ${customer.name} ki nayi udhaar limit: ${money(val)}.`);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("rev_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-3 p-4">
      <p className="flex items-center gap-2 text-[15px] font-bold">
        <Wallet size={18} className="text-primary" /> {fill(t("cl_title"), { name: customer.name })}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cl-limit">{t("cl_new")}</Label>
          <Input id="cl-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cl-reason">{t("cl_reason")}</Label>
          <Input id="cl-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={lang === "en" ? "e.g. old customer" : "Misal: purana customer"} />
        </div>
      </div>
      <Button className="w-full" onClick={save} disabled={busy}>
        {busy ? t("sk_saving") : t("cl_save")}
      </Button>
    </div>
  );
}

export function EntryOpCard({
  draft,
  entry,
  onDone,
}: {
  draft: Draft;
  entry: Entry | null;
  onDone: (text: string) => void;
}) {
  const { repo, refreshAll, refreshAlerts, t, lang } = useApp();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const isDelete = draft.intent === "delete_entry" || draft.intent === "undo";

  if (!entry) {
    return (
      <div className="card p-4 text-[14px]">
        <p className="mb-1 font-bold">{t("op_which")}</p>
        <p className="text-muted">{t("op_none")}</p>
      </div>
    );
  }

  const doIt = async () => {
    if (!repo) return;
    setBusy(true);
    try {
      const res = await repo.reverse(entry.id, isDelete ? "voice delete" : "voice correction");
      await refreshAll();
      await refreshAlerts();
      if (res.ok) {
        toast.push("success", t("op_reversed"));
        onDone(fill(t("op_reversed_detail"), { desc: entry.lines[0]?.description ?? t("common_entry"), amt: money(entry.total) }));
      } else {
        toast.push("error", res.message);
      }
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("rev_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-3 p-4">
      <p className="text-[15px] font-bold">{isDelete ? t("op_delete_q") : t("op_edit_q")}</p>
      <div className="rounded-2xl border border-line p-3 text-[14px] dark:border-night-line">
        <div className="flex justify-between">
          <b>{entry.lines[0]?.description ?? (entry.type === "payment" ? t("rev_payment") : t("common_entry"))}</b>
          <span className="tnum font-bold">{money(entry.total)}</span>
        </div>
        <p className="text-xs text-muted">{new Date(entry.occurred_at).toLocaleString("en-PK")}</p>
      </div>
      {isDelete ? (
        <Button variant="danger" className="w-full" onClick={doIt} disabled={busy}>
          <Undo2 size={18} /> {busy ? "…" : t("op_reverse")}
        </Button>
      ) : (
        <p className="text-[13px] text-muted">
          {t("op_correct_help")}
        </p>
      )}
    </div>
  );
}

export function SavedBubble({ entry, onUndo }: { entry: Entry; onUndo: () => void }) {
  const { t } = useApp();
  const amt = money(entry.total);
  const label =
    entry.type === "payment"
      ? fill(t("saved_payment"), { amt })
      : entry.type === "refund"
        ? fill(t("saved_refund"), { amt })
        : entry.type === "stock_in"
          ? t("saved_stock")
          : fill(t("saved_sale"), { amt });
  return (
    <div className="card flex items-center gap-3 border-primary/30 bg-primary-soft p-3">
      <CheckCircle2 size={20} className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold">{label}</p>
        <p className="truncate text-xs text-muted">
          {entry.lines.map((l) => `${l.description} ×${l.qty}`).join(", ") || (entry.note ?? "")}
        </p>
      </div>
      <button onClick={onUndo} className="press rounded-xl bg-white px-3 py-2 text-[13px] font-bold text-brick dark:bg-night-card">
        Undo
      </button>
    </div>
  );
}
