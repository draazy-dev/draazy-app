DRAAZY PRE-LAUNCH UGC REELS (GOOGLE FLOW) - BRAND KIT + HOW TO USE
=====================================================================

GOAL
Seven 9:16 hype reels, 22-25 s each, for Pune renters, buyers and owners aged 15-30. Draazy is Pune's
property app for the whole journey: rent, buy, sell and services such as the rent agreement. The reels
show the pain of finding and managing a home in Pune and tease that a fix is coming. No app screens, no product demo, no "I used Draazy" testimonials
(the app is not live yet). Each reel names Draazy and says what it fixes, in words only.
Every reel ends with the same line and the same end card so the series
feels like one campaign.

Tagline:                                          "Direct hai, easy hai, Draazy hai"
Series sign-off line (spoken by the character):  "Direct hai, easy hai, Draazy hai. Bahut jald launch ho raha hai."
                                                  Reels 1-2 (done) said "Draazy. Pune ka apna rental app. Bahut jald launch ho raha hai."
                                                  Reel 1: the shared clip reels\00-signoff.txt. Reels 2-7: inside the last clip. Never add a pronunciation hint.
End card text:                                    Draazy  |  Direct hai, easy hai, Draazy hai  |  Rent · Buy · Sell · Agreements  |  Coming soon


HOW DRAAZY IS INTRODUCED (without showing a single app screen)
  1. The "socho" line: every reel's last clip says "Socho, ek app jahan..." plus the one real feature
     that fixes that reel's pain. Viewers learn it's an app and what it does.
  2. The name, spoken: the sign-off "Direct hai, easy hai, Draazy hai. Bahut jald launch ho raha hai." Same line, reels 3-7.
  3. Lower-third pill under the sign-off: "Draazy · Rent · Buy · Sell · Agreements", Outfit SemiBold 600, 40 pt,
     white on an Ink #0F0D1A pill at 85%, "Draazy" in Teal light #2DD4BF, at y around 1380.
  4. The end card: local HTML with the real logo (about 2 s; template brag-output\work\reels\ugc-r02).
  5. Captions write "Draazy" in Teal light every time it's said.
  6. Post caption ends with the handle: @<draazy-handle> (fill in the real handle; don't invent one).
  No app screens, mock-ups or UI in any shot: a phone screen is either turned away or an unreadable blur.


FOLDER MAP
  00-README-brand-kit.txt           this file: brand rules, edit rules
  00-RUNBOOK-claude-code.txt        step-by-step for Claude Code driving Google Flow (start here to generate)
  flow-ledger.csv                   one row per generation: credits, checks, files
  characters\01-ishaan.txt          LEAD character: identity, voice, image prompts, Flow Character setup
  characters\02-sana.txt            Supporting character (reels 4 and 7)
  characters\03-broker-bhaiya.txt   Comic antagonist (reels 1, 2, 3; on camera only in reel 2)
  reels\00-test-voice-and-name.txt  4 s test clip: checks the face, voice and "Draazy" before any spend
  reels\00-CONTINUITY-RULES.txt     READ FIRST before any generation: one set per reel, look lock, anchor frame
  reels\00-end-card-door.txt        NOT USED (the end card is local HTML)
  reels\reel-NN-<topic>\set.txt     The reel's set image (0 credits), attached to every clip of the reel
  reels\reel-NN-<topic>\script.txt  Full script, timings, overlays, caption, hashtags, edit notes
  reels\reel-NN-<topic>\clip-N.txt  One Google Flow job per clip: settings, prompt, accept checks
  renders\                          approved 720p downloads (created by the runbook)


WHY A MALE LEAD
Instagram in India is about 67% male, and 18-34 year olds are about 62% of its users (DataReportal /
Statista figures for 2025-26). Pune's renting crowd also skews towards young men who moved for IT jobs
and college. So the lead is Ishaan, 23, an IT guy in Hinjawadi. Sana, 22, joins in the flatmate and
teaser reels so the series speaks to young women too, especially on safety and trust.


BRAND COLOURS (taken from the live app theme: frontend/src/styles/theme.css)
  Ink (dark background)   #0F0D1A   app's dark mode page colour; end card and text-card backgrounds
  Ink card                #1B1730   secondary dark panels
  Teal (primary)          #14B8A6   THE Draazy colour: hero word highlights, Ishaan's hoodie, phone case
  Teal light              #2DD4BF   highlight text on dark backgrounds
  Teal deep               #0D9488   buttons and solid fills on light backgrounds
  Indigo                  #4F46E5   secondary accent: LED strip in Ishaan's room, subtle glows
  Coral                   #FB923C   warmth / pain accent: Sana's overshirt, "problem" words in overlays
  Rose                    #F43F5E   alarm only: "12 missed calls" style numbers, used sparingly
  Light page              #F3F7F6   plain background for character reference sheets
  White                   #FFFFFF   body text on dark

  Rule of thumb inside every frame: teal is the hero, coral is the pain, indigo is the mood.

FONT
  Outfit (Google Fonts, free; same as the app). Download: fonts.google.com/specimen/Outfit
  CapCut desktop: Text > Font > Upload, install Outfit 500, 600 and 700.
  Hook text:      Outfit SemiBold 600, 64-72 pt, sentence case, max 2 lines, max 40 characters a line
  Captions:       Outfit Medium 500, 44-48 pt, white, key word in Teal light #2DD4BF
  End card:       Outfit Bold 700 for "Draazy", Outfit SemiBold 600 for "Direct hai, easy hai, Draazy hai",
                  Outfit Medium 500 for "Rent · Buy · Sell · Agreements",
                  Outfit SemiBold 600 for "Coming soon"

LOGO
  An outlined, rounded "D" with an open door standing inside it (frontend/src/components/brand/LogoMark.jsx).
  Export it as a teal #14B8A6 PNG/SVG for the end card. Never ask Flow to draw the logo; AI video
  garbles logos and text. Always overlay the real logo in the edit.


BRAND VIBE INSIDE THE AI FOOTAGE (already written into every prompt)
  - Ishaan always wears his teal #14B8A6 hoodie (or teal overshirt outdoors) and uses a matte teal phone case.
  - Sana always wears her coral #FB923C overshirt.
  - Ishaan's room has an indigo #4F46E5 LED strip and a coral cushion.
  - Colour grade: clean, slightly cool shadows with a teal tint, warm natural skin, no heavy filters.
  - Real Pune textures: society corridors, autos, Hinjawadi traffic, PGs, chai. No landmarks or brand
    signage that can be read, no real society names, no government logos.


EDIT RULES (CapCut or Instagram editor)
  Canvas 1080x1920, 30 fps. Export at 1080p.
  Instagram safe zones: keep text out of the top 150 px, the bottom 350 px (below y 1570) and the
  right 120 px (the like/comment buttons sit there).
  Hook card (0.0 - 2.5 s): Outfit SemiBold, white text on an Ink #0F0D1A pill at 85% opacity, 24 px
    corner radius, placed around y 260-460 (upper third, clear of the face). One word in Teal light
    #2DD4BF, or Coral #FB923C if the word is the pain ("calls", "brokerage").
  Captions (whole reel): auto-captions in Hinglish, Roman script, edited by hand for spelling.
    Outfit Medium, white with a soft 40% black shadow, max 2 lines, centred at y 1250-1450.
    Highlight one word a line in Teal light.
  End card (last ~2 s, local HTML on Ink #0F0D1A): the real teal logo fading in at centre (scale 0.9 to 1.0,
    0.4 s), "Draazy" in Outfit Bold white 96 pt under it, "Direct hai, easy hai, Draazy hai" in Outfit SemiBold white
    52 pt, "Rent · Buy · Sell · Agreements" in Outfit Medium white 40 pt, "Coming soon" in Teal light 44 pt. Optional small line at y 1450: "Follow for launch".
  Sign-off: the "Draazy · Rent · Buy · Sell · Agreements" lower-third pill (see HOW DRAAZY IS INTRODUCED) appears
    as Ishaan says "Draazy" and stays until the end card.
  Sound: keep Flow's native dialogue and ambience (every prompt says "no music").
    Add one trending, low-volume track in Instagram, ducked to about -18 dB under the voice.
    End card: send-whoosh-up, impact-soft-1 and pop-1 (brag-output\work\reels\ugc-r01\sfx-cues.json).
  Cut tight: drop every frame of silence before the first word. The first spoken word should land by 0.3 s.


GOOGLE FLOW WORKFLOW (credit-saving plan, Google AI Pro)
  Full step-by-step: 00-RUNBOOK-claude-code.txt. In short:
  1. Character images on Nano Banana 2 Lite (no charge), then Flow Characters (Ishaan, IshaanOutdoor,
     Sana, BrokerBhaiya), each with a locked face, outfit and saved voice. Prompts call them with @Name chips.
  2. A 4 s test clip (reels\00-test-voice-and-name.txt) to check the face, the Hinglish and "Draazy"
     before spending on reel clips.
  3. Every clip on Gemini Omni Flash 1.1, Ingredients, 360p, 9:16, 8 s, 1 output (360p costs half).
  4. Only takes the user approves get upscaled to 720p (free on Pro) and downloaded.
  5. Each clip file has the visual checks (Claude screenshots), audio checks (the user listens) and the
     one allowed retry fix. Veo 3.1 Fast is a fallback only with the user's OK; Veo 3.1 Quality can't
     use ingredients, so it's never used for character clips.
  6. Assemble in CapCut with the edit rules above; trim each 8 s clip to the "use" range in its header.

  If Hinglish words come out wrong: rewrite only those words in Devanagari inside the same quotes,
  e.g. "Ek flat pe enquiry ki thi" becomes "एक flat पे enquiry की थी".
  Spoken brand name: dialogue writes plain "Draazy" with no pronunciation hint (a hint made it
  "Drauzzy"). With "Rasalgethi custom" it comes out right (user-checked). Captions always read "Draazy".
  If Flow burns in subtitles anyway: regenerate. The prompts already ask for no text on screen.
  If the voice drifts: fix the saved character voice, not the prompt.


CONTENT RULES (pre-launch honesty)
  - Never show app screens or claim anyone has used Draazy. It's a teaser, not a testimonial.
  - Pain points are relatable skits, not statistics. Never put invented percentages on screen.
  - Every "socho..." line matches a real Draazy feature (masked numbers, owner-direct, KYC-checked
    owners and papers, flatmate living-style match, commute time, rent agreement with doorstep
    biometrics, rent-due and renewal reminders, one-tap prefilled renewal, buying and selling).
    Don't add promises the app doesn't keep. Never say "auto-renew": each renewal needs fresh
    registration and biometrics.
  - No prices anywhere (user's call): no Draazy price, no agent fee figures. Talk pain points and services.
  - The rent agreement is done online; nobody queues at a registration office. The pain is agents charging
    a lot for it and the extra trip for biometrics.
  - Don't name competitors or real brokers, societies or offices.
  - Instagram requires a label on photorealistic AI video: turn on "AI info" (Add AI label) when posting.
    All Flow output also carries Google's invisible SynthID watermark.


POSTING ORDER (suggested, 2-3 a week)
  1 Broker spam  >  2 Brokerage  >  3 Fake listing  >  4 Flatmates  >  5 Commute  >  6 Rent agreement
  >  7 Teaser recap (needs clips from 1-6, post it last or the week before launch)
