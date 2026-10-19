"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/providers";
import { MicWave } from "@/components/voice/MicWave";
import { MunshiMessages } from "@/components/assistant/MunshiMessages";
import { useMunshiChat } from "@/components/assistant/useMunshiChat";
import { Mic, Send, Sparkles } from "lucide-react";
import { canListen, recorderSupported, whisperIsBroken } from "@/lib/speech";
import { fill } from "@/lib/i18n";
import { money, relTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";

export default function MunshiPage() {
  return (
    <React.Suspense fallback={<div className="flex h-64 items-center justify-center text-sm text-muted">…</div>}>
      <MunshiInner />
    </React.Suspense>
  );
}

function MunshiInner() {
  const { customers, products, lang, t } = useApp();
  const search = useSearchParams();
  const toast = useToast();
  const chat = useMunshiChat();
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const autoStarted = React.useRef(false);

  const examples = React.useMemo(() => {
    const out: string[] = [];
    const custs = customers.slice(0, 3);
    const prods = products.filter((p) => p.active);
    custs.forEach((c, i) => {
      const p = prods.length ? prods[i % prods.length] : null;
      out.push(p ? fill(t("chat_ex_credit_item"), { name: c.name, item: p.name.toLowerCase() }) : fill(t("chat_ex_credit_amount"), { name: c.name }));
    });
    if (custs[0]) out.push(fill(t("chat_ex_open_khata"), { name: custs[0].name }));
    out.push(t("chat_ex_hisaab"));
    return out;
  }, [customers, products, t]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.msgs.length, chat.interim]);

  React.useEffect(() => {
    const text = search.get("text");
    if (text && chat.msgs.length === 0) {
      void chat.submit(text, "text");
      return;
    }
    if (search.get("listen") === "1" && !autoStarted.current) {
      autoStarted.current = true;
      setTimeout(() => {
        if (canListen()) chat.startListening();
        else toast.push("info", t("chat_mic_unsupported"));
      }, 350);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const whisperMode = recorderSupported() && !whisperIsBroken();

  return (
    <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-5">
      <div className="flex min-h-[calc(100dvh-11rem)] flex-col">
        <div className="flex-1 space-y-3 pb-4">
          {chat.msgs.length === 0 && (
            <div className="card space-y-3 p-4">
              <p className="flex items-center gap-2 font-bold">
                <Sparkles size={18} className="text-saffron" /> {fill(t("chat_hello"), { name: chat.munshiName })}
              </p>
              <p className="text-[14px] text-muted">{t("chat_intro")}</p>
              <p className="text-[13px] font-semibold text-muted">{t("chat_ex_hint")}</p>
              <div className="space-y-1.5">
                {examples.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => void chat.submit(ex, "text")}
                    className="press block w-full rounded-2xl bg-white px-3 py-2.5 text-left text-[13px] font-semibold shadow-soft dark:bg-night-card"
                  >
                    🎙️ “{ex}”
                  </button>
                ))}
              </div>
            </div>
          )}

          <MunshiMessages
            msgs={chat.msgs}
            updateDraft={chat.updateDraft}
            handleSaved={chat.handleSaved}
            pushText={chat.pushText}
            undoEntry={(e) => void chat.undoEntry(e)}
            startListening={chat.startListening}
            todayEntries={chat.todayEntries}
          />
          <div ref={bottomRef} />
        </div>

        <div className="sticky bottom-[64px] z-30 pt-2 lg:bottom-0 no-print">
          {chat.listening && (
            <div className="mb-2 rounded-2xl border border-saffron bg-saffron-soft px-4 py-2">
              <MicWave active />
              <p className="text-center text-[13px] font-semibold">{chat.interim || (whisperMode ? t("chat_listening_hint") : t("listen_now"))}</p>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-3xl border border-line bg-white p-2 shadow-lift dark:bg-night-card dark:border-night-line">
            <input
              value={chat.input}
              onChange={(e) => chat.setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void chat.submit(chat.input, "text");
                }
              }}
              placeholder={t("type_here")}
              className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none"
              aria-label={t("type_here")}
            />
            {chat.input.trim() ? (
              <button
                onClick={() => void chat.submit(chat.input, "text")}
                className="press flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white"
                aria-label={t("chat_send_aria")}
              >
                <Send size={18} />
              </button>
            ) : (
              <button
                onClick={chat.startListening}
                className={cn("press flex h-12 w-12 items-center justify-center rounded-2xl text-white", chat.listening ? "bg-brick pulse-ring" : "bg-primary")}
                aria-label={chat.listening ? t("panel_close") : t("listen_now")}
              >
                <Mic size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      <aside className="mt-5 hidden lg:block">
        <div className="card sticky top-20 p-4">
          <p className="mb-3 text-sm font-bold">{t("chat_today_entries")}</p>
          {chat.todayEntries.length === 0 ? (
            <p className="text-sm text-muted">{t("chat_no_entries")}</p>
          ) : (
            <div className="space-y-2">
              {chat.todayEntries.slice(0, 12).map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5">
                  <span className="text-base" aria-hidden>
                    {e.type === "payment" ? "💵" : e.type === "sale" ? "🧾" : e.type === "refund" ? "↩️" : "📦"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">
                      {customers.find((c) => c.id === e.customer_id)?.name ?? e.lines[0]?.description ?? t("common_entry")}
                    </p>
                    <p className="text-[11px] text-muted">{relTime(e.occurred_at, lang)}</p>
                  </div>
                  <span className="tnum text-[13px] font-bold">{money(e.total, lang)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
