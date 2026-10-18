"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CloudOff, Cloud, RefreshCw, AlertCircle, Menu } from "lucide-react";
import { useApp } from "../providers";
import { LANGS } from "@/lib/i18n";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/cn";
import { SyncExplainer } from "./SyncExplainer";

export function TopBar({ onMenu }: { onMenu?: () => void }) {
  const { shop, lang, setLang, unread, sync, t } = useApp();
  const pathname = usePathname();
  const [explainOpen, setExplainOpen] = React.useState(false);

  const syncBadge = () => {
    if (sync === "saving") return { tone: "amber" as const, icon: <RefreshCw size={12} className="animate-spin" />, label: t("tb_saving") };
    if (sync === "queued") return { tone: "amber" as const, icon: <CloudOff size={12} />, label: t("se_queued_b") };
    if (sync === "needs_review") return { tone: "red" as const, icon: <AlertCircle size={12} />, label: t("se_review_b") };
    if (sync === "offline") return { tone: "muted" as const, icon: <CloudOff size={12} />, label: t("tb_offline") };
    return { tone: "green" as const, icon: <Cloud size={12} />, label: t("tb_saved") };
  };
  const sb = syncBadge();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-cream/95 backdrop-blur dark:bg-night-bg/95 dark:border-night-line no-print">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3">
          {onMenu && (
            <button onClick={onMenu} className="rounded-xl p-2 text-muted hover:bg-black/5 lg:hidden dark:hover:bg-white/10" aria-label="Menu">
              <Menu size={20} />
            </button>
          )}
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-sm font-black text-white">م</span>
            <span className="truncate text-[15px] font-bold">{shop?.name ?? "Munshi"}</span>
            {shop?.is_demo && <Badge tone="saffron" className="hidden sm:inline-flex">DEMO</Badge>}
          </Link>
          <div className="flex-1" />
          <button
            onClick={() => setExplainOpen(true)}
            aria-label="Sync status"
            className="press"
          >
            <Badge tone={sb.tone} className="gap-1">
              {sb.icon}
              <span className="hidden xs:inline sm:inline">{sb.label}</span>
            </Badge>
          </button>
          <select
            aria-label="Language"
            value={lang}
            onChange={(e) => setLang(e.target.value as "roman" | "ur" | "en")}
            className="h-9 rounded-xl border border-line bg-white px-2 text-[13px] font-semibold dark:bg-night-card dark:border-night-line"
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <Link href="/alerts" aria-label="Alerts" className={cn("relative rounded-xl p-2 text-muted hover:bg-black/5 dark:hover:bg-white/10", pathname === "/alerts" && "text-primary")}>
            <Bell size={20} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brick px-1 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </div>
      </header>
      <SyncExplainer open={explainOpen} onClose={() => setExplainOpen(false)} />
    </>
  );
}
