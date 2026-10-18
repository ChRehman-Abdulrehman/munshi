# Munshi — Project Documentation
### NYP AI Hackathon 2026 · Theme: "Build AI for Real-World Impact"

| | |
| --- | --- |
| **Project Name** | Munshi — Bolo, likho, poochho |
| **Team Name** | Logicdev.AI (5 members) |
| **Live Demo** | https://munshi-hiii14.vercel.app |
| **Source Code** | https://github.com/ChRehman-Abdulrehman/munshi |
| **Field** | Productivity · Community development · Digital literacy |
| **Category** | AI-powered, real-world impact |

---

## 1. Executive Summary

Small shopkeepers in Pakistan manage millions of rupees of daily credit ("udhaar") on paper
notebooks — the *khata*. Entries get forgotten, balances are disputed, and there are no credit
limits or analytics. Existing POS/accounting software is English-only, form-heavy, and priced for
bigger businesses.

**Munshi** is a voice-first Progressive Web App where a shopkeeper simply **speaks** in Roman
Urdu or Urdu — *"Ali ko 2 lawn suit udhaar likh do"* — and gets a structured, editable ledger entry
in seconds. It then answers shop questions (*"Aaj ka hisaab suna do"*), enforces credit limits,
predicts what to restock, and works fully offline. AI is applied at three layers (speech,
language understanding, and grounded question-answering) with a strict human-in-the-loop rule:
the AI suggests, the owner confirms.

---

## 2. Problem Statement

**Who is affected:** ~5 million small retailers in Pakistan (kiryana stores, cloth shops,
medical stores, general merchants) who run their business on credit ledgers.

**Pain points:**
1. **Lost money** — forgotten udhaar entries and disputed balances; owners cannot recover what
   they cannot prove.
2. **Zero visibility** — no daily sales figure, no list of overdue customers, no idea what is
   running out of stock.
3. **Literacy & language barrier** — most software assumes English reading/writing and heavy forms.
   The shopkeeper's actual workflow is *speaking* mixed Roman Urdu/Urdu/English.
4. **Credit risk** — unlimited credit to the same customer, no limits, no warnings, no audit trail.
5. **Connectivity** — shop internet is unreliable; cloud-only software stops working precisely
   when needed.

---

## 3. Solution Overview

Munshi turns speech into bookkeeping:

1. **Speak** (or type, or scan a receipt) — *"Ali ko 2 lawn suit udhaar likh do, 2500 ka"*.
2. **Understand** — a rules-based language engine (built specifically for Roman Urdu) extracts the
   intent, customer, items, quantity, prices and dates; an LLM enhancer fills gaps when online;
   the product's saved price is fetched automatically from stock when not spoken.
3. **Review** — every draft is shown as a review card: items, quantity, price, credit impact.
   Ambiguous or duplicate names trigger a clarifying question (e.g., last 4 digits of phone).
4. **Confirm** — one tap saves. Credit limits are enforced inside the same transaction; over-limit
   entries are blocked (owner override requires a written reason and is audited).
5. **Ask** — the AI assistant answers questions about the shop in the user's language, with every
   number computed from the ledger (never invented).

**Differentiators:** voice-first Roman Urdu, works offline, credit-guard engine, grounded answers,
3 UI languages (Roman Urdu / اردو / English), and a shippable PWA (installable, no app store).

---

## 4. Key Features

| # | Feature | What it does | Why it matters |
| --- | --- | --- | --- |
| 1 | Voice & text entry | Web Speech (ur-PK) + Whisper fallback → structured draft | 2-second entry, matches how shopkeepers actually talk |
| 2 | Roman Urdu parser | Intents, number words ("dhai hazaar"=2500), quantities, dates, reasons | No English typing needed |
| 3 | Auto price from stock | Product matched → saved selling price auto-filled | Removes the most annoying manual step |
| 4 | Duplicate-name safety | Two customers, same name → asks last 4 digits of phone | Sends credit to the right khata, no silent mistakes |
| 5 | Clarifying questions | Missing qty/price → one question, never a guessed number | Accuracy over automation |
| 6 | Credit guard | 80%+ warns, 100% blocks; override requires reason + audit | Stops the #1 cause of bad debt |
| 7 | FIFO payment allocation | Payments settle oldest debts first; status is derived | Bank-grade correctness, simple for owner |
| 8 | Reversible operations | Reverse/restore with reasons; full audit trail | Never destructive |
| 9 | Offline-first | IndexedDB storage; commits queue and sync with idempotency keys | Works in low-connectivity shops |
| 10 | Shop intelligence | Hot items, restock hints, low stock, missed-demand ranking, overdue khata | Turns the ledger into decisions |
| 11 | Statements | WhatsApp text, print/PDF, expiring public share links with QR | Get paid faster, prove balances |
| 12 | AI assistant | Ask anything on any page, text or mic, spoken replies | Makes the app feel like a real munshi |
| 13 | Receipt OCR | tesseract.js on-device → line-by-line drafts | Onboarding: scan old bills |
| 14 | 3 languages | Roman Urdu (default), Urdu, English | Accessibility & digital literacy |
| 15 | Account security | PBKDF2-SHA256 (120k iters) password + strength checklist, PIN fallback | Shop data protected |

---

## 5. AI Methodology

Munshi applies AI in three layers; the guiding principle is **AI suggests, human confirms**.

### Layer 1 — Speech → Text
- **Primary:** browser Web Speech API (`ur-PK`) — on-device recognition.
- **Fallback:** Groq `whisper-large-v3` (`/api/transcribe`); Urdu script optionally romanized with
  `openai/gpt-oss-20b`.
- Audio is never stored; only text leaves the device in fallback mode.

### Layer 2 — Text → Structured Entry (Language Understanding)
- **Deterministic rules engine** (`src/lib/parser/`): tokenization, Roman-Urdu number words,
  intent classification (sale / credit / payment / stock / undo / question), money/date parsing,
  alias-aware **fuzzy matching** of products and customers with ambiguity thresholds.
- **LLM enhancer** (`/api/parse`, Groq `openai/gpt-oss-120b`, few-shot, temperature 0, JSON mode):
  only *fills gaps* — it can propose a better customer/product match but never overrides
  high-confidence rule output, and never invents numbers. Spoken numbers not present in the
  utterance are rejected by prompt contract + validation.
- **Merge + review:** the merged draft always goes to the review card. Nothing saves without a tap.

### Layer 3 — Shop → Answers (Grounded Assistant)
- `/api/ask` (Groq `openai/gpt-oss-20b`): the question + **pre-computed ledger numbers** are given
  to the model; it phrases the answer but cannot invent balances.
- Offline: `answerLocally()` produces deterministic answers from the same computed data.
- Optional Gemini API as secondary LLM provider.

### Layer 4 — Receipts (OCR)
- `tesseract.js` runs fully on-device; extracted text flows through the same parse → review pipeline.

### Responsible-AI guardrails
- Human confirmation before every write; credit blocks cannot be bypassed by AI.
- Grounded answers (numbers computed first, model only phrases).
- Confidence thresholds → clarifying question instead of guessing.
- Local-first data; API keys server-side only; `.env.local` never committed.
- Fail-safe: if LLM/network fails, rules parser + local answers keep the app fully usable.

### AI / Third-party services used

| Service | Purpose | Where |
| --- | --- | --- |
| Groq — `openai/gpt-oss-120b` | few-shot entry parsing/enhancement | `/api/parse` |
| Groq — `openai/gpt-oss-20b` | assistant answers, Urdu romanization | `/api/ask`, `/api/transcribe` |
| Groq — `whisper-large-v3` | voice transcription fallback | `/api/transcribe` |
| Google Gemini (optional) | LLM fallback | `/api/parse`, `/api/ask` |
| tesseract.js | on-device receipt OCR | `/scan` |
| Web Speech API | on-device speech recognition | client |

---

## 6. Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript 6, Tailwind CSS 3 |
| PWA | Installable, service worker, manifest, offline cache |
| Local storage | IndexedDB (`idb`) — local-first repo |
| Optional cloud | Supabase (Postgres, RLS, RPC functions) |
| AI/ML | Groq API (gpt-oss-120b / gpt-oss-20b / whisper-large-v3), tesseract.js, Web Speech API |
| Charts | recharts |
| Validation | zod |
| Tests | Vitest — 88 unit tests |
| Deployment | Vercel (live demo), GitHub (public repo) |

---

## 7. Architecture

```
Input:  🎤 voice ─┐
        ⌨️ text  ─┼─→ parser pipeline: normalize → tokens → intent/entities → fuzzy match
        📷 OCR   ─┘                       │
                                          ▼
                        optional LLM enhancer (/api/parse, gpt-oss-120b)
                                          │ (merge; never overrides confidently parsed fields)
                                          ▼
                              review card  →  one-tap confirm
                                          ▼
                 commit-core (evaluateCommit — one pure planner, both modes)
                 ├── credit check inside transaction (80% warn / 100% block + audited override)
                 ├── FIFO payment allocation, stock movements, alerts, audit log
                 └── repo: LocalRepo (IndexedDB, single transaction)  |  SupabaseRepo (SQL RPCs
                     mirroring the same rules)   +  offline queue with idempotency keys

Assistant: question → computed ledger facts → LLM phrases (gpt-oss-20b) → spoken reply
```

- `src/lib/parser/` — Roman-Urdu rules parser (intents, items, money, customers, variants)
- `src/lib/ledger/` — balances, FIFO allocation, credit assessment, reconcile
- `src/lib/intel/` — hot items, low stock, missed demand, customer stats, local answers, dup-name guard
- `src/lib/repo/` — repo interface + LocalRepo + SupabaseRepo + demo seed
- `src/lib/offline/` — idempotency, queue, sync (re-checks credit on replay)
- `src/app/(app)/` — home · munshi · khata · stock · bahi · alerts · reports · settings · scan
- `src/app/api/` — parse · ask · transcribe · commit · reverse · ocr · share · export · cron · push
- `src/app/s/[token]/` — public read-only statement (expiring link)
- `supabase/` — migrations (schema, RLS, views, RPCs) + seed

Cloud and local modes share identical rules: the SQL RPCs mirror `commit-core.ts`, so behavior is
byte-for-byte consistent whether online or offline.

---

## 8. Security & Privacy

- **Authentication:** shop owner sign-in with password (PBKDF2-SHA256, 120,000 iterations,
  per-user salt) or PIN; live strength checklist during setup.
- **Multi-tenant isolation:** Supabase Row-Level Security by shop membership.
- **Secrets:** LLM keys live server-side only; `.env.local` is gitignored and never committed
  (verified in repo history).
- **Data minimization:** audio is never stored; OCR runs on-device; only the text needed for a
  request is sent to the LLM, and only when online with a configured key.
- **Auditability:** credit-limit overrides and reversals require reasons and are logged.

---

## 9. Demo Walkthrough (what judges will see)

1. Open **https://munshi-hiii14.vercel.app** → tap **"Demo dekhein — Ali Cloth House"**
   (30 days of realistic seed data).
2. **Voice entry:** say/type *"Ali ko 2 lawn suit udhaar likh do"* → draft appears with the item,
   quantity, and **price auto-filled from stock** → tap Save.
3. **Duplicate-name safety:** type *"Ali Raza ko 1 suit udhaar"* where two customers share the
   name → Munshi asks for the last 4 digits of the phone → correct khata opens.
4. **Credit guard:** attempt an entry that crosses the limit → blocked with an audited
   override option.
5. **Ask:** *"Aaj ka hisaab suna do"* in the assistant → grounded answer, spoken aloud.
6. **Statement:** open a khata → Statement → WhatsApp / link (QR) / print.
7. **Offline & languages:** switch to English/اردو; stop network — entry still works from rules
   parser + local answers.

---

## 10. Testing & Quality

- **88 unit tests** across parser, ledger, intelligence, guide search, security and duplicate-name
  matching (`npm test`) — all green.
- **`tsc --noEmit`** clean (strict TypeScript).
- **`npm run build`** — production build green, all routes compiled.
- Live production checks: login page renders, AI parse endpoint verified with `llm_used=true`.

---

## 11. Deployment

- **Repo:** GitHub public — https://github.com/ChRehman-Abdulrehman/munshi
- **Host:** Vercel (production) — https://munshi-hiii14.vercel.app
- **Env:** `GROQ_API_KEY` set for Production + Preview. App also runs fully with **no keys**
  (local mode: rules parser, on-device OCR, browser speech).
- **Local run:** `npm install && npm run dev` → http://localhost:3000 → "Demo dekhein".

---

## 12. Challenges Faced & Solved

| Challenge | Solution |
| --- | --- |
| Roman Urdu is unstructured and code-switched | Purpose-built rules parser + number-word lexicons + fuzzy matching with ambiguity thresholds |
| LLMs hallucinate numbers | LLM only enhances; never invents values; review card + confidence gates; grounded ask-context |
| Duplicate customer names | Last-4-digits-of-phone disambiguation flow |
| Offline correctness with credit limits | Single IndexedDB transaction; offline queue with idempotency keys; credit re-checked on replay |
| Urdu speech recognition inconsistent across browsers | Web Speech primary, Whisper (Groq) fallback |
| Vercel deployment protection hiding the demo | Disabled SSO protection for public judging; verified with unauthenticated requests |

---

## 13. Known Limitations

- LLM parse/ask/Whisper require internet + Groq key; graceful fallback exists (rules + local answers).
- Speech accuracy varies with mic/noise; Chromium browsers recommended.
- Very freeform Roman Urdu may need one clarifying question (intentional, for accuracy).
- Handwritten Urdu receipts are not supported (printed only).
- Local mode is single-device; multi-device/roles come with the optional Supabase mode.
- Free-tier LLM rate limits during heavy live demos.

## 14. Future Roadmap

- Urdu script input/output polish + Sindhi/Punjabi dialects; SMS reminders for overdue khata;
  WhatsApp bot channel (same parser behind it); offline speech model (Vosk); multi-user roles;
  supplier ordering; credit scoring from repayment history (with consent).

---

## 15. Team Contributions — Logicdev.AI

| Member | Email | Contribution |
| --- | --- | --- |
| **Muhammad Abdulrehman** (Team Lead) | chr142365@gmail.com | Problem research, product design, ledger/credit core, AI integration, final QA & submission |
| Asifa Arooj | asifaarooj81@gmail.com | Roman Urdu/Urdu copywriting, 3-language UI review, usability testing |
| Maira Khan | mairakhan7833@gmail.com | UI/UX design, screenshots & visual testing, test scenarios |
| Muhammad Taha | 2muhammadtaha2@gmail.com | Parser & voice test cases, end-to-end testing, demo data |
| Laiba Tahir | laibatahir10999@gmail.com | Documentation, demo video planning & narration |

## 16. Acknowledgements

Open-source: Next.js, React, TypeScript, Tailwind CSS, lucide-react, recharts, zod, idb, qrcode,
tesseract.js, Vitest. APIs: Groq (gpt-oss-120b, gpt-oss-20b, whisper-large-v3), optional Google
Gemini, browser Web Speech API. Supabase used as optional cloud backend. All third-party
components retain their original licenses (MIT / Apache-2.0).

---

## 17. Judging Rubric Mapping (each criterion 25%)

| Criterion (25% each) | What judges look for | How Munshi delivers | Evidence |
| --- | --- | --- | --- |
| **Innovation** | Originality, creativity, AI solution's value | Voice-first Roman-Urdu bookkeeping is new in this market; 3-layer AI (speech → understand → grounded answers) with human-in-the-loop; auto-price and duplicate-name disambiguation; LLM as enhancer, not a gimmick | Live demo voice entry; `/api/parse` LLM enhancement; parser + fuzzy matching; repo architecture |
| **Impact** | Problem importance, beneficiaries, real-world value | Serves ~5M small Pakistani retailers; targets real money loss, disputes, credit risk, digital-literacy gap; offline-first for real shop conditions; 3 languages; PWA install with no app store | Problem section; feature set (credit guard, statements, alerts); demo on a phone |
| **Feasibility** | Practical implementation, working functionality, growth potential | Fully working end-to-end app (not mockups): 88 passing tests, clean build, deployed live; offline mode with idempotent sync; credit checks in-transaction; clear roadmap (WhatsApp bot, SMS, dialects) | Live URL; test suite; Vercel deployment; architecture notes; roadmap section |
| **Presentation** | Clarity, demo quality, organization | Complete README + documentation + submission template; 60–90s demo script; screenshots of every screen; judge Q&A preparation | README, DOCUMENTATION.md, SUBMISSION.md, docs/screenshots, demo video |

---

*Document version 1.0 — prepared for NYP AI Hackathon 2026. All links in this document are public.*
