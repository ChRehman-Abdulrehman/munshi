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
import { fmtTime } from "@/lib/format";
import type { Customer, Draft, Entry, LlmGuess, ParsedItem } from "@/lib/types";

export type Msg =
  | { id: string; role: "user"; kind: "text"; text: string }
  | { id: string; role: "munshi"; kind: "text"; text: string }
  | { id: string; role: "munshi"; kind: "draft"; draft: Draft }
  | { id: string; role: "munshi"; kind: "saved"; entry: Entry }
  | { id: string; role: "munshi"; kind: "queued"; text: string };

function findCustomerByName(name: string, cs: Customer[]): Customer | null {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return null;
  return (
    cs.find((c) => c.name.toLowerCase() === n) ??
    cs.find((c) => c.name.toLowerCase().startsWith(n) || n.startsWith(c.name.toLowerCase())) ??
    cs.find((c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())) ??
    cs.find((c) => n.split(/\s+/).every((tk) => c.name.toLowerCase().includes(tk))) ??
    null
  );
}

type AgentToolCall = { id: string; function: { name: string; arguments: string } };
type AgentMessage = { content?: string; tool_calls?: AgentToolCall[] };

export function useMunshiChat() {
  const { repo, shop, products, customers, lang, t, setSync, refreshAll, refreshAlerts } = useApp();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const munshiName = shop?.settings.munshi_name?.trim() || t("app_name");

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

  const buildAgentSnapshot = React.useCallback(async () => {
    if (!repo || !shop) return "";
    try {
      const [entries, wanted] = await Promise.all([
        repo.listEntries({ from: new Date(Date.now() - 30 * 86400000).toISOString() }),
        repo.listWanted(),
      ]);
      const balances = await repo.balanceMap();
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
      return [
        `Shop: ${shop.name}. Today: ${todayIso}. Language: ${lang}.`,
        `Aaj: ${todays.length} entries, sale Rs ${Math.round(todaySales)}, payments Rs ${Math.round(todayPayments)}.`,
        `Pichhle 30 din: ${entries.length} entries, ${wanted.length} mangwana requests.`,
        `Udhaar (top): ${topBalances || "koi udhaar nahi"}.`,
        `Low stock: ${low || "sab theek"}.`,
      ].join("\n");
    } catch {
      return "";
    }
  }, [repo, shop, products, customers, lang]);

  const execAgentTool = React.useCallback(
    async (name: string, args: Record<string, unknown>, text: string, source: "voice" | "text"): Promise<string> => {
      const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
      try {
        if (name === "get_shop_summary") {
          return (await buildAgentSnapshot()) || "not_ready";
        }
        if (name === "get_customer_info") {
          if (!repo || !shop) return "not_ready";
          const c = findCustomerByName(str(args.name), customers);
          if (!c) return `NOT_FOUND: "${str(args.name)}" naam ka customer nahi mila — owner se poochho.`;
          const balances = await repo.balanceMap();
          const entries = await repo.listEntries({ from: new Date(Date.now() - 30 * 86400000).toISOString() });
          const mine = entries
            .filter((e) => e.status === "active" && e.customer_id === c.id)
            .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
            .slice(0, 5)
            .map((e) => `${e.occurred_at.slice(0, 10)} ${e.type} Rs ${e.total}`);
          return JSON.stringify({
            name: c.name,
            udhaar_baqi: round2(Math.max(0, balances.get(c.id) ?? 0)),
            phone: c.phone ?? null,
            credit_limit: c.credit_limit ?? null,
            last_entries: mine,
          });
        }
        if (name === "get_recent_entries") {
          const count = Math.min(Math.max(num(args.count) ?? 5, 1), 20);
          const list = (entriesQ.data ?? [])
            .filter((e) => e.status === "active")
            .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
            .slice(0, count)
            .map((e) => `${fmtTime(e.occurred_at)} ${e.type} ${customers.find((c) => c.id === e.customer_id)?.name ?? ""} Rs ${e.total}`.trim());
          return list.length ? list.join("\n") : "Aaj koi entry nahi.";
        }
        if (name === "get_stock_info") {
          const q = str(args.query).toLowerCase();
          const active = products.filter((p) => p.active);
          if (q) {
            const hits = active.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
            if (!hits.length) return `NOT_FOUND: "${str(args.query)}" stock mein nahi mila.`;
            return hits.map((p) => `${p.name}: ${p.stock_qty} ${p.unit}, rate Rs ${p.selling_price}`).join("\n");
          }
          const low = active.filter((p) => p.stock_qty <= p.min_stock).slice(0, 8)
            .map((p) => `${p.name} (${p.stock_qty} ${p.unit})`);
          return JSON.stringify({ total_products: active.length, low_stock: low.length ? low : "sab theek" });
        }
        if (name === "list_dues") {
          if (!repo) return "not_ready";
          const balances = await repo.balanceMap();
          const rows = [...balances.entries()]
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([id, bal]) => `${customers.find((c) => c.id === id)?.name ?? "?"}: Rs ${round2(bal)}`);
          return rows.length ? rows.join("\n") : "Kisi ka udhaar baqi nahi.";
        }
        if (name === "get_sales_report") {
          if (!repo) return "not_ready";
          const days = Math.min(Math.max(num(args.days) ?? 7, 1), 90);
          const entries = await repo.listEntries({ from: new Date(Date.now() - days * 86400000).toISOString() });
          const act = entries.filter((e) => e.status === "active");
          const sum = (t: string) => round2(act.filter((e) => e.type === t).reduce((s, e) => s + e.total, 0));
          return JSON.stringify({ days, entries: act.length, sales: sum("sale"), payments: sum("payment"), refunds: sum("refund") });
        }
        if (name === "open_page") {
          const pages: Record<string, string> = { home: "/", khata: "/khata", bahi: "/bahi", stock: "/stock", reports: "/reports", settings: "/settings", munshi: "/munshi" };
          const page = str(args.page);
          const href = pages[page];
          if (!href) return "BAD_PAGE";
          const label = t(page);
          pushText(fill(t("chat_nav_opening"), { label }), fill(t("chat_nav_speak"), { label }));
          setTimeout(() => router.push(href), 400);
          return "OPENED";
        }
        if (name === "open_customer_khata") {
          const c = findCustomerByName(str(args.name), customers);
          if (!c) return `NOT_FOUND: "${str(args.name)}" — owner se poochho.`;
          const label = `${c.name} ka khata`;
          pushText(fill(t("chat_nav_opening"), { label }), fill(t("chat_nav_speak"), { label }));
          setTimeout(() => router.push(`/khata/${c.id}`), 400);
          return "OPENED";
        }
        if (name === "prepare_entry") {
          const intentRaw = str(args.intent);
          const allowed = ["sale_cash", "sale_credit", "payment", "refund", "stock_in"];
          if (!allowed.includes(intentRaw)) return "BAD_INTENT";
          const c = str(args.customer_name) ? findCustomerByName(str(args.customer_name), customers) : null;
          if (!c && ["sale_credit", "payment", "refund"].includes(intentRaw)) {
            return `CUSTOMER_NOT_FOUND: "${str(args.customer_name)}" — owner se sahi naam poochho.`;
          }
          const rawItems = Array.isArray(args.items) ? (args.items as unknown[]).slice(0, 8) : [];
          const items: ParsedItem[] = rawItems.map((it) => {
            const o = (it ?? {}) as Record<string, unknown>;
            const nm = str(o.name);
            const prod =
              products.find((p) => p.name.toLowerCase() === nm.toLowerCase()) ??
              (nm.length >= 3 ? products.find((p) => p.name.toLowerCase().includes(nm.toLowerCase())) : undefined);
            const qty = num(o.qty);
            const price = num(o.unit_price) ?? prod?.selling_price ?? null;
            const lt = qty !== null && price !== null ? round2(qty * price) : null;
            return {
              name: prod?.name ?? nm,
              product_id: prod?.id ?? null,
              qty,
              unit: prod?.unit ?? "pc",
              unit_price: price,
              discount: 0,
              line_total: lt,
              matched: prod ? ("exact" as const) : ("none" as const),
            };
          });
          const methodRaw = str(args.method);
          const draft = draftFromPartial(ctxFor(customers), {
            intent: intentRaw as Draft["intent"],
            source,
            transcript: text,
            customer: c ? { text: c.name, id: c.id } : null,
            items,
            total: num(args.total),
            paid_now: num(args.paid_now),
            method: ["cash", "easypaisa", "jazzcash", "bank", "credit"].includes(methodRaw) ? (methodRaw as Draft["method"]) : null,
          });
          push({ id: crypto.randomUUID(), role: "munshi", kind: "draft", draft });
          return "DRAFT_READY: owner ko bolo ke screen par check kar ke confirm kare.";
        }
        if (name === "add_customer") {
          const nm = str(args.name);
          if (!nm) return "NAME_REQUIRED";
          const draft = draftFromPartial(ctxFor(customers), {
            intent: "add_customer",
            source,
            transcript: text,
            customer: { text: nm },
          });
          push({ id: crypto.randomUUID(), role: "munshi", kind: "draft", draft });
          return "DRAFT_READY: owner ko bolo ke screen par check kar ke confirm kare.";
        }
        if (name === "set_credit_limit") {
          const c = findCustomerByName(str(args.name), customers);
          if (!c) return `NOT_FOUND: "${str(args.name)}" — owner se poochho.`;
          const limit = num(args.limit);
          if (limit === null || limit < 0) return "BAD_LIMIT";
          const draft = draftFromPartial(ctxFor(customers), {
            intent: "set_credit_limit",
            source,
            transcript: text,
            customer: { text: c.name, id: c.id },
            credit_limit_new: limit,
          });
          push({ id: crypto.randomUUID(), role: "munshi", kind: "draft", draft });
          return "DRAFT_READY: owner ko bolo ke screen par check kar ke confirm kare.";
        }
        if (name === "undo_last_entry") {
          const latest = (entriesQ.data ?? [])
            .filter((e) => e.status === "active")
            .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))[0];
          if (!latest) return "NO_ENTRIES_TODAY: aaj koi entry nahi — Bahi page se purani entry reverse ho sakti hai.";
          const draft = draftFromPartial(ctxFor(customers), {
            intent: "delete_entry",
            source,
            transcript: text,
            target_entry: { id: latest.id },
          });
          push({ id: crypto.randomUUID(), role: "munshi", kind: "draft", draft });
          return "DRAFT_READY: owner ko bolo ke screen par check kar ke confirm kare.";
        }
        return "UNKNOWN_TOOL";
      } catch {
        return "TOOL_ERROR";
      }
    },
    [buildAgentSnapshot, customers, entriesQ, products, push, pushText, router, t, ctxFor]
  );

  const runAgent = React.useCallback(
    async (text: string, source: "voice" | "text"): Promise<boolean> => {
      if (!online || !repo || !shop) return false;
      const snapshot = await buildAgentSnapshot();
      const messages: Record<string, unknown>[] = [{ role: "user", content: text }];
      let acted = false;
      for (let step = 0; step < 5; step++) {
        let data: { ok?: boolean; message?: AgentMessage };
        try {
          const res = await fetch("/api/agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages, lang, snapshot }),
          });
          if (!res.ok) return acted;
          data = (await res.json()) as { ok?: boolean; message?: AgentMessage };
        } catch {
          return acted;
        }
        const m = data.message;
        if (!m) return acted;
        const tcs = m.tool_calls ?? [];
        if (tcs.length) {
          messages.push({
            role: "assistant",
            content: m.content ?? "",
            tool_calls: tcs.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.function.name, arguments: tc.function.arguments } })),
          });
          for (const tc of tcs) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
            } catch {
              void 0;
            }
            const out = await execAgentTool(tc.function.name, args, text, source);
            if (!out.startsWith("TOOL_ERROR")) acted = true;
            messages.push({ role: "tool", tool_call_id: tc.id, content: out });
          }
          continue;
        }
        if (m.content) {
          pushText(m.content, shop.settings.voice_reply ? m.content : undefined);
          return true;
        }
        return acted;
      }
      return acted;
    },
    [online, repo, shop, lang, buildAgentSnapshot, execAgentTool, pushText]
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
        const ok = await runAgent(text, source);
        if (!ok) {
          const q = draft.questions[0];
          pushText(q ? q.text : t("chat_unsure"), q?.text);
        }
        return;
      }

      if (draft.intent === "undo" || draft.intent === "delete_entry" || draft.intent === "update_entry") {
        push({ id: crypto.randomUUID(), role: "munshi", kind: "draft", draft: { ...draft, confidence: Math.max(draft.confidence, 0.9) } });
        return;
      }

      push({ id: crypto.randomUUID(), role: "munshi", kind: "draft", draft });
    },
    [ctxFor, push, pushText, answerQuestion, runAgent, shop, lang, products, online, repo, toast, t]
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
