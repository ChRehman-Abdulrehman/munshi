# NYP AI Hackathon 2026 — Official Submission

## Submission template (fill the URL fields before submitting)

| Field | Value |
| --- | --- |
| **Project Name** | Munshi — Bolo, likho, poochho |
| **Team Name** | Logicdev.AI |
| **Team Members** | Muhammad Abdulrehman (Team Lead) — chr142365@gmail.com · Asifa Arooj — asifaarooj81@gmail.com · Maira Khan — mairakhan7833@gmail.com · Muhammad Taha — 2muhammadtaha2@gmail.com · Laiba Tahir — laibatahir10999@gmail.com |
| **Problem Statement** | Small Pakistani retailers run on paper udhaar khata: lost credit entries, no visibility, English-only software, no credit limits. |
| **Solution Overview** | Voice-first PWA: shopkeeper speaks Roman Urdu/Urdu/English, Munshi turns it into a structured khata entry (auto price from stock), answers shop questions with grounded numbers, enforces credit limits, works offline. |
| **Live Demo URL** | https://munshi-hiii14.vercel.app |
| **GitHub Repository URL** | https://github.com/ChRehman-Abdulrehman/munshi |
| **Demo Video URL** | _[fill after recording]_ |
| **AI Tools Used** | Groq API — `openai/gpt-oss-120b` (entry parsing), `openai/gpt-oss-20b` (assistant answers / romanization), `whisper-large-v3` (voice transcription); Google Gemini API (optional LLM fallback); tesseract.js (on-device OCR); Web Speech API (on-device STT). |

### Known Limitations (paste into form)

- LLM parse/ask/Whisper require internet + a Groq API key; offline mode falls back to the rules parser and deterministic local answers.
- Speech accuracy depends on microphone/noise; Chromium-based browsers recommended.
- Urdu handwritten-receipt OCR not supported (printed receipts only).
- Local mode is single-device; multi-device/roles need the optional Supabase mode.
- Free-tier LLM rate limits may apply during heavy live demos.

---

## Judge Q&A preparation (technical questions)

**Q: Where exactly is AI used?**
A: Three layers — (1) speech: Web Speech on-device, Whisper fallback; (2) parsing: fuzzy rules
parser + few-shot LLM (gpt-oss-120b) that only *enhances* a draft, never saves; (3) assistant:
gpt-oss-20b answers with numbers pre-computed from the ledger (grounded). Plus tesseract.js OCR.

**Q: Why not send everything to the LLM?**
A: Determinism + privacy + offline. The rules parser is fast, free, and works without internet;
the LLM fills gaps when available. Every write still requires the owner's confirmation.

**Q: How do you stop the AI from inventing balances?**
A: Answers are computed from the ledger (balances, FIFO allocation) and passed to the model as
context; offline answers are fully deterministic (`answerLocally`).

**Q: Model/API stack?**
A: Groq `openai/gpt-oss-120b` (parse), `openai/gpt-oss-20b` (ask/romanize), `whisper-large-v3`
(transcribe), optional Gemini fallback, tesseract.js + browser Web Speech on-device.

**Q: What about privacy?**
A: Local-first IndexedDB, keys server-side only, audio/images never stored, text sent to LLM only
when online and configured, PBKDF2 password hashing.

---

## Pre-submission checklist

- [x] `git init` + first commit (honest history, no backdating) → push to **public** GitHub repo
- [x] Deploy to Vercel → set `GROQ_API_KEY` env var → test live demo URL end-to-end
- [x] Capture screenshots into `docs/screenshots/`
- [ ] Record 60–90s demo video → upload (YouTube unlisted / Drive link)
- [ ] Fill the template table above (team name, URLs) and the official submission form
- [ ] Verify: `.env.local` NOT in repo, README complete, live link works in incognito
- [ ] Send judges repo access (public, or add them if private) before the deadline
