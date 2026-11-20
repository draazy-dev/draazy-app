# Reel library

Every reel made so far, with its script, so new reels don't repeat a topic, hook or line. The rendered files live in the git-ignored `brag-output\`. The docs here are the record.

| Folder | What | How it's made |
|---|---|---|
| [`prelaunch/`](prelaunch/) | Hinglish UGC skits with AI actors (Ishaan, Sana, Broker Bhaiya), pain-first, "bahut jald launch ho raha hai" | Google Flow clips + local overlays; prompts in `ugc-flow\` |
| [`product/`](product/) | SaaS demo reels: the real app UI inside a phone, with an English voice-over | `draazy-reels` skill, `brag-output\work\reels\<slug>\` |
| [`motion/`](motion/) | Motion graphics with no app screens: kinetic type, icons, beat-synced music | NullMotion GSAP + `brag-output\work\motion\engine.js` |

## All reels

| # | Doc | File in `brag-output\` | Length | Topic | Hook |
|---|---|---|---|---|---|
| P1 | [01-broker-spam](prelaunch/01-broker-spam.md) | ugc-reel-01.mp4 | 30.0 s | Broker spam after one enquiry | 1 enquiry. 12 broker calls. |
| P2 | [02-brokerage](prelaunch/02-brokerage.md) | ugc-reel-02.mp4 | 24.0 s | Brokerage for a 5-minute visit | 5-minute visit. ₹25,000 fee. |
| P3 | [03-fake-owner](prelaunch/03-fake-owner.md) | ugc-reel-03.mp4 | 24.1 s | Fake owner ghosts you | Owner asli tha... ya nahi? |
| P4 | [04-flatmates](prelaunch/04-flatmates.md) | ugc-reel-04.mp4 | 23.8 s | Flatmate groups, strangers, habit clash | 10 groups. Zero flatmates. |
| P5 | [05-commute](prelaunch/05-commute.md) | ugc-reel-05.mp4 | 22.3 s | Cheap rent far away vs. commute | Cheap rent. 90-minute commute. |
| P6 | [06-rent-agreement](prelaunch/06-rent-agreement.md) | ugc-reel-06.mp4 | 25.1 s | Agent fee, biometric trip, reminders | Sab online... phir bhi agent ki fees? |
| P7 | [07-teaser](prelaunch/07-teaser.md) | ugc-reel-07.mp4, ugc-reel-07-flow-only.mp4 | 19.1 s | All six pains → "Draazy is coming" | Pune mein ghar ka har kaam? Broken. |
| S0 | [00-launch-film](product/00-launch-film.md) | brag.mp4 (16:9) | 21.5 s | Launch overview, music only | One flat search in Pune. |
| S1 | [01-launch-reel](product/01-launch-reel.md) | brag-reel.mp4 | 30.0 s | Broker-free overview + smart search | You search for one flat in Pune... and the broker calls just don't stop. |
| S2 | [02-trust](product/02-trust.md) | reel-trust.mp4 | 30.0 s | KYC done + Verified property | Found the perfect flat in Pune? But the owner wants a token… |
| S3 | [03-commute](product/03-commute.md) | reel-commute.mp4 | 30.0 s | Search by commute + society info | Your office is in Hinjawadi… an hour in traffic. |
| S4 | [04-flatmates](product/04-flatmates.md) | reel-flatmates.mp4 | 30.0 s | Rooms, flatmates, teams, match % | Looking for a flatmate in Pune? Most groups are full of brokers… |
| S5 | [05-owner-listing](product/05-owner-listing.md) | reel-owner.mp4 | 30.0 s | Owner lists without a broker | You put your flat up for rent... broker calls won't stop. |
| S6 | [06-privacy](product/06-privacy.md) | reel-privacy.mp4 | 30.0 s | Contact gate, masked numbers | You share your number for one flat. By evening, ten brokers… |
| S7 | [07-owner-dashboard](product/07-owner-dashboard.md) | reel-dashboard.mp4 | 30.0 s | Owner dashboard | Calls, chats and visit plans... all over your phone. |
| S8 | [08-rent-agreement](product/08-rent-agreement.md) | reel-agreement.mp4 | 30.0 s | Agreement, doorstep registration, renewal | Renewing your rent agreement again?… |
| M1 | [01-brokers](motion/01-brokers.md) | motion-brokers.mp4 | 21.0 s | Zero brokerage, badges, private number | …forty-seven brokers call you back. |
| M2 | [02-agreement](motion/02-agreement.md) | motion-agreement.mp4 | 22.0 s | Agreement, doorstep biometrics, renewal | Rent agreement due again? Cue the agent… |
| M3 | [03-everything](motion/03-everything.md) | motion-everything.mp4 | 19.5 s | One app: rent, buy, sell, flatmates, agreements | Rent. Buy. Sell. Flatmates. Rent agreements. |

Posting status is tracked in [`../instagram/log.md`](../instagram/log.md), not here.

## Topic coverage (check before writing a new reel)

| Topic | Pre-launch | Product | Motion | Count |
|---|---|---|---|---|
| Broker calls / number privacy | P1 | S1, S6 | M1 | 4, saturated |
| Brokerage fee | P2 | S1 | M1 | 3 |
| Rent agreement + renewal | P6 | S8 | M2 | 3, saturated |
| Fake owner / KYC / verified property | P3 | S2 | M1 (badges) | 3 |
| Flatmates | P4 | S4 | M3 (one line) | 2.5 |
| Commute search | P5 | S3 | M3 (one line) | 2.5 |
| Whole-app positioning | P7 | S0, S1 | M3 | 4 |
| Owner: list your flat | | S5 | | 1 |
| Owner: dashboard | | S7 | | 1 |
| Smart search ("type it the way you'd say it") | | S1, S0 (one beat) | | 0.5 |

**Not covered yet (fresh topics):**
- buying a flat
- selling a flat
- the owner's side in pre-launch or motion form
- society pages (water, power backup, maintenance) as a topic of their own
- smart search on its own
- a checklist before paying a deposit (a STRONG hook in [`../instagram/campaign-plan.md`](../instagram/campaign-plan.md))
- a new-to-Pune / new-job relocation story
- "team to rent with" (group renting)

## Lines and hooks already used

Don't reuse these verbatim:
- "You search for one flat in Pune…" (S1, M1, S0)
- "That's Draazy. … in Pune." (every product outro)
- "Broker-free homes in Pune." (S0, S1, M1)
- "Direct hai, easy hai, Draazy hai. Bahut jald launch ho raha hai." (P3–P7; this is the series sign-off, so keep it for pre-launch reels)
- "Real owners, checked by real people." (S2)
- "…minus the running around." (S8, M2)
- "Live closer to work." (S3)

## Rules that apply to every new reel

From `tasks\lessons.md` and `social\instagram\voice.md`:
- No prices, fees or ₹ figures. P2, P5, S0, S2's caption and S5's "first listing is free" predate this rule.
- Verification wording is only "KYC done" for owners and "Verified property" for listings. Never "100% verified".
- Say "renewal reminder + one-tap renewal", never "auto-renew".
- Reels are 30 s or less, every voice line is a full sentence, and the logo animates only in the outro.
- Use at most 5 hashtags, and never `#NoBrokers` or "no brokers" (a competitor's brand).
- Pre-launch copy says "coming soon" or "bahut jald", and never claims live listings or users.

## Adding a reel

1. Check the coverage table and the used lines above.
2. Write `<folder>/<nn>-<slug>.md` using the same sections: header table, Angle, Hook, Script, Caption, Notes/Overlaps.
3. Add a row to "All reels" and update the coverage counts.
4. When it's posted, add a row to `../instagram/log.md`.
