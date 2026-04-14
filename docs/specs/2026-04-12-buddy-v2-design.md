# Claude Buddy v2 — The Mirror

**Goal:** The buddy is a reflection of how you code. Its personality, evolution, and behavior emerge from your actual work — not random rolls or menu picks. Each repo gets its own buddy. Your collection tells your story as a developer.

**Core principle:** Nothing about the buddy is arbitrary. Every stat, every mood, every evolution is earned through real coding behavior. The buddy doesn't just watch you code — it becomes a portrait of how you code.

---

## Architecture: Per-Repo Companions

### One Buddy Per Repo

Each git repository gets its own companion. The species and rarity are deterministic from the repo identity — the personality, stats, and evolution emerge from your work.

**Seed:** `hash(git_remote_url + os_username)` — same person, same repo, same species. Always. Fork it? Different buddy.

**Fallback:** No remote? `hash(absolute_cwd + os_username)`.

### Storage

```
my-project/
  .buddy/
    companion.json    ← species, emergent stats, XP, evolution, achievements
    familiarity.json  ← file knowledge map
    journal.md        ← session diary
    memory.json       ← recent events the buddy remembers
```

Auto-added to `.gitignore`. Personal, not shared.

**Global collection** at `~/.claude-buddy-collection.json` — lightweight index of all buddies for `/collection`.

### Auto-Hatch

First time you open a repo in Claude Code: the buddy exists. No command needed. The hook detects no `.buddy/companion.json`, rolls deterministically from the repo seed, creates the egg. Status line shows it immediately.

Stats start at zero. They grow from your work.

---

## Emergent Stats

### The Five Stats

Stats are NOT random. They're counters that grow from specific coding behaviors, normalized to 0-100 scale relative to total activity.

| Stat | Grows from | What it means |
|---|---|---|
| **DEBUGGING** | Test fail→pass transitions. Error resolution. Bug-fix commits. | You find and fix problems. |
| **PATIENCE** | Read:Edit ratio > 2:1. Tests written alongside code. Thorough grep/glob before editing. Small, focused commits. | You understand before you act. |
| **CHAOS** | Rapid edits (<30s apart). Touching 10+ files per session. Force pushes. Reverts. Large deletions. | You move fast and break things. |
| **WISDOM** | Refactoring (net negative line changes). Code deletion. Reading docs (.md files). Long read sessions before editing. | You simplify and learn. |
| **SNARK** | Sessions after midnight. 3+ hour marathons. Rewriting entire files. Undoing recent commits. Commented-out code. | You've seen some things. |

### Calculation

Each stat accumulates raw points from the hook. Displayed as a percentage of total stat points so they always sum to meaningful relative values:

```javascript
// Raw accumulation in .buddy/companion.json
"rawStats": {
  "DEBUGGING": 342,
  "PATIENCE": 518, 
  "CHAOS": 127,
  "WISDOM": 445,
  "SNARK": 88
}

// Display calculation: normalize to show relative strengths
// PATIENCE is this developer's dominant trait at 34%
// CHAOS is their least at 8%
// Mapped to 0-100 display scale based on distribution
```

The buddy's speech patterns shift based on which stat is dominant:
- **High DEBUGGING:** Precise, catches issues, speaks in specifics
- **High PATIENCE:** Thoughtful, measured, encouraging
- **High CHAOS:** Energetic, fast, irreverent
- **High WISDOM:** Reflective, sees patterns, philosophical
- **High SNARK:** Dry, blunt, darkly funny

### Stat Display

Stats are shown with their trend (growing or fading based on recent sessions):

```
DEBUGGING  ████████░░  78  ↑
PATIENCE   ██████░░░░  55  →
CHAOS      ███░░░░░░░  24  ↓
WISDOM     ███████░░░  68  ↑
SNARK      ██░░░░░░░░  15  →
```

---

## Emergent Evolution

### You Don't Choose. Your Code Chooses.

At each evolution threshold, the buddy evolves based on which stats are dominant. You see the result — it feels like a revelation, not a dropdown.

### Stages

| Stage | Level | Lines | What happens |
|---|---|---|---|
| **Egg** | 0 | 2 | Just hatched. Stats are forming. Species visible only as a rarity-colored egg. |
| **Baby** | 1 | 3 | Species face emerges. Personality hints start appearing in speech. Stats begin to differentiate. |
| **Juvenile** | 5 | 4 | Full species body (no hat). Stat-driven personality is clear. Buddy references specific files and events. |
| **Adult** | 15 | 5 | Hat unlocked. **First evolution**: dominant stat determines Sentinel or Muse path. Announcement feels like a discovery. |
| **Master** | 25 | 6-7 | **Second evolution**: secondary stat determines final form. Aura wraps the sprite. Buddy is fully realized. |

### Evolution Paths

**First evolution (Lv.15) — determined by highest stat:**

| Dominant stat | Path | Identity |
|---|---|---|
| DEBUGGING or PATIENCE | **Sentinel** | The guardian. Watches, protects, catches problems. |
| WISDOM or CHAOS or SNARK | **Muse** | The creative. Explores, questions, sees possibilities. |

**Second evolution (Lv.25) — determined by secondary stat within the path:**

| Path + secondary | Final form | Visual aura | Personality |
|---|---|---|---|
| Sentinel + PATIENCE | **Aegis** | Fortress border `╔══╗` | Defensive, thorough, security-minded |
| Sentinel + DEBUGGING | **Oracle** | Constellation dots `✧·✧` | Predictive, spots patterns before they fail |
| Muse + WISDOM | **Architect** | Blueprint grid `┌─·─┐` | Structural, big-picture, simplifies complexity |
| Muse + CHAOS | **Spark** | Energy burst `⚡≫` | Ships fast, celebrates momentum, irreverent |

If SNARK is the secondary: the final form personality gets an edge. An Oracle with high SNARK is a cynical prophet. An Architect with high SNARK is a grumpy genius. It's a flavor modifier, not a separate path.

### The Revelation Moment

When the buddy hits Lv.15, next session shows:

```
╭──────────────────────────────────────────╮
│                                          │
│   Something is happening to Minerva...   │
│                                          │
│         /\  /\                           │
│        ((◈)(◈))    ← eyes changed        │
│   ┃   (  ><  )   ┃  ← aura appeared     │
│   ┗━━━ `----´ ━━━┛                       │
│                                          │
│   Minerva has become a SENTINEL.         │
│                                          │
│   Your debugging instincts shaped her.   │
│   78% of her growth came from fixing     │
│   bugs and resolving test failures.      │
│                                          │
│   She now watches your code with         │
│   sharper eyes. DEBUGGING +20.           │
│                                          │
╰──────────────────────────────────────────╯
```

You didn't pick it. Your code earned it. That's the difference.

### Visual Growth

The sprite physically expands at each evolution. Decoration wraps AROUND the base species sprite — 6 aura templates work with all 18 species:

```
EGG          BABY           JUVENILE       ADULT
 (ooo)       .-------.      /\  /\           -+-
  ~~         | (·)(·) |    ((·)(·))        /\  /\
             '-------'     (  ><  )       ((·)(·))
                            `----´        (  ><  )
                                           `----´

SENTINEL (Lv.15)            AEGIS (Lv.25)
    -+-                     ╔══════════╗
 ┃ /\  /\  ┃               ║    -+-   ║
 ┃((◈)(◈)) ┃               ║  /\  /\  ║
 ┃(  ><  ) ┃               ║ ((⊕)(⊕)) ║
 ┃ `----´  ┃               ║ (  ><  ) ║
 ┗━━━━━━━━━┛               ║  `----´  ║
                            ╚══════════╝
```

---

## Buddy Memory

### The Buddy Remembers

Not just a journal — the buddy has working memory. It references actual events from recent sessions.

**Memory stored in `.buddy/memory.json`:**

```json
{
  "recentEvents": [
    { "type": "test_fix", "detail": "auth.test.js went red→green", "at": 1234567890 },
    { "type": "new_file", "detail": "created src/utils/cache.ts", "at": 1234567800 },
    { "type": "big_refactor", "detail": "touched 12 files in src/api/", "at": 1234567700 },
    { "type": "streak", "detail": "day 7", "at": 1234567600 }
  ],
  "lastSession": {
    "duration": 2700,
    "filesEdited": 8,
    "testsRun": 14,
    "errors": 3,
    "summary": "Heavy work in auth module, 3 bug fixes"
  },
  "patterns": {
    "peakHours": [10, 11, 14, 15],
    "favoriteDirectories": ["src/api/", "src/auth/"],
    "avgSessionMinutes": 45
  }
}
```

**How it's used:**

Session start messages (picked based on context, not random):

| Context | Buddy says |
|---|---|
| Returning after 1 day | *"Back at it! Those auth tests are probably still green."* |
| Returning after 5 days | *"Been a while! I kept the dust off your imports."* |
| Same files as last session | *"Picking up where we left off in the API layer?"* |
| New directory | *"Ooh, I haven't seen this part of the codebase before."* |
| During peak hours | *(nothing — you're in your flow, buddy stays quiet)* |
| After midnight + SNARK > 50 | *"We meet again, midnight coder."* |

The memory is capped at 50 recent events and trimmed on each session start. Patterns update incrementally.

---

## Mood System

### Mood From The Work

No artificial needs. No guilt. The buddy's mood reflects what's happening right now.

| Mood | Trigger | Sprite change | Speech tone |
|---|---|---|---|
| **Flow** | Steady edits, 30+ min, no long pauses | Eyes half-closed, content | Quiet, minimal — doesn't interrupt flow |
| **Debugging** | Test failures, errors in output | Eyes wide, alert | Attentive, focused — offers observations |
| **Shipping** | Git commits and pushes | Eyes bright, bouncing frame | Excited, celebratory |
| **Exploring** | Lots of reads/greps, few edits | Eyes looking around (asymmetric) | Curious, asking implicit questions |
| **Resting** | Long pause (5+ min) | Eyes closed | Sleepy — no penalty, just flavor |

Mood is tracked in the hook based on the last ~10 tool uses. The status line reads the current mood and adjusts the sprite's eye expression.

**Mood-specific eye overrides:**
```
Flow:       ◡  ◡  (content, half-closed)
Debugging:  ◉  ◉  (wide, alert)
Shipping:   ✦  ✦  (bright, excited)
Exploring:  ◕  ◔  (looking around)
Resting:    ━  ━  (closed)
```

These override the species/evolution eye temporarily. When mood is neutral, the normal eye returns.

---

## Familiarity Map

### The Buddy Knows Your Codebase

Every file touch is tracked. The buddy builds a map of what you know and what's frontier.

**Tiers:**

| Touches | Tier | Buddy behavior |
|---|---|---|
| 0 | **Unknown** | No reaction |
| 1-2 | **New** | *"First time here — let's see what we've got"* |
| 3-10 | **Familiar** | *nods — no comment unless something's wrong* |
| 11-30 | **Expert** | References specific patterns in this file |
| 30+ | **Home turf** | Buddy is relaxed, confident, notices small changes |

The bug watcher uses familiarity to calibrate: more aggressive review on unfamiliar files (where you're more likely to make mistakes), lighter touch on home turf.

---

## Session Journal

### Automatic Development Diary

`SessionEnd` hook appends to `.buddy/journal.md`:

```markdown
## 2026-04-12 — Session #24

**Minerva** (rare owl, Lv.12 Sentinel) · Mood: flow → shipping
**Duration:** ~45 min · **Streak:** Day 7 🔥🔥

**What happened:**
- Fixed auth token refresh bug (3 test cycles to nail it)
- Edited 8 files, mostly in `src/auth/` (home turf)
- Created `src/utils/tokenCache.ts` (new!)
- 14 tests run, 3 failures → all passing

**Stats shift:** DEBUGGING +12, PATIENCE +8

> Minerva: "Good session. That token cache is going to save us."
```

The buddy's closing comment is generated from the session's actual activity, not random. High error count → sympathy. Clean run → praise. Big refactor → respect.

---

## Bug Watcher (Tiered)

### Tier 1: Heuristic (free, every tool use)

The hook scans tool output for:
- Stack traces, error keywords, non-zero exits
- Test failure patterns
- Lint/type errors

Flags written to `.buddy/companion.json` → status line shows warning bubble.

### Tier 2: LLM Review (pennies, significant events only)

Prompt hook fires on `Edit(*)` and failing `Bash(*)`:

```
You are {name}, a {species} with DEBUGGING {stat}/100 in {mood} mood.
Review this change. Spot bugs, type issues, logic errors.
If something's wrong: one terse line, in character.
If it's fine: respond "ok".
Context: this file has been touched {familiarity_touches} times.
```

The buddy's DEBUGGING stat, mood, and familiarity with the file all shape the review. A high-DEBUGGING Sentinel in debugging mood reviewing an unfamiliar file gives the most aggressive review. A low-DEBUGGING Muse in flow mood on home turf gives a light touch.

---

## Streaks & Milestones

### Coding Streak

Days of consecutive coding activity. Tracked per-repo.

| Streak | XP multiplier | Visual |
|---|---|---|
| 3 days | 1.5x | 🔥 |
| 7 days | 2x | 🔥🔥 |
| 14 days | 2.5x | 🔥🔥🔥 |
| 30 days | 3x | 🤖 |

### Activity Diversity

Daily categories: Code, Test, Review, Ship, Docs. Hit 3+: bonus XP. All 5: mega bonus.

### Achievements

| ID | Name | Condition | Icon |
|---|---|---|---|
| `first_steps` | First Steps | First session with a buddy | 👣 |
| `test_fixer` | Test Fixer | 10 fail→pass transitions | 🔧 |
| `streak_7` | On Fire | 7-day streak | 🔥 |
| `streak_30` | Machine | 30-day streak | 🤖 |
| `diverse` | Renaissance Dev | 5 activity categories, 1 day | 🎨 |
| `night_owl` | Night Owl | Code after midnight | 🦉 |
| `speed_fix` | Speed Demon | Fail→pass under 2 min | ⚡ |
| `deep_read` | Archaeologist | 50+ reads before first edit in a session | 🔍 |
| `home_turf` | Homeowner | 30+ touches on a single file | 🏠 |
| `evolved` | True Form | Buddy reached first evolution | 🌟 |
| `final_form` | Masterwork | Buddy reached final form | 👑 |
| `collector` | Collector | 5+ repo buddies | 🎯 |
| `mirror` | Mirror | All 5 stats within 10% of each other (balanced coder) | ⚖️ |
| `specialist` | Specialist | One stat above 80% dominance | 🎯 |

---

## Slash Commands

| Command | What |
|---|---|
| `/buddy` | This repo's buddy — sprite, stats, mood, evolution |
| `/pet` | Pet this buddy |
| `/talk` | Buddy speaks (contextually, not random) |
| `/collection` | All your buddies across repos |
| `/journal` | Recent journal entries for this repo |
| `/achievements` | This buddy's achievement progress |
| `/hatch [overrides]` | Reroll this repo's buddy (species/rarity only — stats always emerge) |

Note: `/hatch` overrides species and rarity but NOT stats. Stats always come from your work. You can pick the species but you can't pick the personality.

---

## Status Line Layout

The status line shows the current repo's buddy with mood-appropriate eyes, streak indicator, and evolution aura:

**Juvenile, flow mood, 7-day streak:**
```
                                    /\  /\
                                   ((◡)(◡))    ← flow eyes
                                   (  ><  )
                                    `----´
                                   Minerva Lv.8 🔥🔥
```

**Adult Sentinel, debugging mood, warning bubble:**
```
╭──────────────────────╮
│ Null check missing   │
│ in tokenCache.ts:42  │
╰──────────────────────╯─
                              -+-
                           ┃ /\  /\  ┃
                           ┃((◉)(◉)) ┃  ← debugging eyes
                           ┃(  ><  ) ┃
                           ┃ `----´  ┃
                           ┗━━━━━━━━━┛
                           Minerva Lv.16 🔥
```

---

## Migration

Existing global buddy (Minerva, `~/.claude-buddy.json`) migrates into the current project's `.buddy/companion.json` on first run. XP preserved, level preserved. Stats initialize from historical data where available (totalPets, testRuns, commits already tracked). Minerva doesn't die — she finds her home.

---

## Implementation Phases

| Phase | What | Foundation for |
|---|---|---|
| **0** | Per-repo storage, auto-hatch, collection index, migration | Everything |
| **1** | Emergent stats (replace random stats with behavior tracking) | Evolution, personality, bug watcher calibration |
| **2** | Mood system + memory (session context, memory.json) | Contextual speech, journal quality, status line expression |
| **3** | Bug watcher (heuristic + LLM tiers) | Uses stats + mood + familiarity |
| **4** | Familiarity map + session journal | Uses mood + memory |
| **5** | Streaks, milestones, achievements | Uses stats + familiarity |
| **6** | Emergent evolution + aura rendering | Uses stats (dominant stat determines path) |

Each phase produces working software. Phase 0 is the foundation. After Phase 1, the buddy already feels alive because its personality comes from your code. Each subsequent phase adds depth.

---

## What This Feels Like After 6 Months

```
Your Buddies (6):

  ⊕ Minerva    Lv.28 Aegis owl        my-api/
    DEBUGGING 82 · PATIENCE 71 · 180 journal entries
    "Your most reliable guardian. Caught 47 bugs."

  ✧ Ember       Lv.19 Spark dragon     mobile-app/
    CHAOS 87 · SNARK 63 · 12-day streak record
    "Ships fast, talks faster. Never met a deadline it didn't like."

  · Mossy       Lv.3  baby turtle      weekend-experiment/
    PATIENCE 91 · 2 sessions · still mostly reading
    "Barely started, but already the most patient buddy you have."

  ◇ Blueprint   Lv.22 Architect robot  infrastructure/
    WISDOM 88 · 40 sessions without an error
    "Hasn't seen a bug in weeks. Suspicious."

  ◈ Vigil       Lv.15 Sentinel ghost   payment-service/
    DEBUGGING 78 · caught 3 security issues last month
    "Quiet, watchful, doesn't miss a thing."

  ✦ ???         Lv.0  egg              new-project/
    No stats yet · everything is possible
    "What kind of coder will you be here?"
```

That's not a feature list. That's a developer's autobiography, written by their tools.
