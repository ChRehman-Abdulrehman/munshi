"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import { useAsync, useOnline } from "@/lib/hooks";
import { fill, t as translate } from "@/lib/i18n";
import { MicSession, WhisperSession, recorderSupported, speak, whisperIsBroken, type ListenSession } from "@/lib/speech";
import { draftFromPartial, mergeEnhancement, parseUtterance, type ParseContext } from "@/lib/parser/rules";
import { findCustomerInText, helpText, helpTitle, isFullClear, matchNavigation, searchHelp } from "@/lib/intel/guide";
import { answerLocally } from "@/lib/intel/answers";
import { findNameDupes, pickByLast4 } from "@/lib/intel/dupes";
import { round2 } from "@/lib/ledger/balance";
import type { Customer, Draft, Entry, LlmGuess } from "@/lib/types";

export type Msg =
  | { id: string; role: "user"; kind: "text"; text: string }
  | { id: string; role: "munshi"; kind: "text"; text: string }
  | { id: string; role: "munshi"; kind: "draft"; draft: Draft }
  | { id: string; role: "munshi"; kind: "saved"; entry: Entry }
  | { id: string; role: "munshi"; kind: "queued"; text: string };

export function useMunshiChat() {
  const { repo, shop, products, customers, lang, t, setSync, refreshAll, refreshAlerts } = useApp();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const munshiName = shop?.settings.munshi_name?.trim() || "Munshi";

  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [pendingDup, setPendingDup] = React.useState<{ text: string; name: string; cands: Customer[] } | null>(null);
  const micRef = React.useRef<ListenSession | null>(null);

  const entriesQ = useAsync(
    () => (repo ? repo.listEntries({ from: new Date(Date.now() - 86400000).toISOString() }) : Promise.resolve([] as Entry[])),
    [repo]
  );

  const ctx: ParseContext = React.useMemo(() => ({ shop_id: shop?.id ?? "", products, customers }), [shop, products, customers]);

  const push = React.useCallback((m: Msg) => setMsgs((prev) => [...prev, m]), []);
  const pushText = React.useCallback(
    (text: string, speakText?: string) => {
      push({ id: crypto.randomUUID(), role: "munshi", kind: "text", text });
      if (speakText) speak(speakText, lang);
    },
    [push, lang]
  );

  const say = React.useCallback((text: string) => speak(text, lang), [lang]);

  const answerQuestion = React.useCallback(
    async (q: string) => {
      if (repo && shop) {
        const [entries, wanted] = await Promise.all([
          repo.listEntries({ from: new Date(Date.now() - 30 * 86400000).toISOString() }),
          repo.listWanted(),
        ]);
        const balances = await repo.balanceMap();
        const local = answerLocally(q, { shop, entries, products, customers, wanted, balances }, lang);
        if (online) {
          try {
            const todayIso = new Date().toISOString().slice(0, 10);
            const todays = entries.filter((e) => e.status === "active" && e.occurred_at.slice(0, 10) === todayIso);
            const todaySales = todays.filter((e) => e.type === "sale").reduce((s, e) => s + e.total, 0);
            const todayPayments = todays.filter((e) => e.type === "payment").reduce((s, e) => s + e.total, 0);
            const topBalances = [...balances.entries()]
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([id, bal]) => `${customers.find((c) => c.id === id)?.name ?? "?"}: Rs ${bal}`)
              .join("; ");
            const low = products
              .filter((p) => p.active && p.stock_qty <= p.min_stock)
              .slice(0, 5)
              .map((p) => `${p.name} (${p.stock_qty})`)
              .join(", ");
            const snapshot = [
              `Shop: ${shop.name}. Today: ${todayIso}. Reply in ${lang === "en" ? "English" : "Roman Urdu"}.`,
              `Aaj: ${todays.length} entries, sale total Rs ${Math.round(todaySales)}, payments Rs ${Math.round(todayPayments)}.`,
              `Pichhle 30 din: ${entries.length} entries, ${wanted.length} mangwana requests.`,
              `Udhaar (top): ${topBalances || "koi udhaar nahi"}.`,
              `Low stock: ${low || "sab theek"}.`,
            ].join("\n");
            const res = await fetch("/api/ask", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ q, snapshot }),
            });
            if (res.ok) {
              const data = (await res.json()) as { answer?: string };
              if (data.answer) return data.answer;
            }
          } catch {
            void 0;
          }
        }
        return local;
      }
      return t("chat_loading_data");
    },
    [repo, shop, products, customers, online, lang, t]
  );

  const ctxFor = React.useCallback(
    (cs: Customer[]): ParseContext => ({ shop_id: ctx.shop_id, products: ctx.products, customers: cs }),
    [ctx]
  );

  const runFlow = React.useCallback(
    async (text: string, source: "voice" | "text", cs: Customer[]) => {
      const pctx = ctxFor(cs);

      if (repo && isFullClear(text)) {
        const c = findCustomerInText(text, cs);
        if (!c) {
          pushText(t("chat_ask_customer"));
          return;
        }
        try {
          const balances = await repo.balanceMap();
          const bal = round2(Math.max(0, balances.get(c.id) ?? 0));
          if (bal <= 0.5) {
            pushText(fill(t("chat_already_clear"), { name: c.name }));
            return;
          }
          const d = draftFromPartial(pctx, {
            intent: "payment",
            source,
            transcript: text,
            customer: { text: c.name, id: c.id },
            total: bal,
            confidence: 0.9,
          });
          push({ id: crypto.randomUUID(), role: "munshi", kind: "draft", draft: d });
        } catch {
          toast.push("error", t("chat_load_fail"));
        }
        return;
      }

      let draft = parseUtterance(text, pctx, source);

      if (online && shop && draft.intent !== "question") {
        try {
          const res = await fetch("/api/parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              source,
              shop_id: shop.id,
              products: products.slice(0, 120).map((p) => ({ id: p.id, name: p.name, aliases: p.aliases, unit: p.unit, selling_price: p.selling_price })),
              customers: cs.slice(0, 200).map((c) => ({ id: c.id, name: c.name })),
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { ok?: boolean; llm?: LlmGuess | null };
            if (data.ok && data.llm) draft = mergeEnhancement(draft, data.llm, pctx);
          }
        } catch {
          void 0;
        }
      }

      if (draft.intent === "question") {
        const a = await answerQuestion(text);
        if (shop?.settings.voice_reply) speak(a, lang);
        push({ id: crypto.randomUUID(), role: "munshi", kind: "text", text: a });
        return;
      }

      if (draft.intent === "clarify" || draft.confidence < 0.4) {
        const q = draft.questions[0];
        pushText(q ? q.text : t("chat_unsure"), q?.text);
        return;
      }

      if (draft.intent === "undo" || draft.intent === "delete_entry" || draft.intent === "update_entry") {
        push({ id: crypto.randomUUID(), role: "munshi", kind: "draft", draft: { ...draft, confidence: Math.max(draft.confidence, 0.9) } });
        return;
      }

      push({ id: crypto.randomUUID(), role: "munshi", kind: "draft", draft });
    },
    [ctxFor, push, pushText, answerQuestion, shop, lang, products, online, repo, toast, t]
  );

  const submit = React.useCallback(
    async (raw: string, source: "voice" | "text") => {
      const text = raw.trim();
      if (!text) return;
      push({ id: crypto.randomUUID(), role: "user", kind: "text", text });
      setInput("");

      const nav = matchNavigation(text, customers, lang);
      if (nav) {
        const line = fill(t("chat_nav_opening"), { label: nav.label });
        pushText(line, fill(t("chat_nav_speak"), { label: nav.label }));
        setTimeout(() => router.push(nav.href), 500);
        return;
      }

      const help = searchHelp(text);
      if (help) {
        pushText(helpText(help, lang), helpTitle(help, lang));
        return;
      }

      if (pendingDup) {
        const hit = pickByLast4(pendingDup.cands, text);
        if (hit) {
          setPendingDup(null);
          pushText(fill(t("chat_dup_ok"), { name: hit.name }));
          await runFlow(pendingDup.text, source, [hit]);
        } else {
          pushText(fill(t("chat_dup_no"), { name: pendingDup.name }), fill(t("chat_dup_ask_speak"), { name: pendingDup.name }));
        }
        return;
      }

      const dup = findNameDupes(text, customers);
      if (dup) {
        const hit = pickByLast4(dup.cands, text);
        if (hit) {
          pushText(fill(t("chat_dup_ok"), { name: hit.name }));
          const digits = (text.match(/\b\d{4}\b/) ?? [])[0];
          await runFlow(digits ? text.replace(digits, " ") : text, source, [hit]);
        } else {
          setPendingDup({ text, name: dup.name, cands: dup.cands });
          pushText(fill(t("chat_dup_ask"), { name: dup.name }), fill(t("chat_dup_ask_speak"), { name: dup.name }));
        }
        return;
      }

      await runFlow(text, source, customers);
    },
    [customers, lang, pendingDup, push, pushText, runFlow, router, t]
  );

  const handleSaved = React.useCallback(
    (r: { entry: Entry | null; queued: boolean }) => {
      if (r.queued) {
        pushText(t("chat_queued"), t("chat_queued_speak"));
      } else if (r.entry) {
        push({ id: crypto.randomUUID(), role: "munshi", kind: "saved", entry: r.entry });
        say(t("chat_saved_speak"));
        void entriesQ.reload();
      }
    },
    [push, pushText, say, entriesQ, t]
  );

  const startListening = React.useCallback(() => {
    if (listening) {
      micRef.current?.stop();
      return;
    }
    const preferWhisper = recorderSupported() && !whisperIsBroken();
    const session: ListenSession = preferWhisper ? new WhisperSession() : new MicSession();
    micRef.current = session;
    setInterim("");
    session.start(lang, {
      onStart: () => setListening(true),
      onInterim: (txt) => setInterim(txt),
      onFinal: (txt) => {
        setInterim("");
        void submit(txt, "voice");
      },
      onError: (err) => {
        setListening(false);
        setInterim("");
        toast.push("warning", err);
      },
      onEnd: () => setListening(false),
    });
  }, [lang, listening, submit, toast]);

  React.useEffect(() => {
    return () => micRef.current?.stop();
  }, []);

  const updateDraft = React.useCallback(
    (id: string, d: Draft) => {
      setMsgs((prev) => prev.map((m) => (m.id === id && m.kind === "draft" ? { ...m, draft: d } : m)));
    },
    []
  );

  const undoEntry = React.useCallback(
    async (entry: Entry) => {
      if (!repo) return;
      const res = await repo.reverse(entry.id, "user undo from chat");
      if (res.ok) {
        setSync("saved");
        toast.push("success", t("chat_undo_done"));
        say(t("chat_undo_speak"));
        await refreshAll();
        await refreshAlerts();
        await entriesQ.reload();
        setMsgs((prev) => prev.filter((m) => !(m.kind === "saved" && m.entry.id === entry.id)));
      } else {
        toast.push("error", res.message);
      }
    },
    [repo, setSync, toast, say, refreshAll, refreshAlerts, entriesQ, t]
  );

  const todayEntries = (entriesQ.data ?? []).filter((e) => e.status === "active");

  return {
    msgs,
    input,
    setInput,
    listening,
    interim,
    submit,
    startListening,
    push,
    pushText,
    updateDraft,
    undoEntry,
    handleSaved,
    entriesQ,
    todayEntries,
    munshiName,
    ctx,
    translate,
  };
}
