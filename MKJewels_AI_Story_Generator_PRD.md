# PRD: MKJewels AI Jewelry Story Generator

## 1. Overview
An internal admin tool for MKJewels staff. A staff member uploads a photo of a jewelry piece (ring, necklace, earrings, bangle, etc.), and the system uses AI to (a) identify the piece — type, metal, stones, motifs — and (b) generate a short, emotionally engaging brand story about it, in MKJewels' voice. Staff can review, edit, and copy/export the story for use on the website, social media, or in-store.

This is **not** customer-facing in v1. It's a productivity tool for the merchandising/content team.

## 2. Goals
- Cut the time staff spend writing product descriptions/stories from scratch.
- Produce consistent, on-brand, premium-feeling copy.
- Keep cost per generation low (this will be run for hundreds/thousands of SKUs).
- Simple enough that non-technical staff can use it without training.

## 3. Non-Goals (v1)
- No customer-facing storefront integration (can be a fast-follow).
- No automatic publishing to the live website/Shopify (MK Jewels' site appears to run on a Shopify-like platform) — staff will copy/export.
- No multi-user roles/permissions system — basic shared login is fine for v1.
- No video or 3D jewelry support — static images only.

## 4. Users
- MKJewels content/merchandising staff (small team, Mumbai/Ahmedabad).
- Possibly the founder/marketing lead reviewing output before publishing.

## 5. Core User Flow
1. Staff logs into the admin dashboard.
2. Uploads one or more jewelry photos (drag-and-drop or file picker).
3. System analyzes each image and detects: category (ring/necklace/earrings/bangle/bracelet/pendant/mangalsutra/chain), primary material (gold/diamond/CZ/mixed), apparent karat/tone if visible (yellow/rose/white gold), notable motifs (floral, peacock, leaf, geometric, traditional/antique, filigree, etc.), and style (everyday/bridal/festive/statement).
4. System generates a story (2 versions: a short ~40-60 word version for product cards, and a longer ~120-180 word version for product pages) grounded in those detected attributes, in MKJewels' brand voice.
5. Staff reviews the output side-by-side with the image, can regenerate, manually tweak the detected attributes (e.g. correct "ring" to "pendant" if misdetected) and regenerate, or hand-edit the text directly.
6. Staff exports: copy-to-clipboard, or download as CSV/text (SKU, attributes, short story, long story) for bulk upload elsewhere.
7. (Optional, nice-to-have) Save history of generated stories per image so staff can revisit past work.

## 6. Brand Voice Inputs
To ground the AI, we'll build a brand voice brief from what's publicly known about MKJewels:
- Est. 1999, 25+ years, family-run, founder Ram Raimalani, factories/showrooms in Mumbai (Andheri, Bandra) and Ahmedabad.
- Positioning: craftsmanship, trust, transparency, certified jewelry (BIS hallmarked gold, IGI certified diamonds), made-to-order, lifetime exchange/buyback.
- Tone: warm, premium but accessible (not ultra-luxury/exclusive elitist), rooted in Indian tradition blended with modern design, family-feeling.
- Target customer: Indian women (and some men/kids) shopping for everyday wear, festive/occasion wear, bridal, and gifting.

This brief becomes a fixed system prompt section so every generated story sounds like MKJewels, not generic AI jewelry copy.

**You'll need to supply or confirm:** logo files, brand color hex codes, and any existing style guide/tone-of-voice doc, plus 5-10 example product photos with captions you personally like (or dislike) as calibration examples for the AI.

## 7. AI Architecture
**Decision: single multimodal call**, since it's cheaper and simpler than a two-step pipeline, and quality should be sufficient for this use case.

- One call to a vision-capable LLM (e.g. Gemini/OpenAi with image input) per upload.
- Single prompt does both jewelry analysis AND story writing in one response, returned as structured JSON (attributes + short story + long story) so the UI can render them separately.
- If staff override detected attributes, a cheap follow-up text-only call regenerates the story using the corrected attributes (no need to re-run vision).
- This keeps cost to roughly one image-input API call per piece, with corrections being cheap text-only calls.

## 8. Tech Stack (recommendation)
- **Frontend/Backend:** Next.js (React) — single codebase, easy for Codex to scaffold, good for an internal dashboard with API routes.
- **AI:** Anthropic API (Claude with vision) via server-side API route — never expose API key client-side.
- **Storage:** Start with a simple database (SQLite or Postgres, e.g. via Supabase) to store: image reference, detected attributes, generated stories, edit history, timestamps, staff user.
- **Image storage:** Cloud object storage (S3-compatible) or Supabase storage — don't store image blobs in the DB.
- **Auth:** Simple shared password or basic email/password login (e.g. NextAuth) — no need for complex roles in v1.
- **Hosting:** Vercel (pairs well with Next.js) for frontend/backend; Supabase for DB+storage if chosen.

This stack is a recommendation, not a constraint — Codex can adapt if you/your dev prefer something else.

## 9. Data Model (draft)
**Piece**
- id, image_url, sku (optional, manual entry), uploaded_by, created_at

**Generation**
- id, piece_id, detected_category, detected_material, detected_motifs (array), detected_style, short_story, long_story, model_version, created_at, is_edited (bool), final_short_story, final_long_story

## 10. Prompt Design (high-level)
System prompt includes: MKJewels brand brief (section 6), instructions to identify category/material/motifs/style from the image, instructions to write two story lengths, constraints (no overpromising/false certification claims, no fabricated specific gemstone counts/carat weights unless visibly obvious, avoid generic clichés, write distinctly per piece based on what's visually seen — e.g. an actual peacock motif vs. a plain band shouldn't get the same story).

Output format: strict JSON so the frontend can parse reliably (e.g. `{category, material, motifs, style, short_story, long_story}`).

## 11. Success Metrics
- Time to produce a usable story per piece (target: under 1 minute including review).
- % of generated stories used with no or minor edits.
- Staff satisfaction / adoption (are they actually using it weekly vs. falling back to manual writing).

## 12. Open Items / Decisions Needed From You
1. **Brand assets** — logo files, color hex codes, font preference (for the dashboard UI only, not customer-facing).
2. **Volume** — roughly how many images/month will be processed? (affects cost estimate and whether bulk-upload matters for v1).
3. **Existing catalog data** — do you have a product spreadsheet/CSV with SKU, category, material already, that stories should be linked to?
4. **Hosting/infra preference** — do you already have a Vercel/AWS/Supabase account, or should Codex set up from scratch?
5. **Review/approval step** — should there be a "draft vs. approved" status, or is copy-paste-and-edit enough for v1?

## 13. Build Plan (phased prompts for Codex)
**Phase 1 — Scaffold:** Next.js app, basic auth, file upload UI, image storage wired up.
**Phase 2 — AI integration:** server-side API route calling Claude vision with the brand-voice prompt, returns structured JSON, displayed in UI.
**Phase 3 — Review & edit UI:** side-by-side image + editable story fields, regenerate button, manual attribute override + cheap regenerate.
**Phase 4 — Persistence & export:** save to DB, history view, CSV/copy export.
**Phase 5 — Polish:** MKJewels branding on the dashboard UI, error handling, loading states, basic usage logging.

Each phase will get its own detailed prompt for you to feed into Codex once you confirm the open items above.
