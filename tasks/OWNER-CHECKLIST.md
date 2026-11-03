# Owner checklist

Things code can't close: secrets, deploy steps, real-device checks, human fact-checks. Tick and delete.

## Secrets and deploy
- [ ] Next deploy log: the security-header smoke check passes (this office network strips headers, so only CI can tell)
- [ ] `sandbox` env secret `SANDBOX_ORIGIN_SHARED_SECRET` + Pages `ORIGIN_SHARED_SECRET` (same value), or the app won't start
- [ ] Deploy `both`, then `curl` a direct non-health route: expect 403
- [ ] Widen `INTERNAL_PROXIES` per `docs/DEPLOY.md` §4 with a real `X-Forwarded-For`
- [ ] Cloudflare WAF managed rules + one `/api/auth/*` rate-limit rule (Bot Fight Mode off)
- [ ] Cloudflare Cache Rule for extensionless photo originals; check the R2 cache header on a real upload
- [ ] Anonymous `/api/flags` on the Pages host should not reach the origin
- [ ] `SANDBOX_GOOGLE_PLACES_SERVER_KEY`; read Google's lat/lng caching terms
- [ ] Google Cloud: the **production** browser key (`VITE_GOOGLE_MAPS_API_KEY`) must allow **Maps Embed API** (the dev key already does), or the property Street View sheet shows Google's error frame; check a FC Road listing's Location tab after deploy
- [ ] Google Cloud: enable **Street View Static API** on the browser key (dev and prod). The dev key returns 403 today, so the Street View tile falls back to a plain row instead of a photo preview. Billable past the free monthly quota
- [ ] Google Maps / Routes / Places key with quota on sandbox, then run the SB-09 checklist rows (7, 157, 186, 187, 259) there (local e2e already loads Maps on `localhost:3322`)
- [ ] Rotate `backend/.env.local` secrets if in doubt (surfaced 2026-08-09)
- [ ] DigitalOcean: add the alert policies and the one free Uptime check from `docs/DEPLOY.md` §8; leave log forwarding off
- [ ] Optional: `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY` for graphify community labels
- [ ] GitHub repo **variables** (not secrets): `VITE_POSTHOG_KEY=phc_BYWgUQHA2LvRkSCRQ4bSDFUdkKWjwRDRsyshdrAW4LzQ`, `VITE_POSTHOG_APP_URL=https://us.posthog.com/project/666838/dashboard/2218193`, then redeploy the frontend
- [ ] Sandbox: buy a Contact Pack after redeploy (checkout TTL 20, floor 16; Cashfree floor is 15)
- [ ] Sandbox: after redeploy, DO memory settles at or below ~80% (50% heap, metaspace 192 MB, code cache 128 MB, Tomcat 50 threads)
- [ ] Cashfree dashboard: rename merchant from "testMerchantName"; webhook subscribes to failed/user-dropped events; try an RA payment and UPI collect (untested here)
- [ ] WhatsApp webhook (needs repo admin; set both secrets or neither, or boot fails): generate a 32-char token, add `SANDBOX_WHATSAPP_WEBHOOK_VERIFY_TOKEN` + `SANDBOX_WHATSAPP_APP_SECRET` to the `sandbox` environment, deploy, then in Meta set callback `https://sandbox.draazy.com/api/webhooks/whatsapp` with that token and subscribe `messages`; smoke: room post notice arrives, STOP stops it
- [ ] ZeptoMail webhook (needs repo admin): in CPaaS → Agents → agent → Webhooks set an Authentication Key, add it as `SANDBOX_ZEPTOMAIL_WEBHOOK_KEY` to the `sandbox` environment, deploy, then add `https://sandbox.draazy.com/api/webhooks/zeptomail` with Hard bounce, Soft bounce and Feedback loop events; smoke: "Send Test" hard bounce shows as a failed `delivery` row in Admin › Integrations
- [ ] PostHog: `$web_vitals` events arrive after deploy
- [ ] WebP photos: deploy backend first; the R2 token needs list on the public bucket; check `.webp` card copies appear
- [ ] Lighthouse on sandbox: detail page LCP image load delay ~0 (`lcp-breakdown-insight`) and Cloudflare does not challenge the GitHub runner; drop the `draazy.com` 302 dashboard rule at launch
- [ ] Confirm the DO app and Postgres share a region; add OpenTelemetry only once there is more than one instance

## Real phones
- [ ] Real Safari (Mac + iPhone), Firefox, Android: the SB-11 checklist rows (25, 194, 195, 216, 260, 261), incl. a contrast audit with a real tool
- [ ] Liveness on a webcam, Android and iPhone Safari; camera denied; backgrounded capture
- [ ] `/reels`: landscape insets, chip `:active`, 44px chips at 360×640, snap with `content-visibility`
- [ ] `/list-property`: tile lift, `.lp-meter` top, press feedback; photo drag-reorder long-press (iOS)
- [ ] `/listings` map sheet: `86dvh`, pinch-zoom, grabber, pull-to-refresh; Android Back on the filter sheet
- [ ] `/flatmates`: locality popup, drawer insets on a notch; group chat; detail tap/safe-area feel
- [ ] Scroll lock (older iOS): Compare picker, `DashboardReviewModal`, society stack, `AdminSocieties` dialogs; home-indicator clearance
- [ ] Select/MultiSelect with the iOS Safari and Android keyboards
- [ ] `/rent-agreement` landing and wizard on a real iPhone/Android: tap feel, smooth scroll, hero fold, step strip
- [ ] `/services` on a real phone: the spotlight fold and the priced Move-in Pack state
- [ ] Flatmates on real phones: map pan, sheets, photo/HEIC upload, OTP autofill, real SMS/OTP delivery, Maps quota exhaustion

## Content and ops
- [ ] Fact-check the 12 blog posts and 12 locality guides; re-check Metro Line 3 and the Hinjawadi PCMC merger before deploy
- [ ] Seed production FAQs (they answer `[]`): paste the 4 corrected FAQs from the Help audit; the first 6 by category also show on Home, the built-in five until then
- [ ] Lawyer glance at the 2026-10-10 legal edits: Terms §7 + Refund §2.2 (no auto-renewal), Refund §6 (no wallet credits), Privacy §1.3/§4/§7 (no Google login, erasure is a reviewed request)
- [ ] Confirm or delete Privacy §5 security claims (TLS 1.3, AES-256, pen-testing, SOC 2 Type II); Refund's 7-day cooling-off and annual pro-rata clauses have no backend flow, so support refunds them by hand
- [ ] Confirm rent-agreement SLA targets with ops
- [ ] Before launch: set the real grievance officer in Admin > Settings (the Refund Policy names them)
- [ ] Ops: act on legacy pending flatless flatmate posts
