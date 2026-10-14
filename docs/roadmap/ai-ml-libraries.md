# AI/ML roadmap — where AI earns its place in Draazy

> **Status:** proposal, grounded in the code on `feature/backend-integration` (2026-10-13). Nothing here
> is built yet unless §1 lists it or an item is marked **Shipped**. Every library listed is open source under a permissive licence
> (Apache 2.0 / MIT / PostgreSQL).
>
> **Companion docs:** [platform-architecture.md](../system/platform-architecture.md) (ADR-019
> badge-not-gate, ADR-021 hosting), [search-listings.md](../flows/consumer/search-listings.md),
> [list-property-wizard.md](../flows/consumer/list-property-wizard.md),
> [property-verification.md](../flows/admin/property-verification.md).

---

## 0. Ground rules every AI feature must respect

| Constraint | Consequence |
|---|---|
| **Hosting budget ~$25/mo** (Cloud Run + Supabase sandbox, DO candidate — ADR-021) | No always-on GPU. Server-side inference is CPU-only, small models, and runs in a **background job**, never on the request path. |
| **Provider-seam pattern, zero paid keys in dev** | Any model/LLM call sits behind an interface with a deterministic dev stub, like the OTP/storage/payments seams. |
| **Mobile-first India** — mid-range Android, metered data | Nothing over ~10 MB on a consumer route. Models load lazily (dynamic `import()`, as [face.js](../../frontend/src/lib/identity-verification/face.js) already does), run in a worker, and are cached by the PWA service worker. |
| **DPDP Act 2023** — photos, ID documents, chats are personal data | They never go to a third-party AI API. Self-hosted models only. |
| **Badge-not-gate + maker-checker** (ADR-019) | AI **flags and suggests**; a human approves, rejects, or hides. No auto-reject. |
| **CSP** | `'wasm-unsafe-eval'` is already allowed and guarded by `check-csp.mjs` (MediaPipe needs it). Models are self-hosted under `public/models/` via [fetch-models.mjs](../../frontend/scripts/fetch-models.mjs) — no runtime model CDN. |
| **Postgres portability** | `pg_trgm`, `unaccent` and `pgvector` are available on both Supabase and DO Managed Postgres, so they don't add lock-in. |

---

## 1. Already in the codebase — build on it, don't replace it

| Capability | Where | Implication |
|---|---|---|
| Rule-based natural-language search ("2bhk under 80 lakh near Baner") | [listingsSmartQuery.js](../../frontend/src/pages/consumer/listings/listingsSmartQuery.js) `parseSmartQuery` | Keep the rules; an LLM is only a fallback for what they leave over (C2). |
| Free-text match: word-by-word `LIKE '%w%'` over title/locality/society/type | [PropertySpecs.java](../../backend/src/main/java/com/draazy/api/catalog/property/PropertySpecs.java) `publicTextSearch` | No typo tolerance, and a leading-wildcard `LIKE` can't use a btree (A1). |
| Society search: substring `LIKE` | [SocietySpecs.java](../../backend/src/main/java/com/draazy/api/catalog/society/SocietySpecs.java) | Typos split one building into two societies (A2). |
| "Similar homes": geo radius + BHK ±1 + price band | [SimilarListings.java](../../backend/src/main/java/com/draazy/api/catalog/property/SimilarListings.java) | Good hard filters; a semantic re-rank comes later (B4). |
| Duplicate photos: 64-bit **average hash** + LSH bands | [PhotoHash.java](../../backend/src/main/java/com/draazy/api/catalog/property/PhotoHash.java), `ListingDuplicateClusterService` | aHash misses crops and re-angled shots (B2). Desk dismissals are free training labels. |
| Contact-leak filter for **text** (digits, Hindi/Marathi number words, emails, handles) | [NoContactDetails.java](../../backend/src/main/java/com/draazy/api/catalog/listing/NoContactDetails.java), client mirror [contactDetails.js](../../frontend/src/pages/consumer/list-property/contactDetails.js) | **Photos are not covered** — the contact gate's remaining back door (B1). |
| "Write it for me" description draft (template) | [describe.js](../../frontend/src/pages/consumer/list-property/describe.js) | Factual and free; an LLM only polishes/translates it (C1). |
| Selfie guidance: **MediaPipe** FaceLandmarker + brightness/sharpness probe | [face.js](../../frontend/src/lib/identity-verification/face.js), [capture.js](../../frontend/src/lib/identity-verification/capture.js) `readFrameQuality` | `@mediapipe/tasks-vision` is already a dependency — reuse it for listing photos (A3, B2, B3). |
| Photo re-encode in a worker | [image.worker.js](../../frontend/src/lib/uploads/image.worker.js) | The decoded frame is already in hand — the cheapest place to run photo checks. |
| Asking rate per sq ft by locality | [LocalityService.java](../../backend/src/main/java/com/draazy/api/catalog/locality/LocalityService.java) `marketRate` | Basis of a fair-price signal without ML (B5). |
| Locality demand telemetry, PostHog product analytics | `recordSignal`, [productAnalytics.js](../../frontend/src/lib/productAnalytics.js) | Measure every feature below with what's already wired. |

---

## 2. Opportunities at a glance

Ranked by value ÷ effort. **S** ≈ days, **M** ≈ 1–2 weeks, **L** ≈ 3+ weeks.

| # | Opportunity | Who benefits | Library | Runs in | Effort |
|---|---|---|---|---|---|
| A1 | Typo-tolerant, index-backed listing text search | Seekers · **performance** | `pg_trgm`, `unaccent`, Postgres FTS | DB | S |
| A2 | "Did you mean…" society match before minting a new one | Owners · data quality | `pg_trgm` | DB | S |
| A3 | Listing photo coach: dark/blurry hints, blur faces | Owners · approval speed | MediaPipe FaceDetector (shipped pkg) | Browser worker | S–M |
| A4 | Voice search in Hindi/Marathi/English | Seekers (mobile) | Web Speech API (native) | Browser | S |
| A5 | FAQ deflection as the user types a support ticket | Seekers · support load | MiniSearch | Browser | S |
| B1 | Phone numbers / competitor watermarks **inside photos** | Contact gate · reviewers | Tesseract.js → Tess4J / RapidOCR | Reviewer's browser → job | M |
| B2 | Crop- and angle-robust duplicate detection | Reviewers · supply quality | pHash (JImageHash) → MediaPipe ImageEmbedder + pgvector | JVM / browser + DB | M |
| B3 | Room tagging, smart cover, "add a kitchen photo" nudge | Owners · seekers | SigLIP (ONNX) → MediaPipe Model Maker | Job → browser | M–L |
| B4 | Semantic/hybrid search and better similar homes | Seekers | multilingual-e5-small + ONNX Runtime Java + pgvector | Job + DB | L |
| B5 | Fair-price signal ("12% above similar 2 BHKs in Baner") | Seekers · owners pricing | SQL percentiles → LightGBM → ONNX | DB → JVM | S → L |
| C1 | Polished descriptions + Marathi/Hindi versions | Owners · regional seekers | Qwen3 via llama.cpp/Ollama; IndicTrans2 | Job | M |
| C2 | LLM fallback for unparsed smart-search text | Seekers | Same LLM seam, JSON-schema output | Server | M |
| C3 | Staff copilot: ticket reply drafts grounded in FAQs | Support staff | Same LLM seam + pgvector | Server | M |

---

## 3. Tier A — no model, or a model we already ship

### A1. Typo-tolerant, index-backed listing search
- **Today:** `publicTextSearch` ANDs a `LIKE '%word%'` per word across four columns. "Koregoan", "Hinjwadi"
  vs "Hinjewadi", "Magarpata" return nothing, and a leading-wildcard `LIKE` can't use a btree —
  V02 already notes that substring search "needs pg_trgm and a GIN index".
- **Do:** one migration — `CREATE EXTENSION pg_trgm, unaccent`; a GIN `gin_trgm_ops` index on
  `lower(title || ' ' || locality || ' ' || society)`; keep the word-by-word AND, but match each word
  with `word_similarity(word, doc) > 0.4` (`<%` operator, index-backed) instead of `LIKE`. Optionally add a
  generated `tsvector` column for stemming ("furnished" ↔ "furnishing"). Keep the existing 120-char /
  6-word caps.
- **Locality aliases:** add a small `aliases text[]` per locality (Devanagari spelling, old names) and
  match it the same way — cheaper and more exact than a transliteration model.
- **Performance:** turns a sequential scan per keystroke into a GIN index lookup.
- **Measure:** zero-result rate for searches with `q`; p95 latency of `GET /properties?q=`.
- **Shipped (first step):** with `pg_trgm` enabled, a letter-only word of 5+ letters that no live
  listing matches exactly falls back to `word_similarity ≥ 0.5` (a fallback, because "balewadi" vs
  Kalewadi scores as high as a real typo). Not index-backed yet — the GIN index, `unaccent` and
  aliases remain.

### A2. Society "did you mean" before minting
- **Today:** `SocietySpecs` does a substring `LIKE`; its own comment warns that a duplicate society
  "splits one building's listings, followers and reviews across two cards".
- **Do:** on `SocietyMintRequest`, return the top 3 `similarity(name, :q) > 0.45` matches in the same
  locality and ask "Is it one of these?" before creating. Same `pg_trgm` index as A1.

### A3. Listing photo coach in the wizard
- **Today:** only size and resolution are checked; dark, blurry or people-filled photos reach the
  reviewer, who asks for a retake — a full round trip.
- **Do:** in [image.worker.js](../../frontend/src/lib/uploads/image.worker.js), where the frame is
  already decoded, compute brightness and sharpness (the `readFrameQuality` maths). Show a one-line tile
  hint ("Looks dark — retake in daylight?"), never a block. Run MediaPipe **FaceDetector** (BlazeFace,
  ~200 KB, same package already shipped) and offer "Blur faces" — useful for tenant privacy under DPDP.
- **Measure:** first-pass approval rate; "ask for info: photos" rate on the verification desk.
- **Shipped (first step):** dark/blurry tile hint ([photoLook.js](../../frontend/src/lib/uploads/photoLook.js)).
  Face blur remains.

### A4. Voice search
- **Do:** a mic button on the search box using the browser's native `SpeechRecognition`
  (`hi-IN`, `mr-IN`, `en-IN`), with the transcript fed into `parseSmartQuery`. Hide where unsupported
  (Firefox, some iOS versions).
- **Caveat:** Chrome sends the audio to Google's recognition service. It's user-initiated, but the
  privacy notice should say so. A self-hosted Whisper (MIT) only if usage justifies a server.

### A5. FAQ deflection on the support form
- **Today:** [FaqSection.jsx](../../frontend/src/pages/consumer/support/FaqSection.jsx) is a static
  list with no search, and the ticket form doesn't suggest answers.
- **Do:** index the already-fetched `getFaqs()` with **MiniSearch** (MIT, ~7 KB gz, fuzzy + prefix) and
  show the top 3 answers under the subject field as the user types.
- **Measure:** tickets per 1,000 support-page visits.
- **Shipped:** without MiniSearch — a keyword match over the loaded FAQs is enough at ~10 entries
  ([suggestFaqs.js](../../frontend/src/pages/consumer/support/suggestFaqs.js)). Revisit if FAQs grow
  past a few dozen.

---

## 4. Tier B — small models, background jobs, reviewer aids

### B1. Contact details and competitor watermarks inside photos
- **Why first in Tier B:** the contact gate is the business model, and `NoContactDetails` covers text
  only. Owners routinely put a phone number or a NoBroker/MagicBricks/99acres watermark into a photo.
- **Step 1 (zero server cost):** when `PropertyReviewModal` opens, run **Tesseract.js** (Apache 2.0,
  `eng`+`hin`+`mar` traineddata) over the listing's photos **in the reviewer's browser** — a trusted,
  desktop client. Run the text through the same rules as `hasContactDetails` plus a competitor-brand list,
  and show a chip: "Photo 3 may contain a phone number". Lazy-load it on the back-office route only.
- **Step 2 (at volume):** the same check as a background job after upload, using **Tess4J** (Apache 2.0)
  or **RapidOCR** (PaddleOCR models on ONNX Runtime, Apache 2.0 — better on stylised watermark text).
  The job only **holds the photo for review**; it never rejects.
- **Measure:** leaks caught per 1,000 new listings; reviewer time per listing.

### B2. Stronger duplicate photo detection
- **Today:** a 64-bit average hash. It catches re-uploads, but misses crops, mirrors, re-angled shots of
  the same room and photos re-saved with a different tone curve — the typical broker re-post.
- **Step 1:** switch to a **perceptual (DCT) hash** — JImageHash (MIT) or ~40 lines in `PhotoHash`.
  It keeps the band scheme; backfill with a one-off job.
- **Step 2:** compute a **MediaPipe ImageEmbedder** vector (MobileNet-V3, ~4 MB, same package) in the
  upload worker, store it in **pgvector**, and cosine-match within the locality. Embeddings catch
  "same flat, different photo", which no hash can.
- **Labels for free:** `ListingDuplicateDismissal` rows are reviewer-confirmed "not a duplicate" pairs
  — use them to tune the threshold and track precision.

### B3. Room tagging, smart cover and gallery nudges
- **Value:** order the gallery (living room first), suggest the cover, nudge "Add a kitchen photo"
  (listings with complete room coverage convert better), and add room tabs on the detail page.
- **Step 1 — bootstrap labels:** a nightly job runs **SigLIP** (Apache 2.0) zero-shot through
  **ONNX Runtime Java** (MIT) with prompts like "a photo of a bedroom / kitchen / bathroom / balcony /
  building exterior / floor plan". Reviewers correct wrong tags in the review modal.
- **Step 2 — go on-device:** train a small classifier on those labels with **MediaPipe Model Maker**
  (Apache 2.0) and run it in the upload worker for instant tagging. The ONNX job then retires.

### B4. Semantic/hybrid search and better similar homes
- **Value:** "peaceful society with a big garden near Hinjewadi phase 1" finds listings that say
  "landscaped lawn, quiet lane", and similar homes respect style and amenities, not only distance.
- **Model:** **multilingual-e5-small** (MIT, 384-dim, ~120 MB int8) — handles English, Hindi,
  Marathi and Hinglish in one space. Tokenise with **DJL HuggingFace tokenizers** (Apache 2.0), infer with
  **ONNX Runtime Java**.
- **Store:** `pgvector` column + HNSW index. Embed **on write** (a job after create/edit), never on read
  except for the one query string.
- **Rank:** hybrid — A1's trigram/FTS score and vector distance fused with Reciprocal Rank Fusion in
  SQL — inside the existing `publicSearch` floor and ahead of the existing `relevanceFirst` boosts.
  `SimilarListings` keeps its hard geo/BHK/price filters and re-ranks the pool by cosine.
- **Prerequisite:** A1. **Cold start:** the JVM loads the model only in the job runner, not in the
  web instance, so Cloud Run cold starts don't grow.

### B5. Fair-price signal
- **Step 1 (no ML):** extend `marketRate` to `percentile_cont` by locality × BHK × deal over live
  listings. Show "Asking rent is in the usual range for 2 BHKs in Baner" on the detail page and "Similar
  flats ask ₹X–Y" on the wizard's price step. Hide below a minimum sample.
- **Step 2 (when data exists):** finalised deals already record `agreed_price`. Once there are a few
  thousand, train **LightGBM** (MIT) offline on area, floor, age, furnishing, amenities and distance;
  export with `onnxmltools` and serve through ONNX Runtime Java. Asking prices alone are too noisy to
  train on.

---

## 5. Tier C — LLMs, only behind a seam and only async

**Serving:** **llama.cpp** / **Ollama** (MIT) or **vLLM** (Apache 2.0); all expose an
OpenAI-compatible API, so the Java side is a plain `RestClient` behind an `LlmProvider` seam with a
canned dev stub — no AI framework needed for a handful of prompts. **Models:** **Qwen3** 4B–8B
(Apache 2.0) or **Phi-4-mini** (MIT).
**Cost reality:** a GPU box breaks the hosting envelope. A 4B model, 4-bit, on CPU gives roughly
5–15 tokens/s — fine for queued jobs, too slow for interactive chat. That's why every item below is async.

### C1. Better descriptions, in the reader's language
- Feed only the structured fields `describe.js` already uses; the model rewrites the template draft. The
  output must pass `NoContactDetails`, and the owner sees and edits it before saving — no invented facts.
- Marathi/Hindi versions with **IndicTrans2** (MIT, AI4Bharat) — purpose-built for Indic languages and
  stronger than a general LLM at it. Store per language; i18next already handles the UI side.

### C2. Fallback for unparsed smart-search text
- **First** log the remainders `parseSmartQuery` forwards as `?q=` (PostHog event). Most gaps will be
  new rules, not AI. Only for remainders that still miss, call the LLM with a JSON-schema-constrained
  output (llama.cpp grammars / Ollama structured outputs) that can only produce known filter keys.

### C3. Staff copilot for support
- Draft a reply to a ticket from the FAQ/help corpus (RAG over pgvector from B4). Staff edit and send;
  nothing is auto-sent.

---

## 6. Performance playbook for any AI feature

1. **Precompute on write, read from an index.** Embeddings, tags, hashes and OCR results are columns,
   filled by a job. Search reads them like any other column.
2. **Ship the cheapest layer first.** Postgres extension → native browser API → already-shipped
   MediaPipe → new model.
3. **Lazy-load, worker, cache.** Dynamic `import()` per route, inference off the main thread, and a
   `runtimeCaching` rule in `vite-plugin-pwa` for `/models/*` so a model downloads once per device.
4. **Keep models out of the consumer critical path.** No model on the home, search or detail routes'
   initial load. Back-office routes can afford more (desktop, Wi-Fi).
5. **Keep the web instance lean.** ONNX Runtime and tokenizers load only in the job runner, so the
   Cloud Run cold start and memory limit are unaffected.
6. **Every feature ships its metric** (named per item above) through PostHog or `recordSignal`, and
   is dropped if it doesn't move it.

---

## 7. Library shortlist

| Library | Licence | Runs in | Used for | In repo? |
|---|---|---|---|---|
| PostgreSQL `pg_trgm`, `unaccent`, FTS | PostgreSQL | DB | A1, A2 | No |
| `pgvector` | PostgreSQL | DB | B2, B4, C3 | No |
| `@mediapipe/tasks-vision` (FaceDetector, ImageEmbedder, ImageClassifier) | Apache 2.0 | Browser (WASM) | A3, B2, B3 | **Yes** (FaceLandmarker) |
| MediaPipe Model Maker | Apache 2.0 | Offline (Python) | B3 | No |
| Web Speech API | Browser-native | Browser | A4 | — |
| MiniSearch | MIT | Browser | A5 | No |
| Tesseract.js | Apache 2.0 | Browser (WASM) | B1 step 1 | No |
| Tess4J / RapidOCR | Apache 2.0 | JVM / sidecar | B1 step 2 | No |
| JImageHash | MIT | JVM | B2 step 1 | No |
| ONNX Runtime Java | MIT | JVM | B3, B4, B5 | No |
| DJL HuggingFace tokenizers | Apache 2.0 | JVM | B4 | No |
| multilingual-e5-small (weights) | MIT | via ONNX | B4, C3 | No |
| SigLIP (weights) | Apache 2.0 | via ONNX | B3 | No |
| LightGBM + onnxmltools | MIT / Apache 2.0 | Offline → ONNX | B5 | No |
| llama.cpp / Ollama / vLLM | MIT / MIT / Apache 2.0 | Server | C1–C3 | No |
| Qwen3 / Phi-4-mini (weights) | Apache 2.0 / MIT | via LLM server | C1–C3 | No |
| IndicTrans2 | MIT | Server | C1 | No |
| pdf.js (`pdfjs-dist`) | Apache 2.0 | Browser | Rasterise PDFs before OCR in B1 | **Yes** |

---

## 8. Suggested sequence

1. **A1 + A2** — one Flyway migration (extensions + GIN indexes) and two spec changes. Biggest
   UX-per-hour win, and a performance win too.
2. **A3, A5, B5 step 1** — frontend-only or SQL-only, each independently shippable.
3. **B1 step 1** — closes the photo back door on the contact gate using reviewer machines.
4. **B2** — pHash first, embeddings after pgvector lands.
5. **B4** — embeddings job + pgvector + hybrid ranking; it also unlocks B2 step 2 and C3.
6. **B3, then Tier C** — once the job runner and the `LlmProvider` seam exist and A–B metrics justify it.
