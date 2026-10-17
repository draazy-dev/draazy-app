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
- [ ] Google Cloud: the **production** browser key (`VITE_GOOGLE_MAPS_API_KEY`) must allow **Maps Embed API** (the dev key already does), or the property Street View tile shows Google's error frame; check a FC Road listing's Location tab after deploy
- [ ] Google Maps / Routes / Places key with quota on sandbox, then run the SB-09 checklist rows (7, 157, 186, 187, 259) there (local e2e already loads Maps on `localhost:3322`)
- [ ] Rotate `backend/.env.local` secrets if in doubt (surfaced 2026-08-09)
- [ ] DigitalOcean: add the alert policies and the one free Uptime check from `docs/DEPLOY.md` §8; leave log forwarding off
- [ ] Optional: `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY` for graphify community labels

## Real phones
- [ ] Real Safari (Mac + iPhone), Firefox, Android: the SB-11 checklist rows (25, 194, 195, 216, 260, 261), incl. a contrast audit with a real tool
- [ ] Liveness on a webcam, Android and iPhone Safari; camera denied; backgrounded capture
- [ ] `/reels`: landscape insets, chip `:active`, 44px chips at 360×640, snap with `content-visibility`
- [ ] `/list-property`: tile lift, `.lp-meter` top, press feedback; photo drag-reorder long-press (iOS)
- [ ] `/listings` map sheet: `86dvh`, pinch-zoom, grabber, pull-to-refresh; Android Back on the filter sheet
- [ ] `/flatmates`: locality popup, drawer insets on a notch; group chat; detail tap/safe-area feel
- [ ] Scroll lock (older iOS): Compare picker, `DashboardReviewModal`, society stack, `AdminSocieties` dialogs; home-indicator clearance
- [ ] Select/MultiSelect with the iOS Safari and Android keyboards

## Content and ops
- [ ] Fact-check the 12 blog posts and 12 locality guides; re-check Metro Line 3 and the Hinjawadi PCMC merger before deploy
- [ ] Seed production FAQs (they answer `[]`): paste the 4 corrected FAQs from the Help audit; the first 6 by category also show on Home, the built-in five until then
- [ ] Lawyer glance at the 2026-10-10 legal edits: Terms §7 + Refund §2.2 (no auto-renewal), Refund §6 (no wallet credits), Privacy §1.3/§4/§7 (no Google login, erasure is a reviewed request)
- [ ] Confirm or delete Privacy §5 security claims (TLS 1.3, AES-256, pen-testing, SOC 2 Type II); Refund's 7-day cooling-off and annual pro-rata clauses have no backend flow, so support refunds them by hand
- [ ] Confirm rent-agreement SLA targets with ops
- [ ] Before launch: set the real grievance officer in Admin > Settings (the Refund Policy names them)
- [ ] Ops: act on legacy pending flatless flatmate posts
