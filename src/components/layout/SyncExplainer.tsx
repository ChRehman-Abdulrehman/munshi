"use client";

import { BottomSheet } from "../ui/sheet";
import { Cloud, CloudOff, Save, AlertCircle, ListTodo } from "lucide-react";
import { useApp } from "../providers";

export function SyncExplainer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sync, t } = useApp();
  return (
    <BottomSheet open={open} onClose={onClose} title={t("se_title")}>
      <div className="space-y-3 text-[15px]">
        <div className="flex items-start gap-3">
          <Save className="mt-0.5 shrink-0 text-primary" size={20} />
          <p>
            <b>{t("se_saved_b")}</b> {t("se_saved_txt")}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <CloudOff className="mt-0.5 shrink-0 text-amberw" size={20} />
          <p>
            <b>{t("se_queued_b")}</b> {t("se_queued_txt")}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0 text-brick" size={20} />
          <p>
            <b>{t("se_review_b")}</b> {t("se_review_txt")}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <Cloud className="mt-0.5 shrink-0 text-muted" size={20} />
          <p>{t("se_saving_note")}</p>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-primary-soft p-3">
          <ListTodo className="mt-0.5 shrink-0 text-primary" size={20} />
          <p>
            Abhi ka status: <b>{sync === "saved" ? t("se_st_saved") : sync === "queued" ? t("se_st_queued") : sync === "needs_review" ? t("se_st_review") : t("se_st_checking")}</b>.
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}
