"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Mic, Send, X } from "lucide-react";
import { useApp } from "@/components/providers";
import { MicWave } from "@/components/voice/MicWave";
import { cn } from "@/lib/cn";
import { recorderSupported, whisperIsBroken } from "@/lib/speech";
import { MunshiMessages } from "./MunshiMessages";
import { useMunshiChat } from "./useMunshiChat";

export function AssistantPanel() {
  const pathname = usePathname();
  const { t, lang } = useApp();
  const [open, setOpen] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const chat = useMunshiChat();

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) setOpen(true);
  }, []);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.msgs.length, chat.interim, open]);

  if (pathname === "/munshi") return null;

  const whisperMode = recorderSupported() && !whisperIsBroken();

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "press fixed bottom-[84px] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lift no-print lg:bottom-6",
          open && "lg:hidden"
        )}
        aria-label={t("panel_open")}
      >
        <MessageCircle size={24} />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-saffron text-[9px] font-black text-ink">AI</span>
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-[72px] top-14 z-50 flex flex-col overflow-hidden rounded-3xl border border-line bg-cream shadow-lift dark:border-night-line dark:bg-night-bg no-print lg:inset-x-auto lg:bottom-6 lg:right-6 lg:top-16 lg:w-[400px]">
          <div className="flex items-center gap-2 border-b border-line bg-primary px-4 py-3 text-white dark:border-night-line">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-lg font-black">م</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-black">{chat.munshiName}</p>
              <p className="truncate text-[11px] text-white/80">{t("panel_sub")}</p>
            </div>
            <button onClick={() => setOpen(false)} className="press flex h-9 w-9 items-center justify-center rounded-xl bg-white/15" aria-label={t("panel_close")}>
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {chat.msgs.length === 0 && (
              <div className="rounded-2xl bg-white p-3 text-[13px] leading-relaxed text-muted shadow-soft dark:bg-night-card">
                {t("chat_intro")}
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

          <div className="border-t border-line bg-white p-2 dark:border-night-line dark:bg-night-card">
            {chat.listening && (
              <div className="mb-1.5 rounded-xl border border-saffron bg-saffron-soft px-3 py-1.5">
                <MicWave active />
                <p className="text-center text-[12px] font-semibold">
                  {chat.interim || (whisperMode ? t("chat_listening_hint") : t("listen_now"))}
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
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
                  className={cn("press flex h-11 w-11 items-center justify-center rounded-2xl text-white", chat.listening ? "bg-brick pulse-ring" : "bg-primary")}
                  aria-label={chat.listening ? t("panel_close") : t("listen_now")}
                >
                  <Mic size={20} />
                </button>
              )}
            </div>
            <p className="px-1 pt-1 text-center text-[10px] text-muted">{t("panel_footer_hint")}</p>
          </div>
        </div>
      )}
    </>
  );
}
