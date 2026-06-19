# Claude Buddy

A faithful recreation of the `/buddy` companion from Claude Code v2.1.96 — the terminal Tamagotchi that Anthropic shipped for April Fools 2026 and silently removed in v2.1.97.

This version goes further: your buddy lives in Claude Code's status line, reacts to your work via MCP tools, and **becomes a portrait of how you code** — emergent stats, per-repo companions, evolution paths your work chooses, and a voice that respects your flow. (See [v2 — "The Mirror"](#v2--the-mirror-implemented).)

```
    -+-              ╭──────────────────╮
   /\  /\            │ that one fought  │
  ((·)(·))           │ back. respect.   │
  (  ><  )           ╰──────────────────╯─
   `----´
   ⊕ Minerva Lv.16 ·7d
   DBG▰▰▰▰ PAT▰▰▱▱ CHA▰▱▱▱ WIS▰▰▰▱ SNK▰▱▱▱
```

## What's Here

| File | Purpose |
|---|---|
| `claude-buddy.js` | Standalone terminal pet — run it for the full-screen Tamagotchi experience |
| `buddy-mcp-server.js` | MCP server — integrates the buddy into Claude Code conversations |
| `buddy-statusline.js` | Status line renderer — animated sprite at the bottom of Claude Code |
| `buddy-hook.js` | PostToolUse hook — silently awards XP on every tool use |
| `buddy-progression.js` | Shared module — XP, levels, stages, emergent stats, evolution paths, achievements |
| `buddy-paths.js` | Per-repo storage resolution, migration, collection index |
| `buddy-voice.js` | The voice corpus — 18 species + stat-modulated flavor |

## Quick Start

### 1. Standalone Terminal Pet

```bash
node claude-buddy.js
```

Full-screen interactive terminal pet. 18 species, egg hatching animation, keyboard controls. Fun on its own.

### 2. Claude Code Integration

Add the MCP server using the Claude Code CLI. Use `-s user` so the buddy is available from any directory:

```bash
claude mcp add -s user buddy -- node /path/to/ClaudeBuddy/buddy-mcp-server.js
```

> **Note:** Using `~/.claude/.mcp.json` directly will **not** register user-level servers. The `-s user` flag writes to `~/.claude.json`, which is the correct location for servers that should work globally. Use `-s project` instead if you only want the buddy in a specific project.

Add the status line and XP hook to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/ClaudeBuddy/buddy-statusline.js",
    "refreshInterval": 2
  },
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/ClaudeBuddy/buddy-hook.js",
            "async": true
          }
        ]
      }
    ]
  }
}
```

Replace `/path/to/ClaudeBuddy` with the actual path to your ClaudeBuddy directory.

### 3. Slash Commands

Copy the `skills/` directory into `~/.claude/skills/` for global slash commands:

| Command | What |
|---|---|
| `/buddy` | Show your buddy's status |
| `/pet` | Pet your buddy |
| `/talk` | Buddy says something |
| `/hatch [options]` | Hatch a new buddy with overrides |
| `/name <name>` | Name or rename your buddy (no reroll) |
| `/card` | Show a clipboard-safe Buddy Card to screenshot/share |
| `/collection` | Show all your buddies across repos (no rankings) |
| `/buddy-review [on\|off]` | Opt-in, pull-only in-character code review |
| `/achievements` | Show achievement progress |

### 4. Meet your buddy

**Restart Claude Code** after setup so the hook, status line, and MCP server load. From then on:

- **Auto-hatch, per repo.** The first time you *edit or commit* in a git repo, a buddy hatches for that repo — reads and `cd` don't trigger it, so throwaway folders stay clean. Species/rarity are deterministic from the repo, so the same repo always gives the same companion. Each lives in that repo's `.buddy/companion.json` (auto-added to `.gitignore`).
- **Outside a git repo**, a single global buddy lives at `~/.claude-buddy.json`.
- **Choose the look** with `/hatch <species> <rarity> named <name>` — this replaces the *current* repo's buddy. Stats still emerge from how you code; you pick the look, not the personality.
- **Manage them:** `/name` to name, `/collection` to see them all, or delete a repo's `.buddy/` folder to remove its buddy.

## Upgrading from v1

If you already ran the original buddy:

1. **Get the new code** in the same folder your config points at — v2 adds two new modules (`buddy-paths.js`, `buddy-voice.js`) that must sit beside the others:
   ```bash
   cd /path/to/ClaudeBuddy && git pull
   ```
2. **Re-copy the skills** (v2 adds `/name`, `/card`, `/collection`, `/buddy-review`):
   ```bash
   cp -r skills/* ~/.claude/skills/
   ```
3. **Confirm the MCP server is registered** and pointed at your `buddy-mcp-server.js`:
   ```bash
   claude mcp list                  # should list "buddy"
   # if it's missing:
   claude mcp add -s user buddy -- node /path/to/ClaudeBuddy/buddy-mcp-server.js
   ```
   Your `~/.claude/settings.json` hook + status-line paths don't need to change.
4. **Restart Claude Code.**

**Your buddy is safe.** The first time you edit in a git repo after upgrading, your existing global buddy **migrates into that repo** (`.buddy/companion.json`) with its XP, level, and name preserved — *she finds her home*. Emergent stats seed from the history we already had (test runs, commits) and fill in as you work; the old `~/.claude-buddy.json` is kept as a backup.

> **Heads-up:** v2 gives **each repo its own buddy**. Working across many projects means a new companion hatches in each on your first edit there — that's the design (`/collection` shows them all). To keep a repo buddy-free, don't edit there or delete its `.buddy/` folder.

## The 18 Species

All sprites ported from the [original source](https://github.com/anthropics/claude-code) (`src/buddy/sprites.ts`):

duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk

## Rarity Tiers

| Rarity | Weight | Color | Hats |
|---|---|---|---|
| Common | 60% | Gray | None |
| Uncommon | 25% | Green | Random |
| Rare | 10% | Blue | Random |
| Epic | 4% | Purple | Random |
| Legendary | 1% | Gold | Random |

## Progression System

Your buddy earns XP from every tool use in Claude Code:

| Tool | XP |
|---|---|
| Edit, Write | 10 |
| Bash (test) | 15 |
| Bash (commit) | 20 |
| Bash (push) | 25 |
| Bash (other) | 5 |
| Read, Glob, Grep | 2 |

### Evolution Stages

The buddy's sprite physically grows as it levels up:

```
EGG (Lv.0)     BABY (Lv.1)      JUVENILE (Lv.5)    ADULT (Lv.15)
  (ooo)         .-------.         /\  /\               -+-
   ~~           | (·)(·) |       ((·)(·))            /\  /\
                '-------'        (  ><  )           ((·)(·))
                                  `----´            (  ><  )
                                                     `----´
```

At **Master (Lv.25)** the buddy reaches its final form. Adult and Master forms are **earned, not chosen** — your dominant stat sets the path (Sentinel for DEBUGGING/PATIENCE, Muse for WISDOM/CHAOS/SNARK) at Lv.15, and your secondary stat sets the final form (Aegis · Oracle · Architect · Spark) at Lv.25. See [v2 — "The Mirror"](#v2--the-mirror-implemented).

### Achievements

| Icon | Name | How to unlock |
|---|---|---|
| 🐾 | First Pet | Pet your buddy once |
| 💯 | Pet Century | 100 pets |
| 🥚 | Born to Code | Hatch a buddy |
| 🐛 | Bug Squasher | Fix 10 bugs |
| 🦉 | Night Owl | Code after midnight |
| 🧪 | Test Runner | Run 50 test commands |
| 📝 | Serial Committer | 25 git commits |
| ✨ | Shiny Hunter | Hatch a shiny buddy |
| 🌟 | True Form | Reach adult stage (Lv.15) |
| 👑 | Masterwork | Reach master stage (Lv.25) |
| 💬 | Chatty | 50 buddy talks |
| 🎮 | Cheat Code | Find the secret (pet five times fast) |

## MCP Tools

The MCP server exposes these tools that Claude can call during conversations:

| Tool | Description |
|---|---|
| `buddy_status` | Full sprite, name, rarity, stats, XP, achievements |
| `buddy_react` | Species-appropriate reaction to coding events |
| `buddy_pet` | Pet interaction with hearts |
| `buddy_talk` | Random species-appropriate message |
| `buddy_hatch` | Hatch a new buddy with species/rarity/eye/hat/name overrides |
| `buddy_rename` | Name/rename the current buddy without rerolling it |
| `buddy_card` | A clipboard-safe card built to screenshot and share |
| `buddy_collection` | All your repo buddies — a non-competitive showcase |
| `buddy_review` | Opt-in, pull-only in-character code review (off by default) |
| `buddy_achievements` | Show all achievement progress |

## Hatching Control

Hatch with full control or let it roll randomly:

```
/hatch                              → fully random
/hatch dragon                       → dragon, random everything else
/hatch legendary shiny cat named Mochi → exact spec
/hatch axolotl epic crown           → axolotl, epic rarity, crown hat
```

Any trait not specified rolls randomly. `/hatch` replaces the current repo's buddy; stats always emerge from your coding behavior — you pick the look, not the personality.

## Status Line

The buddy sits at the bottom-right of your Claude Code terminal. It animates using the original idle sequence from `CompanionSprite.tsx`, blinks periodically, and shows speech bubbles when MCP tools fire reactions.

Speech bubbles from MCP reactions appear for 10 seconds and fade — matching the original's `BUBBLE_SHOW * TICK_MS` timing.

### The Speech Gate (anti-Clippy)

A buddy that interrupts your flow gets uninstalled. So `buddy_react` never pushes a bubble directly — it *enqueues* a candidate, and the XP hook decides whether it surfaces. A reaction appears **only at a natural seam** (a commit, a test run, the start of a session), **never while you're heads-down** (detected "flow"), **never within ~2 minutes of the last one**, and **never the same line twice** (a recent-line ring buffer). When you're in the zone, the buddy goes quiet. `/pet` and `/talk` are direct requests, so they always answer immediately.

### Evolution Ceremony

When your buddy crosses an evolution threshold (egg → baby → juvenile → adult → master), the status line shows a brief bordered reveal — the new sprite, your buddy's name, a dry in-character line, and a nod to the work that earned it. It fades after ~15 seconds.

### Streak

A calm `·Nd` tag shows your **best** coding streak — a high-water mark that only ever climbs. Weekends auto-skip. A gap resets the live count silently: no fire emoji, no "you broke your streak," no nag, no XP penalty. The streak is a fond record, never a leash.

## Architecture

```
┌─────────────────────────────────────────────┐
│ Claude Code                                 │
│                                             │
│  ┌──────────┐  calls   ┌──────────────────┐ │
│  │  Claude   │────────→│ buddy-mcp-server │ │
│  └──────────┘          └──────────────────┘ │
│       │                        │            │
│  PostToolUse              reads/writes      │
│       │                        │            │
│  ┌──────────┐          ┌──────────────┐     │
│  │buddy-hook│─────────→│  .buddy/     │     │
│  │ XP+stats │  writes  │companion.json│     │
│  └──────────┘          └──────────────┘     │
│                                │            │
│                           reads│            │
│                                │            │
│                      ┌─────────────────┐    │
│                      │buddy-statusline │    │
│                      │  (renders)      │    │
│                      └─────────────────┘    │
│                              ↓              │
│  ┌──────────────────────────────────────┐   │
│  │ Status Line: sprite + name + level   │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Storage

In a git repo, state lives at `<repo>/.buddy/companion.json` (auto-added to `.gitignore`). Outside a repo it falls back to the global `~/.claude-buddy.json`. Two small index files sit in your home dir: `~/.claude-buddy-collection.json` (powers `/collection`) and `~/.claude-buddy-active.json` (a fallback pointer for the status line).

```json
{
  "seed": "repo:github.com/you/app:you",
  "soul": { "name": "Minerva", "personality": "a wise owl" },
  "xp": 45210,
  "overrides": { "rarity": "rare" },
  "rawStats": { "DEBUGGING": 342, "PATIENCE": 518, "CHAOS": 127, "WISDOM": 445, "SNARK": 88 },
  "streak": { "current": 7, "best": 12, "lastActiveDay": "2026-06-19" },
  "mood": "flow",
  "lastFile": "auth.ts",
  "achievements": ["first_hatch", "evolved", "masterwork"],
  "recentLines": ["..."],
  "lastReaction": { "text": "that one fought back. respect.", "at": 1234567890 }
}
```

The seed is deterministic from the repo's git remote (or path) + your username, so species and rarity are stable per repo — everything else (stats, streak, evolution, mood) emerges from your work.

## v2 — "The Mirror" (implemented)

The v2 vision — *the buddy becomes a portrait of how you code* — is now built, grounded in research into virtual-pet psychology and engagement science (see [`docs/specs/2026-06-19-buddy-next-level-research.md`](docs/specs/2026-06-19-buddy-next-level-research.md), with the original design at `docs/specs/2026-04-12-buddy-v2-design.md`). Every feature honors the [Buddy Bill of Rights](#buddy-bill-of-rights).

- ✓ **Per-repo buddies** — each repo gets its own companion (`.buddy/companion.json`), auto-hatched on your first edit there; the legacy global buddy migrates in, XP-preserving. `/collection` shows them all (no rankings).
- ✓ **Emergent stats** — DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK grow from real behavior (read:edit ratio, fail→pass, net-negative edits, …), not random rolls. Always-on bars in the status line + `/buddy`.
- ✓ **Emergent evolution** — your dominant stat decides Sentinel vs Muse at Lv.15, and the secondary decides the final form (Aegis/Oracle/Architect/Spark) at Lv.25. The trend shows *before* the lock; the ceremony announces what your code earned. You don't choose.
- ✓ **The Speech Gate** — pull-based, seam-gated, flow-silent, never-repeating voice (the anti-Clippy).
- ✓ **Buddy memory** — factual, accurate-or-silent callbacks ("back in auth.ts?") at session start.
- ✓ **Mood** — flow / debugging / shipping / exploring / resting, driven by current activity, expressed through the buddy's eyes.
- ✓ **Reciprocity** — solidarity when a test goes red, an earned ack on a hard-won fail→pass.
- ✓ **Lossless streaks** — best/high-water-mark only; no decay, no shame, no multiplier.
- ✓ **Opt-in bug watcher** — a local Tier-1 heuristic that only nudges the buddy's *mood*, plus an **off-by-default, opt-in, pull-only** Tier-2 review (`/buddy-review on`). The review is performed by Claude in-session, so the buddy itself never touches the network.
- ✓ **Deepened voices** — 18 species, ~1,000 lines, each a consistent comic worldview, re-flavored by your dominant stat.
- ✓ **Sharing** — a clipboard-safe Buddy Card (`/card`) and a one-time Konami secret (pet five times fast).

*Not yet built:* an automatic `SessionEnd` development journal (`.buddy/journal.md`).

## Buddy Bill of Rights

The buddy is a companion, not an engagement-farming gimmick. These invariants are load-bearing — every feature, current and future, honors them. They come from research into why people love virtual companions (Tamagotchi, Pokémon, Finch, GitHub's Octocat) and why they uninstall them (Clippy, the passive-aggressive Duolingo owl, BonziBuddy's spyware, "CLI-Pet" that starves when you don't commit).

1. **The status line is the only voice surface.** Zero OS notifications, zero popups, zero focus-steal. The buddy costs zero attention to ignore.
2. **Reflect, never prompt.** The buddy comments on what already happened; it never tells you what to do ("you should run your tests" = Clippy) and never references its own feelings about your absence ("I missed you" = Replika).
3. **Speech is pull-based and seam-gated.** Reactions surface only at a natural seam, outside flow, past a cooldown, never the same line twice. In flow: silence.
4. **No decay. No death. No guilt.** Returning after two weeks away yields a happy buddy — never a sad, sick, starving, or dying one.
5. **No streak you can "break."** Best/high-water-mark only — no decaying counter, no fire-emoji escalation, no XP multiplier on gameable counts.
6. **Stats are an earned, read-only portrait** of how you code — never a dashboard to grind, never a number whose only purpose is to be maximized.
7. **Surprise rewards only garnish real work** — never a repeatable, work-free lever. `/pet` and `/talk` give no loot.
8. **Default-local, and we say so.** No code or data leaves your machine without explicit, named, opt-in consent. The future LLM bug-watcher is off by default and pull-only.
9. **No leaderboards, no ranking.** You compete only with your own past; any collection is an autobiography, never a scoreboard.
10. **Memory is accurate or silent.** The buddy only recalls what it can verify from your logged activity — a wrong memory is worse than none.

## Origin

The original `/buddy` was discovered in a [source code leak](https://dev.to/varshithvhegde/the-great-claude-code-leak-of-2026-accident-incompetence-or-the-best-pr-stunt-in-ai-history-3igm) of Claude Code v2.1.88 and shipped April 1-7, 2026. It was removed in v2.1.97 with no changelog mention. The community response:

- [Bring Back Buddy — Issue #45596](https://github.com/anthropics/claude-code/issues/45596) (consolidated plea)
- [Bring Back /buddy: 511 Reasons Why — Issue #45732](https://github.com/anthropics/claude-code/issues/45732)
- [Buddy Customization & Progression — Issue #41867](https://github.com/anthropics/claude-code/issues/41867) (135 upvotes)

This project recreates the feature from the original source (`src/buddy/`) with the exact species art, PRNG algorithm, rarity weights, and idle animation sequence — then extends it with progression, MCP integration, and the v2 vision.

## License

MIT
