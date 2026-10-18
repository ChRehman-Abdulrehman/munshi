"use client";

import * as React from "react";
import Link from "next/link";
import { useApp } from "@/components/providers";
import { relTime } from "@/lib/format";
import { localizeAlert } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Chip, EmptyState } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, CheckCheck, Clock } from "lucide-react";
import { useToast } from "@/components/ui/toast";

type Filter = "all" | "unread" | "critical" | "resolved";

const SEVERITY_ICON: Record<string, string> = { critical: "🔴", warning: "🟠", info: "🟢" };

export default function AlertsPage() {
  const { repo, alerts, refreshAlerts, lang, t } = useApp();
  const toast = useToast();
  const [filter, setFilter] = React.useState<Filter>("all");

  const list = React.useMemo(() => {
    let out = [...alerts];
    if (filter === "unread") out = out.filter((a) => !a.read_at && !a.resolved_at);
    if (filter === "critical") out = out.filter((a) => a.severity === "critical" && !a.resolved_at);
    if (filter === "resolved") out = out.filter((a) => a.resolved_at);
    else if (filter !== "all") out = out.filter((a) => !a.resolved_at);
    out.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return out;
  }, [alerts, filter]);

  const act = async (id: string, action: "read" | "resolve" | "snooze", hours?: number) => {
    if (!repo) return;
    await repo.alertAction(id, action, hours);
    await refreshAlerts();
    if (action === "resolve") toast.push("success", t("al_resolved_toast"));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">{t("alerts")}</h1>
          <p className="text-sm text-muted">{t("al_sub")}</p>
        </div>
        {alerts.some((a) => !a.read_at) && (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              for (const a of alerts.filter((x) => !x.read_at)) await repo?.alertAction(a.id, "read");
              await refreshAlerts();
            }}
          >
            <CheckCheck size={14} /> {t("al_read_all")}
          </Button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>{t("al_all")}</Chip>
        <Chip active={filter === "unread"} onClick={() => setFilter("unread")}>{t("al_new")}</Chip>
        <Chip active={filter === "critical"} onClick={() => setFilter("critical")}>{t("al_critical")}</Chip>
        <Chip active={filter === "resolved"} onClick={() => setFilter("resolved")}>{t("al_resolved_f")}</Chip>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Bell size={28} />} line={t("al_empty")} />
      ) : (
        <div className="space-y-2">
          {list.map((a) => {
            const loc = localizeAlert({ title: a.title, message: a.message, actionLabel: a.action?.label }, lang);
            return (
            <div key={a.id} className={`card p-4 ${!a.read_at && !a.resolved_at ? "border-l-4 border-l-primary" : ""} ${a.resolved_at ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <span className="text-lg" aria-hidden>{SEVERITY_ICON[a.severity] ?? "🟢"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-[15px] font-bold">{loc.title}</p>
                    {a.severity === "critical" && !a.resolved_at && <Badge tone="red">{t("al_critical")}</Badge>}
                  </div>
                  <p className="mt-0.5 text-[14px] text-muted">{loc.message}</p>
                  <p className="mt-1 text-[11px] text-muted">{relTime(a.created_at, lang)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {a.action && (
                      <Link href={a.action.href} className="press rounded-xl bg-primary px-3 py-1.5 text-[13px] font-bold text-white">
                        {loc.actionLabel}
                      </Link>
                    )}
                    {!a.resolved_at && (
                      <>
                        <button onClick={() => void act(a.id, "resolve")} className="press rounded-xl border border-line px-3 py-1.5 text-[13px] font-semibold dark:border-night-line">
                          {t("al_resolved_badge")}
                        </button>
                        <button onClick={() => void act(a.id, "snooze", 24)} className="press flex items-center gap-1 rounded-xl border border-line px-3 py-1.5 text-[13px] font-semibold dark:border-night-line">
                          <Clock size={12} /> {t("al_tomorrow")}
                        </button>
                      </>
                    )}
                    {a.resolved_at && (
                      <Badge tone="green"><CheckCheck size={12} /> {t("al_resolved_badge")}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted">
        <BellOff size={12} className="inline" /> {t("al_push_note")}
      </p>
    </div>
  );
}
