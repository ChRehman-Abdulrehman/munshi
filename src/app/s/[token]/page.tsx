"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { getRepo } from "@/lib/repo";
import { useAsync } from "@/lib/hooks";
import { money, fmtDate } from "@/lib/format";
import { Skeleton, EmptyState } from "@/components/ui/bits";
import { Printer, ShieldCheck, FileText } from "lucide-react";
import type { StatementBundle } from "@/lib/repo/types";
import { buildStatement } from "@/lib/statements";
import { fill, getStoredLang, localizeStatementDesc, saleStatusLabel, t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

export default function PublicStatementPage() {
  const params = useParams<{ token: string }>();
  const [lang, setLang] = React.useState<Lang>("roman");
  React.useEffect(() => setLang(getStoredLang()), []);

  const q = useAsync<StatementBundle | null>(async () => {
    const repo = await getRepo();
    return repo.getShareByToken(params.token);
  }, [params.token]);

  const stmt = React.useMemo(() => {
    if (!q.data) return null;
    const { link, customer, entries, payments, allocations } = q.data;
    return buildStatement({ customer, entries, payments, allocations, from: link.from_date, to: link.to_date, initialBalance: 0 });
  }, [q.data]);

  if (q.loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-5">
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (!q.data || !stmt) {
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState
          icon={<FileText size={28} />}
          line={t("ps_not_found", lang)}
        />
      </div>
    );
  }

  const expired = new Date(q.data.link.expires_at).getTime() < Date.now();

  return (
    <div className="min-h-dvh bg-cream dark:bg-night-bg">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-base font-black text-white">م</span>
            <div>
              <p className="text-[15px] font-black">{t("ps_brand_title", lang)}</p>
              <p className="text-[11px] text-muted">{t("ps_readonly", lang)}</p>
            </div>
          </div>
          <button onClick={() => window.print()} className="press flex min-h-[44px] items-center gap-2 rounded-2xl border border-line bg-white px-4 text-sm font-bold dark:bg-night-card dark:border-night-line">
            <Printer size={16} /> {t("ps_print_btn", lang)}
          </button>
        </div>

        {expired && (
          <div className="mb-3 rounded-2xl border border-amberw bg-amberw-soft p-3 text-sm font-semibold no-print">
            {t("ps_expired", lang)}
          </div>
        )}

        <div className="print-area rounded-3xl border border-line bg-white p-5 dark:bg-night-card dark:border-night-line">
          <div className="mb-4 border-b border-line pb-3 text-center dark:border-night-line">
            <p className="text-xl font-black">{t("app_name", lang)}</p>
            <p className="text-sm text-muted">
              {fill(t("cd_stmt_sub", lang), { name: stmt.customer.name, from: fmtDate(stmt.from, lang), to: fmtDate(stmt.to, lang) })}
            </p>
            <p className="text-[11px] text-muted">{fill(t("ps_valid_till", lang), { date: fmtDate(q.data.link.expires_at, lang) })}</p>
          </div>

          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-muted dark:border-night-line">
                <th className="py-2">{t("cd_th_date", lang)}</th>
                <th className="py-2">{t("cd_th_detail", lang)}</th>
                <th className="py-2 text-right">{t("cd_th_debit", lang)}</th>
                <th className="py-2 text-right">{t("cd_th_credit", lang)}</th>
                <th className="py-2 text-right">{t("cd_th_balance", lang)}</th>
              </tr>
            </thead>
            <tbody>
              {stmt.lines.map((l, i) => (
                <tr key={i} className="border-b border-line/60 dark:border-night-line/60">
                  <td className="py-2">{fmtDate(l.date, lang)}</td>
                  <td className="py-2">
                    {localizeStatementDesc(l.description, lang)}
                    {l.sale_status && <span className="ml-1 text-[11px] text-muted">({saleStatusLabel(l.sale_status, lang)})</span>}
                  </td>
                  <td className="tnum py-2 text-right">{l.debit > 0 ? money(l.debit, lang) : "—"}</td>
                  <td className="tnum py-2 text-right">{l.credit > 0 ? money(l.credit, lang) : "—"}</td>
                  <td className="tnum py-2 text-right font-bold">{money(l.balance, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-cream p-3 dark:bg-night-bg">
              <p className="text-[11px] text-muted">{t("cd_purchases", lang)}</p>
              <p className="tnum text-[15px] font-black">{money(stmt.total_purchases, lang)}</p>
            </div>
            <div className="rounded-2xl bg-cream p-3 dark:bg-night-bg">
              <p className="text-[11px] text-muted">{t("cd_paid", lang)}</p>
              <p className="tnum text-[15px] font-black">{money(stmt.total_paid, lang)}</p>
            </div>
            <div className="rounded-2xl bg-brick/10 p-3">
              <p className="text-[11px] text-muted">{t("cd_baqi_word", lang)}</p>
              <p className="tnum text-[15px] font-black text-brick">{money(stmt.closing_balance, lang)}</p>
            </div>
          </div>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
            <ShieldCheck size={12} /> {t("ps_footer", lang)}
          </p>
        </div>
      </div>
    </div>
  );
}
