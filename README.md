# Munshi — Bolo, likho, poochho

Voice-first shop management PWA for Pakistani retailers. Speak (Roman Urdu / اردو / English),
review the draft, save with one tap. Works offline, enforces credit limits, recovers missed demand,
and turns the bahi into shop intelligence.

> Built for **NYP AI Hackathon 2026** under the theme _"Build AI for Real-World Impact"_
> (productivity / community development / digital literacy).
>
> Demo: on the login screen tap **“Demo dekhein — Ali Cloth House”** to load a full 30-day demo shop.

---

## Problem

Small shopkeepers in Pakistan run their business on an _udhaar khata_ (credit ledger) — mostly on
paper or memory. This causes:

- **Lost money:** forgotten udhaar entries, no clear balances, disputes with customers.
- **No visibility:** owner doesn't know today's sale, who is overdue, or what is running out.
- **Literacy + language barrier:** most POS software is English-only, form-heavy, and too expensive
  or complex for a corner shop. The shopkeeper speaks Roman Urdu/Urdu, not SQL forms.
- **Credit risk:** unlimited udhaar to the same customer with no limit, no warning, no record.

## Solution

Munshi is a mobile-first PWA where the shopkeeper simply **speaks**:

> "Ali ko 2 lawn suit udhaar likh do"

Munshi converts that sentence into a structured, reviewable entry (customer, items, quantities,
prices from stock), asks a clarifying question if anything is missing, and saves it with **one tap**
after the owner confirms. It also answers questions about the shop ("Aaj ka hisaab suna do",
"Ali ka khata khol do") in the same language, with numbers computed from the ledger — never invented.

### Key features

- **Voice → entry in 2 seconds.** Web Speech (ur-PK) + rules parser for mixed Roman Urdu/Urdu/English,
  with optional server-side LLM enhancement and Whisper fallback.
- **Never trusts silence.** Missing qty/price becomes a single clarifying question. Amounts are never invented.
- **Auto price from stock.** If the mentioned product exists in stock, its saved selling price is
  filled into the draft automatically — no manual rate entry.
- **Duplicate-name safety.** If two customers share a name, Munshi asks for the last 4 digits of the
  phone number and picks the right khata.
- **Credit guard.** Server-side check inside the transaction (Supabase) / single IndexedDB transaction
  (local). 80%+ warns, 100% blocks; owner override requires a reason and is audited.
- **FIFO payment allocation.** Account payments settle oldest unpaid sales first; sale status is derived, not stored.
- **Reversible, never destructive.** Reverse + restore keep full history with reasons (audit log).
- **Offline-first.** IndexedDB repo by default, or Supabase when keys are provided. Offline commits
  queue and sync with `idempotency_key` dedupe.
- **Intelligence.** Hot items (momentum + restock tips), low stock, missed-demand ranking, overdue khata —
  plus WhatsApp/print PDF statements and expiring share links (QR on the statement).
- **OCR scan.** Receipt photo → line-by-line drafts (tesseract.js, runs on-device; image is not stored).
- **AI assistant panel.** Ask questions on any page — text or mic, answers spoken aloud in the selected language.
- **3 UI languages.** Roman Urdu (default), اردو, English. Switch anytime in Settings.
- **Account security.** Password (PBKDF2-SHA256, 120k iterations) with live strength checklist; PIN fallback.

---

## AI methodology

Munshi is AI-powered at three layers, with a hard human-in-the-loop rule: **the AI suggests, the owner confirms.**

1. **Voice → text (speech recognition)**
   - Primary: browser **Web Speech API** (`ur-PK`) — transcription happens on-device.
   - Fallback: **Groq `whisper-large-v3`** (`/api/transcribe`) when the browser cannot listen; optional
     romanization of Urdu script via `openai/gpt-oss-20b`.
   - Audio is never stored; only text leaves the device in fallback mode.

2. **Text → structured entry (parsing)**
   - A deterministic **rules parser** (`src/lib/parser/`) tokenizes, normalizes, and extracts: intent
     (sale / credit / payment / stock / undo / question), quantities, money (Roman-Urdu number words,
     "do kilo", "1,000 rupay"), dates, and reasons.
   - **Fuzzy matching** resolves product names and customer names against the real catalog/khata
     (alias-aware, scored, with an ambiguity threshold).
   - When online and a key is present, `/api/parse` calls **Groq `openai/gpt-oss-120b`** with a
     few-shot prompt as an _enhancer_: it fills gaps (better product/customer guess) but never
     overwrites high-confidence rule output.
   - The merged draft is **always shown on a review card** — items, qty, price, customer, credit
     impact. Nothing is saved without the owner's one-tap confirm.

3. **Shop → answers (assistant)**
   - `/api/ask` (**Groq `openai/gpt-oss-20b`**) answers freeform questions, but every number in the
     answer is computed from the ledger first and given to the model as context (grounded answers,
     no hallucinated balances).
   - Offline, `answerLocally()` produces deterministic answers from the same computed data.
   - Optional Google **Gemini API** acts as an LLM fallback if configured.

4. **Receipts (OCR)**
   - **tesseract.js** runs fully on-device; the extracted text goes through the same parse → review pipeline.

**Responsible-AI choices**

- Human confirmation before every write; credit blocks can never be bypassed by the AI.
- Answers are grounded in computed ledger numbers (no invented amounts).
- Data is local-first (IndexedDB); only input text is sent to the LLM when online, and API keys stay
  server-side (`.env.local` is gitignored — never committed).
- Confidence thresholds + clarifying questions instead of silently guessing.

### AI / third-party services used

| Service | Purpose | Where |
| --- | --- | --- |
| Groq — `openai/gpt-oss-120b` | few-shot entry parsing/enhancement | `/api/parse` |
| Groq — `openai/gpt-oss-20b` | assistant answers, Urdu→Roman romanization | `/api/ask`, `/api/transcribe` |
| Groq — `whisper-large-v3` | voice transcription fallback | `/api/transcribe` |
| Google Gemini (optional) | LLM fallback for parse/ask | `/api/parse`, `/api/ask` |
| tesseract.js (open source, on-device) | receipt OCR | `src/app/(app)/scan` |
| Web Speech API (browser) | primary on-device speech recognition | client |

Open-source libraries: Next.js 15, React 19, TypeScript 6, Tailwind CSS 3, lucide-react, recharts,
zod, idb (IndexedDB), qrcode, vite/vitest. Supabase is optional (free tier) for cloud mode.

---

## Tech stack

- **Frontend:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · PWA (installable)
- **State/storage:** IndexedDB via `idb` (local-first) · optional Supabase (Postgres + RLS + RPC)
- **AI/ML:** Groq API (gpt-oss-120b / gpt-oss-20b / whisper-large-v3) · tesseract.js OCR · Web Speech API
- **Charts/reports:** recharts · **Validation:** zod · **Tests:** vitest (88 unit tests)

## Architecture

```
src/lib/
  parser/     Roman-Urdu rules parser (intents, items, money, customers, variants)
  ledger/     Balances (net-sum + allocation), FIFO allocation, credit assessment, reconcile
  intel/      Hot items, low stock, missed demand, customer stats, local answers, duplicate-name guard
  commit-core evaluateCommit — one pure planner used by both repo modes
  repo/       Repo interface + LocalRepo (IndexedDB) + SupabaseRepo (RPC) + demo seed
  offline/    Idempotency, queue, sync (re-checks credit on replay)
src/app/
  (app)/      home · munshi · khata · stock · bahi · alerts · reports · settings · scan
  api/        parse · ask · transcribe · commit · reverse · ocr · share · export · cron · push
  s/[token]/  public read-only statement (expiring links)
supabase/     migrations (schema, RLS, views, RPCs) + seed
```

Both repo modes share the same rules: the SQL RPCs mirror `commit-core.ts` (credit check, FIFO
allocation, movements, alerts, audit) so local and cloud behave identically.

---

## Setup steps

```bash
git clone <this-repo-url>
cd munshi
npm install
npm run dev          # http://localhost:3000 — local mode needs zero config
```

Then tap **Demo dekhein** on the login screen. Works fully offline with no API keys
(rule parser + on-device OCR + browser speech).

### Optional: enable the LLM features

```bash
cp .env.example .env.local
# put your Groq key in .env.local:
# GROQ_API_KEY=gsk_...
```

`.env.local` is gitignored and must **never** be committed.

### Optional: Supabase cloud mode

```bash
# fill NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
# apply supabase/migrations/0001_init.sql in the SQL editor, enable email auth
# then run supabase/seed.sql and call: select seed_demo();
```

Server extras (all optional): `SUPABASE_SERVICE_ROLE_KEY` (cron/export/share API), `CRON_SECRET`
(protects `/api/cron`), Telegram/Web-Push vars for notifications.

## Commands

| Command | What |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Vitest — 88 tests (parser / ledger / intel / guide / security / duplicate-name) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run icons` | Regenerate PWA icons (`scripts/gen-icons.mjs`) |

## Screenshots

> Add app captures to `docs/screenshots/` and reference them here before submission.

| Screen | File | Shows |
| --- | --- | --- |
| Login + demo | `docs/screenshots/login.png` | 3-language login, demo shop button |
| Munshi (voice) | `docs/screenshots/munshi.png` | Voice entry draft + review card |
| Khata | `docs/screenshots/khata.png` | Customer balances, credit badges |
| Reports | `docs/screenshots/reports.png` | Sales/products charts |
| Assistant | `docs/screenshots/assistant.png` | AI chat panel answering a question |
| Statement | `docs/screenshots/statement.png` | Public share link with QR |

## Privacy

Your data belongs to your shop only (RLS by membership). Voice is transcribed on-device where the
browser supports it; audio is never stored. OCR runs on-device; only extracted text is used.
LLM calls happen only when a key is configured and the device is online, and only the typed/spoken
text needed for the request is sent. API keys live server-side in env vars, never in the client bundle.

## Known limitations

- LLM parse/ask/Whisper need internet + a `GROQ_API_KEY`; offline falls back to the rules parser and
  deterministic local answers (by design, still fully usable).
- Speech recognition quality varies with microphone/noise; Chromium-based browsers recommended.
- Very freeform Roman Urdu may need one clarifying question — intentional, to avoid wrong entries.
- Urdu **handwritten** OCR is not supported (printed receipts only).
- Local mode is single-device (browser storage); multi-device/roles come with Supabase mode.
- Free-tier LLM rate limits apply during heavy live demos.

## Team

- **[Your Name]** — solo developer: product design, parser/ledger/AI integration, UI (3 languages),
  tests and documentation. (_Update with final team details if more members join._)

## License

Source code in this repository was written for NYP AI Hackathon 2026. Open-source dependencies keep
their original licenses (MIT/Apache-2.0 etc.).
