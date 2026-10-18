"use client";

import * as React from "react";
import Link from "next/link";
import { useApp } from "@/components/providers";
import { useAsync, useDebounced } from "@/lib/hooks";
import { money, relTime } from "@/lib/format";
import { Avatar, Chip, EmptyState, Skeleton } from "@/components/ui/bits";
import { Badge, statusTone } from "@/components/ui/badge";
import { customerStatusBadge } from "@/lib/ledger/credit";
import { custBadgeLabel } from "@/lib/i18n";
import { customerStats } from "@/lib/intel/customers";
import { Search, UserPlus, NotebookText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type Filter = "all" | "udhaar" | "over" | "overdue" | "clear";

export default function KhataPage() {
  const { repo, customers, shop, lang, refreshAll, t } = useApp();
  const toast = useToast();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [q, setQ] = React.useState("");
  const dq = useDebounced(q, 200);
  const [addOpen, setAddOpen] = React.useState(false);

  const entriesQ = useAsync(() => (repo ? repo.listEntries() : Promise.resolve([])), [repo]);
  const payQ = useAsync(() => (repo ? repo.listPayments() : Promise.resolve([])), [repo]);
  const balQ = useAsync(() => (repo ? repo.balanceMap() : Promise.resolve(new Map<string, number>())), [repo]);

  const balances = balQ.data ?? new Map<string, number>();
  const stats = React.useMemo(() => {
    if (!shop) return [];
    const from = new Date(Date.now() - 90 * 86400000).toISOString();
    const to = new Date(Date.now() + 86400000).toISOString();
    return customerStats(customers, entriesQ.data ?? [], payQ.data ?? [], balances, {
      from,
      to,
      shopOverdueDays: shop.settings.overdue_days,
    });
  }, [customers, entriesQ.data, payQ.data, balances, shop]);

  const list = React.useMemo(() => {
    let out = [...stats];
    if (dq.trim()) {
      const needle = dq.trim().toLowerCase();
      out = out.filter((s) => s.customer.name.toLowerCase().includes(needle) || (s.customer.phone ?? "").includes(needle));
    }
    if (filter === "udhaar") out = out.filter((s) => s.balance > 0.5);
    if (filter === "clear") out = out.filter((s) => s.balance <= 0.5);
    if (filter === "over") {
      out = out.filter((s) => {
        const limit = s.customer.credit_limit ?? shop?.settings.default_credit_limit ?? 0;
        return limit > 0 && s.balance >= limit;
      });
    }
    if (filter === "overdue") out = out.filter((s) => s.overdue && s.balance > 0.5);
    out.sort((a, b) => b.balance - a.balance || a.customer.name.localeCompare(b.customer.name));
    return out;
  }, [stats, dq, filter, shop]);

  const totalUdhaar = React.useMemo(() => stats.reduce((s, x) => s + Math.max(0, x.balance), 0), [stats]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">{t("khata")}</h1>
          <p className="text-sm text-muted">
            {t("kh_total_credit")} <b className="tnum text-brick">{money(totalUdhaar, lang)}</b> • {stats.filter((s) => s.balance > 0.5).length} {t("kh_customers_word")}
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus size={16} /> {t("kh_new")}
        </Button>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("kh_search_ph")} className="pl-10" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>{t("f_all")}</Chip>
        <Chip active={filter === "udhaar"} onClick={() => setFilter("udhaar")}>{t("kh_f_udhaar")}</Chip>
        <Chip active={filter === "over"} onClick={() => setFilter("over")}>{t("kh_f_over")}</Chip>
        <Chip active={filter === "overdue"} onClick={() => setFilter("overdue")}>{t("kh_f_overdue")}</Chip>
        <Chip active={filter === "clear"} onClick={() => setFilter("clear")}>{t("kh_f_clear")}</Chip>
      </div>

      {balQ.loading || entriesQ.loading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState icon={<NotebookText size={28} />} line={t("kh_empty")} />
      ) : (
        <div className="space-y-2">
          {list.map((s) => {
            const limit = s.customer.credit_limit ?? shop?.settings.default_credit_limit ?? 0;
            const badge = customerStatusBadge(s.balance, s.customer.credit_limit, shop?.settings.default_credit_limit ?? 0);
            return (
              <Link
                key={s.customer.id}
                href={`/khata/${s.customer.id}`}
                className="card press flex items-center gap-3 p-3"
              >
                <Avatar name={s.customer.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold">{s.customer.name}</p>
                  <p className="text-xs text-muted">
                    {s.last_visit ? `${t("kh_last")} ${relTime(s.last_visit, lang)}` : t("kh_new_cust")}
                    {limit > 0 && <> • {t("kh_limit_word")} {money(limit, lang)}</>}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`tnum text-[15px] font-black ${s.balance > 0.5 ? "text-brick" : "text-primary"}`}>
                    {s.balance > 0.5 ? money(s.balance, lang) : s.balance < -0.5 ? `+${money(-s.balance, lang)}` : "0"}
                  </p>
                  <div className="mt-0.5 flex items-center justify-end gap-1">
                    {s.overdue && s.balance > 0.5 && <Badge tone="red">{t("ow_overdue")}</Badge>}
                    <Badge tone={statusTone(badge)}>{custBadgeLabel(badge, lang)}</Badge>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title={t("nc_title")}>
        <AddCustomerInline
          onDone={async () => {
            setAddOpen(false);
            await refreshAll();
            entriesQ.reload();
          }}
          onError={(m) => toast.push("error", m)}
        />
      </BottomSheet>
    </div>
  );
}

function AddCustomerInline({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const { repo, t } = useApp();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [limit, setLimit] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    if (!repo || name.trim().length < 2) {
      onError(t("kh_err_name"));
      return;
    }
    setBusy(true);
    try {
      const lim = limit.trim() ? parseFloat(limit) : null;
      await repo.upsertCustomer({
        name: name.trim(),
        phone: phone.trim() || null,
        notes: null,
        credit_limit: lim !== null && isFinite(lim) ? lim : null,
        payment_terms_days: null,
      });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : t("kh_save_fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="kc-name">{t("nc_name")} *</Label>
        <Input id="kc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Misal: Sana Bibi" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="kc-phone">{t("st_mobile")}</Label>
          <Input id="kc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="03xx…" />
        </div>
        <div>
          <Label htmlFor="kc-limit">{t("kh_limit_label")}</Label>
          <Input id="kc-limit" value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" placeholder={t("kh_limit_ph")} />
        </div>
      </div>
      <Button className="w-full" onClick={save} disabled={busy}>
        {busy ? t("sk_saving") : t("kh_open_khata_btn")}
      </Button>
    </div>
  );
}
