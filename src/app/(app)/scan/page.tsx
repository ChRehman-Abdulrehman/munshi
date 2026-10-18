"use client";

import * as React from "react";
import { useApp } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Camera, ScanLine, ShieldCheck, Trash2 } from "lucide-react";
import { parseUtterance, type ParseContext } from "@/lib/parser/rules";
import { ReviewCard } from "@/components/voice/ReviewCard";
import { Skeleton } from "@/components/ui/bits";
import type { Draft, Entry } from "@/lib/types";
import { fill } from "@/lib/i18n";

export default function ScanPage() {
  const { repo, shop, products, customers, refreshAll, refreshAlerts, t } = useApp();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [rawText, setRawText] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const ctx: ParseContext = React.useMemo(() => ({ shop_id: shop?.id ?? "", products, customers }), [shop, products, customers]);

  const onFile = async (file: File) => {
    setBusy(true);
    setProgress(0);
    setDrafts([]);
    setRawText(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    let text = "";
    try {
      const blob = await compressImage(file);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      const result = await worker.recognize(blob);
      text = result.data.text;
      await worker.terminate();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : t("sc_err_read"));
      setBusy(false);
      return;
    }

    setRawText(text);

    const lines = text
      .split(/\n+/)
      .map((l) => l.replace(/\s{2,}/g, " ").trim())
      .filter((l) => l.length >= 4 && /\d/.test(l) && /[a-zA-Z\u0600-\u06FF]/.test(l));

    if (lines.length === 0) {
      toast.push("warning", t("sc_warn_clear"));
      setBusy(false);
      return;
    }

    const parsed: Draft[] = [];
    const keptLines: string[] = [];
    for (const line of lines.slice(0, 12)) {
      const d = parseUtterance(line, ctx, "ocr");
      if (d.confidence >= 0.45 && (d.items.length > 0 || d.total)) {
        parsed.push(d);
        keptLines.push(line);
      }
    }

    if (parsed.length === 0) {
      const whole = parseUtterance(lines.join(", "), ctx, "ocr");
      if (whole.confidence >= 0.3) parsed.push(whole);
    }

    if (parsed.length === 0) {
      toast.push("warning", t("sc_warn_none"));
    } else {
      toast.push("success", fill(t("sc_ok_n"), { n: String(parsed.length) }));
    }
    void keptLines;
    setDrafts(parsed);
    setBusy(false);
  };

  const removeDraft = (id: string) => setDrafts((prev) => prev.filter((d) => d.id !== id));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-black"><ScanLine size={22} /> {t("sc_title")}</h1>
        <p className="text-sm text-muted">
          {t("sc_sub")}
        </p>
      </div>

      <Card className="space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        <Button className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Camera size={18} /> {busy ? (progress > 0 ? fill(t("sc_busy_progress"), { n: String(progress) }) : t("sc_busy_prep")) : t("sc_take")}
        </Button>
        {busy && <Skeleton className="h-2 w-full" />}
        {preview && (
          <div className="relative overflow-hidden rounded-2xl border border-line dark:border-night-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={t("sc_alt")} className="max-h-72 w-full object-contain bg-black/5" />
            <button
              onClick={() => {
                URL.revokeObjectURL(preview);
                setPreview(null);
                setDrafts([]);
                setRawText(null);
              }}
              className="press absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
              aria-label={t("sc_remove")}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <ShieldCheck size={12} className="mt-0.5 shrink-0" />
          {t("sc_privacy")}
        </p>
      </Card>

      {rawText && (
        <Card>
          <CardTitle className="mb-2">{t("sc_words")}</CardTitle>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-cream p-3 text-xs dark:bg-night-card">{rawText}</pre>
        </Card>
      )}

      {drafts.map((d) => (
        <div key={d.id} className="relative">
          <ReviewCard
            draft={d}
            onDraftChange={(nd) => setDrafts((prev) => prev.map((x) => (x.id === d.id ? nd : x)))}
            onSaved={async (r: { entry: Entry | null; queued: boolean }) => {
              removeDraft(d.id);
              if (r.entry) toast.push("success", t("sc_saved_toast"));
              await refreshAll();
              await refreshAlerts();
              if (repo) void repo;
            }}
          />
          <button
            onClick={() => removeDraft(d.id)}
            className="press absolute -top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-brick text-white shadow-soft"
            aria-label={t("sc_remove_entry")}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const g = canvas.getContext("2d");
  if (!g) return file;
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality);
  });
}
