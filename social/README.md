# Social media

Everything for Draazy's social channels lives here: strategy, voice, plans, research and the post log. The rendered videos stay in the git-ignored `brag-output\`.

## Layout

| Path | What | Written by |
|---|---|---|
| `reels/README.md` | Every reel made, topic coverage and used hooks; check it before writing a new reel | hand |
| `reels/prelaunch/`, `reels/product/`, `reels/motion/` | One doc per reel: angle, hook, full script, caption | hand |
| `instagram/campaign-plan.md` | Audiences, ad sets, funnel, KPIs | hand |
| `instagram/voice.md` | Brand voice and copy rules; every `ig-*` skill reads it | hand |
| `instagram/plan.md` | This week's calendar | `/ig-plan` |
| `instagram/swipe.md` | What is working in the niche, ranked by outlier multiple | `/ig-viral` |
| `instagram/log.md` | Every published post: date, file, hook formula, first line, results | `/ig-reel`, `/ig-audit`, hand |

## Skills (`.agents/skills/ig-*`)

Vendored from [Jakeschincariol/instagram-agent-skill](https://github.com/Jakeschincariol/instagram-agent-skill) (MIT, commit `d03c56b`). Local changes: data paths point at `social/instagram/` instead of `~/.claude/instagram/`, and `SKILL.md` commands use `python` (there is no `python3` on Windows).

| Need | Skill |
|---|---|
| Week's calendar and engagement list | `ig-plan` |
| Idea to reel script, scored hook, beat sheet | `ig-reel` |
| Caption lint (125-char window, 5 hashtags, one ask) | `ig-caption` |
| Carousel, stories, comments, replies, DMs | `ig-carousel`, `ig-story`, `ig-comment`, `ig-reply`, `ig-dm` |
| Profile score and rewrite | `ig-profile` |
| Niche research, swipe file | `ig-viral` |
| Post-mortem on published posts | `ig-audit` |
| One long video into many posts | `ig-repurpose` |
| Remove AI tells from any draft | `ig-human` |

Run the tools from the skill folder:

```powershell
python .agents\skills\ig-reel\hookscore.py hooks.txt
python .agents\skills\ig-reel\beats.py script.txt --target 30
python .agents\skills\ig-caption\caption.py caption.txt --keywords "flat for rent in Pune,flatmate in Pune"
python .agents\skills\ig-human\detect.py draft.txt
```

Making the videos themselves: the `draazy-reels` skill and `brag-output\work\` pipeline.

## Weekly loop

1. Monday: `/ig-plan` writes `instagram/plan.md`.
2. Per post: `/ig-reel` (hook must score STRONG), render, `/ig-caption`, `/ig-human`.
3. Daily: stories (`/ig-story`) and the 20-minute engagement round (`/ig-comment`).
4. After posting: add a row to `instagram/log.md`.
5. Monthly: `/ig-viral` refreshes `instagram/swipe.md`; `/ig-audit` reads the log.

Nothing is posted, followed or messaged by an agent. A person publishes every post and sends every DM.
