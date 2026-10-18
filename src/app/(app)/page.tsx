"use client";

import * as React from "react";
import Link from "next/link";
import { useApp } from "@/components/providers";
import { useAsync } from "@/lib/hooks";
import { money, fmtDate, relTime, dateOnly } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/bits";
import { allBalancesFromEntries } from "@/lib/ledger/balance";
import type { Entry } from "@/lib/types";
import { ArrowRight, Bell, Mic, NotebookText, Package, Radio, TrendingUp, Wallet } from "lucide-react";

export default function HomePage() {
  const { repo, shop, lang, t, alerts, ready } = useApp();
  const since = React.useMemo(() => new Date(Date.now() - 30 * 86400000).toISOString(), []);
  const entriesQ = useAsync(() => (repo ? repo.listEntries({ from: since }) : Promise.resolve([] as Entry[])), [repo]);

  const entries = entriesQ.data ?? [];
  const today = dateOnly(new Date().toISOString());

  const stats = React.useMemo(() => {
    const active = entries.filter((e) => e.status === "active");
    const todayEntries = active.filter((e) => dateOnly(e.occurred_at) === today);
    const todaySales = todayEntries.filter((e) => e.type === "sale").reduce((s, e) => s + e.total, 0);
    const todayCash =
      todayEntries.filter((e) => e.type === "sale").reduce((s, e) => s + e.paid_now, 0) +
      todayEntries.filter((e) => e.type === "payment").reduce((s, e) => s + e.total, 0);
    const unpaid = allBalancesFromEntries(active, []);
    const totalUdhaar = [...unpaid.values()].reduce((s, v) => s + Math.max(0, v), 0);
    return { todaySales, todayCash, totalUdhaar };
  }, [entries, today]);

  const topAlerts = React.useMemo(
    () =>
      [...alerts]
        .filter((a) => !a.resolved_at && (!a.snoozed_until || new Date(a.snoozed_until).getTime() < Date.now()))
        .sort((a, b) => (b.severity === "critical" ? -1 : 1) - (a.severity === "critical" ? -1 : 1) || b.created_at.localeCompare(a.created_at))
        .slice(0, 2),
    [alerts]
  );

  if (!ready) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-black">{t("home_greeting")}</h1>
          <p className="text-sm text-muted">
            {shop?.name} • {fmtDate(new Date().toISOString(), lang)}
          </p>
        </div>
        {shop?.is_demo && <Badge tone="saffron">{t("demo_banner")}</Badge>}
      </div>

      <Link
        href="/munshi?listen=1"
        className="press block rounded-3xl bg-primary p-5 text-white shadow-lift transition hover:bg-primary-deep"
      >
        <div className="flex items-center gap-4">
          <span className="pulse-ring flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Mic size={30} />
          </span>
          <span className="min-w-0">
            <b className="block text-lg">{t("hero_title")}</b>
            <span className="block text-[13px] text-white/85">
              {t("hero_sub")}
            </span>
          </span>
        </div>
      </Link>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label={t("aaj_ki_sale")} value={entriesQ.loading ? null : money(stats.todaySales, lang)} href="/reports" />
        <StatTile label={t("aaj_cash")} value={entriesQ.loading ? null : money(stats.todayCash, lang)} href="/reports" />
        <StatTile label={t("total_udhaar")} value={entriesQ.loading ? null : money(stats.totalUdhaar, lang)} href="/khata" tone="brick" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TaskTile
          href="/khata"
          icon={<NotebookText size={26} />}
          title={t("khata")}
          hint={t("hint_khata")}
          tone="brick"
        />
        <TaskTile
          href="/stock"
          icon={<Package size={26} />}
          title={t("stock")}
          hint={t("hint_stock")}
          tone="saffron"
        />
        <TaskTile
          href="/bahi"
          icon={<Wallet size={26} />}
          title={t("bahi")}
          hint={t("hint_bahi")}
          tone="primary"
        />
        <TaskTile
          href="/reports"
          icon={<TrendingUp size={26} />}
          title={t("reports")}
          hint={t("hint_reports")}
          tone="muted"
        />
      </div>

      {topAlerts.length > 0 && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Radio size={14} /> {t("zaroori_baatein")}
            </p>
            <Link href="/alerts" className="text-xs font-bold text-primary">
              {t("sab_dekhein")}
            </Link>
          </div>
          {topAlerts.map((a) => (
            <Link key={a.id} href={a.action?.href ?? "/alerts"} className="flex min-h-[44px] items-start gap-3 rounded-2xl px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.severity === "critical" ? "bg-brick" : a.severity === "warning" ? "bg-amberw" : "bg-primary"}`} />
              <span className="min-w-0 flex-1">
                <b className="block text-[14px]">{a.title}</b>
                <span className="block truncate text-[13px] text-muted">{a.message}</span>
              </span>
              <span className="whitespace-nowrap text-[11px] text-muted">{relTime(a.created_at, lang)}</span>
            </Link>
          ))}
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Bell size={14} /> {t("aise_bol")}
          </p>
          <Link href="/munshi" className="text-xs font-bold text-primary">
            {t("munshi_kholein")} <ArrowRight size={12} className="inline" />
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <QuickChip href="/munshi?text=Ali%20ko%202%20lawn%20suit%202500%20udhaar%20likh%20do" label="Ali ko 2 lawn suit 2500 udhaar" />
          <QuickChip href="/munshi?text=Kiran%20ne%202000%20payment%20di" label="Kiran ne 2000 payment di" />
          <QuickChip href="/munshi?text=Aaj%20ka%20hisaab%20suna%20do" label="Aaj ka hisaab suna do" />
          <QuickChip href="/munshi?text=Ali%20ka%20khata%20khol%20do" label="Ali ka khata khol do" />
        </div>
      </Card>
    </div>
  );
}

function StatTile({ label, value, href, tone }: { label: string; value: string | null; href: string; tone?: "brick" }) {
  return (
    <Link href={href} className="press rounded-2xl border border-line bg-white p-3 shadow-soft dark:border-night-line dark:bg-night-card">
      <p className="text-[11px] font-semibold text-muted">{label}</p>
      {value === null ? <Skeleton className="mt-1.5 h-6 w-16" /> : <p className={`tnum mt-0.5 text-[15px] font-black ${tone === "brick" ? "text-brick" : ""}`}>{value}</p>}
    </Link>
  );
}

function TaskTile({ href, icon, title, hint, tone }: { href: string; icon: React.ReactNode; title: string; hint: string; tone: "primary" | "brick" | "saffron" | "muted" }) {
  const tones: Record<string, string> = {
    primary: "bg-primary-soft text-primary",
    brick: "bg-brick-soft text-brick",
    saffron: "bg-saffron-soft text-saffron",
    muted: "bg-cream text-muted dark:bg-night-card",
  };
  return (
    <Link href={href} className="press flex min-h-[96px] items-center gap-3 rounded-3xl border border-line bg-white p-4 shadow-soft dark:border-night-line dark:bg-night-card">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}>{icon}</span>
      <span className="min-w-0">
        <b className="block text-[15px]">{title}</b>
        <span className="block text-[12px] leading-snug text-muted">{hint}</span>
      </span>
    </Link>
  );
}

function QuickChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="press whitespace-nowrap rounded-full border border-line bg-white px-4 py-2 text-[13px] font-semibold shadow-soft dark:border-night-line dark:bg-night-card"
    >
      🎙️ {label}
    </Link>
  );
}
