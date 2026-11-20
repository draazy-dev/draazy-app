# Draazy Instagram campaign: reaching Pune flat and flatmate seekers

Built with the `ig-*` skills from Jakeschincariol/instagram-agent-skill (`ig-plan`, `ig-profile`, `ig-dm`, `ig-story`, `ig-viral`, `ig-reel` hookscore, `ig-caption` lint).

## The core idea

Instagram cannot show a post to "people searching for a flat" directly. Intent is captured in four layers, each catching people at a different stage:

| Layer | Who it catches | Mechanism |
|---|---|---|
| 1. Search capture | Typing "flat for rent Baner", "flatmate Pune" in Instagram or Google | Keyword name field, captions, alt text, location tags (public pro posts are indexed by Google since Jul 2025) |
| 2. Paid targeting | Likely seekers who are not searching yet | Meta ads by Pune geo + age + interests (India-only ads keep full targeting; confirm Ads Manager does not force the Housing special category) |
| 3. Hand-raisers | Anyone who comments, votes or replies | Comment keyword then auto DM, story polls, Click-to-DM ads |
| 4. Retargeting | People who watched, engaged or visited | Engagement and video-view audiences, website visitors (needs Meta Pixel, not installed yet) |

## Audiences (paid layer)

| Ad set | Targeting | Creative | Goal |
|---|---|---|---|
| A. Flatmate seekers | Pune, 10-15 km around Hinjewadi, Kharadi, Magarpatta, Baner, Viman Nagar, Wakad; age 21-32; interests: roommate, relocation, PG, co-living; behaviour: away from hometown | Flatmate reels, motion-everything | DM "FLATMATE" |
| B. Tenants | Pune city; age 22-40; interests: renting, apartment, NoBroker, MagicBricks, 99acres, Housing.com | motion-brokers, commute reel | DM "FLAT" / site visit |
| C. Moving to Pune | People in Mumbai, Bengaluru, Hyderabad, Nagpur, Nashik with interest in Pune + relocation | "New job in Pune" hook | Site visit |
| D. Agreement | Pune; age 24-40; interests: renting, tenancy | motion-agreement | DM "AGREEMENT" |
| E. Retarget | IG engagers 30d, 50%+ video viewers, site visitors; then 1% lookalike limited to Pune | Proof and how-it-works carousels | Sign-up |

Start with partnership or boosted versions of organic reels that already beat the account median (`ig-audit` ranks them). Do not make new ad-only creative first.

Timing: push spend from the 20th to the 5th of each month (move-in window) and harder in Jun-Aug and Jan (job-joining and campus seasons).

## Profile first (`ig-profile`, week 0)

- Name field (searchable, 30 chars): `Draazy | Pune Flats & Flatmates`
- Bio line 1: `Rent, buy or find a flatmate in Pune. Straight from owners, zero brokerage.`
- Bio line 2: `Comment FLAT on any reel for listings in your area.`
- Link: one door, `draazy.com/?utm_source=instagram&utm_medium=bio`
- Pinned three: motion-brokers (proof), motion-everything (offer), a flatmate reel (intro)
- Highlights: How it works, Flatmates, Agreements, Localities, Safety

## Content (`ig-plan`)

4-5 posts a week, at least 3 Reels, 7-9 pm IST. Pillars and the strongest hooks scored by `hookscore.py`:

| Pillar | Example hook | Score |
|---|---|---|
| Flat-hunt teach | 3 things to check before you pay a deposit for a flat in Pune. | 78.7 STRONG |
| Flatmates | A bad flatmate will make you hate a perfect flat in Pune. | 77.8 STRONG |
| Relocation | New job in Pune, no friends here, and you need a flatmate by Monday. | 75.1 STRONG |
| Locality series | Zero brokerage flats in Baner, straight from the owner, no calls. | 61.2 OK |
| Broker-free proof | motion-brokers / motion-agreement / motion-everything | done |

Locality series: one reel per hub (Baner, Wakad, Hinjewadi, Kharadi, Viman Nagar, Hadapsar), each with the locality in the first caption line, a location tag and alt text. These are the posts that rank in search.

Sample week:

```
MON  engage only (20 min)
TUE  REEL      TEACH     3 things to check before the deposit
WED  stories + engage
THU  REEL      FLATMATE  A bad flatmate will make you hate a perfect flat
FRI  CAROUSEL  LOCALITY  Baner: commute times to Hinjewadi and Kharadi
SAT  REEL      PROOF     motion-brokers
SUN  REEL      STORY     New job in Pune, need a flatmate by Monday
```

## Captions (`caption.py`)

- First 125 characters carry the search term: "Flat for rent in Pune...", "Flatmate in Baner..."
- Max 5 hashtags (Instagram cap since Dec 2025): `#PuneRentals #FlatForRent #FlatmatesPune #ZeroBrokerage #Draazy`, swap one for the locality.
- One ask only: "Comment FLAT".

## Conversations (`ig-dm`, `ig-story`)

- Keywords: FLAT, FLATMATE, AGREEMENT. An approved auto-reply (Instagram's own tool or a Meta partner) sends the link first, ungated:
  `Here you go: draazy.com/rent/baner?utm_source=ig&utm_campaign=kw-flat. Which area and when are you moving?`
- Stories daily, 3-5 frames, ask on frame 4: poll "Moving this month?" or question box "Which area are you searching in?". Reply by hand to every Yes. The answers become next week's hooks.
- Never DM people who did not interact first (account restriction risk).

## Community reach (`ig-comment`, collabs)

- Engagement round, 20 min/day: 5 Pune pages (city news, food, IT-park and college pages), 3 peer startups, 2 local creators.
- Collab posts with Pune relocation and flat-tour creators. Collab posts land on both grids and reach both audiences.

## Measure (`ig-audit`, PostHog)

UTMs on every link (PostHog already records them). Weekly: sends per reach, DM conversations per reel, cost per DM, DM to sign-up, sign-up to contact request. Re-run `ig-viral` monthly on 6-12 Pune real-estate and flatmate accounts and shoot the formulas that beat 3x.

## Rules carried over

No prices or fee figures. Verification claims are only "KYC done" (owners) and "Verified property" (listings). Renewal is "renewal reminder + one-tap renewal".
