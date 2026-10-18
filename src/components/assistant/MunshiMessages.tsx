"use client";

import * as React from "react";
import type { Draft, Entry } from "@/lib/types";
import { ReviewCard } from "@/components/voice/ReviewCard";
import { AddCustomerCard, CreditLimitCard, EntryOpCard, SavedBubble, WantedCard } from "@/components/voice/IntentCards";
import type { Msg } from "./useMunshiChat";

export function MunshiMessages({
  msgs,
  updateDraft,
  handleSaved,
  pushText,
  undoEntry,
  startListening,
  todayEntries,
}: {
  msgs: Msg[];
  updateDraft: (id: string, d: Draft) => void;
  handleSaved: (r: { entry: Entry | null; queued: boolean }) => void;
  pushText: (text: string) => void;
  undoEntry: (entry: Entry) => void;
  startListening: () => void;
  todayEntries: Entry[];
}) {
  return (
    <>
      {msgs.map((m) => {
        if (m.role === "user") {
          return (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-[15px] text-white shadow-soft">{m.text}</div>
            </div>
          );
        }
        if (m.kind === "text") {
          return (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[92%] whitespace-pre-wrap rounded-3xl rounded-bl-lg bg-white px-4 py-2.5 text-[14px] shadow-soft dark:bg-night-card">
                {m.text}
              </div>
            </div>
          );
        }
        if (m.kind === "queued") {
          return (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[92%] rounded-3xl rounded-bl-lg border border-amberw bg-amberw-soft px-4 py-2.5 text-[14px] font-semibold">
                📶 {m.text}
              </div>
            </div>
          );
        }
        if (m.kind === "saved") {
          return (
            <div key={m.id} className="max-w-xl">
              <SavedBubble entry={m.entry} onUndo={() => undoEntry(m.entry)} />
            </div>
          );
        }
        const d = m.draft;
        if (d.intent === "wanted_item") {
          return (
            <div key={m.id}>
              <WantedCard draft={d} onDone={(text) => pushText(text)} />
            </div>
          );
        }
        if (d.intent === "add_customer") {
          return (
            <div key={m.id}>
              <AddCustomerCard draft={d} onDone={(text) => pushText(text)} />
            </div>
          );
        }
        if (d.intent === "set_credit_limit") {
          return (
            <div key={m.id}>
              <CreditLimitCard draft={d} onDone={(text) => pushText(text)} />
            </div>
          );
        }
        if (d.intent === "undo" || d.intent === "delete_entry" || d.intent === "update_entry") {
          return (
            <div key={m.id}>
              <EntryOpCard draft={d} entry={todayEntries[0] ?? null} onDone={(text) => pushText(text)} />
            </div>
          );
        }
        if (d.intent === "question") {
          return null;
        }
        return (
          <div key={m.id} className="max-w-xl">
            <ReviewCard
              draft={d}
              onDraftChange={(nd) => updateDraft(m.id, nd)}
              onSaved={handleSaved}
              onAskAgain={startListening}
            />
          </div>
        );
      })}
    </>
  );
}
