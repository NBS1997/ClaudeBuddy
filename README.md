# Claude Buddy

A faithful recreation of the `/buddy` companion from Claude Code v2.1.96 — the terminal Tamagotchi that Anthropic shipped for April Fools 2026 and silently removed in v2.1.97.

This version goes further: your buddy lives in Claude Code's status line, reacts to your work via MCP tools, earns XP from every tool use, evolves through stages, and tracks achievements.

```
    -+-              ╭──────────────────╮
   /\  /\            │ Nice refactor!   │
  ((·)(·))           ╰──────────────────╯─
  (  ><  )                    
   `----´            
   Minerva Lv.8 🔥🔥
```

## What's Here

| File | Purpose |
|---|---|
| `claude-buddy.js` | Standalone terminal pet — run it for the full-screen Tamagotchi experience |
| `buddy-mcp-server.js` | MCP server — integrates the buddy into Claude Code conversations |
| `buddy-statusline.js` | Status line renderer — animated sprite at the bottom of Claude Code |
| `buddy-hook.js` | PostToolUse hook — silently awards XP on every tool use |
| `buddy-progression.js` | Shared module — XP math, levels, evolution stages, achievements |

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
| `/achievements` | Show achievement progress |

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
| 🌟 | Final Form | Reach adult stage |
| 💬 | Chatty | 50 buddy talks |

## MCP Tools

The MCP server exposes 6 tools that Claude can call during conversations:

| Tool | Description |
|---|---|
| `buddy_status` | Full sprite, name, rarity, stats, XP, achievements |
| `buddy_react` | Species-appropriate reaction to coding events |
| `buddy_pet` | Pet interaction with hearts |
| `buddy_talk` | Random species-appropriate message |
| `buddy_hatch` | Hatch a new buddy with species/rarity/eye/hat/name overrides |
| `buddy_achievements` | Show all achievement progress |

## Hatching Control

Hatch with full control or let it roll randomly:

```
/hatch                              → fully random
/hatch dragon                       → dragon, random everything else
/hatch legendary shiny cat named Mochi → exact spec
/hatch axolotl epic crown           → axolotl, epic rarity, crown hat
```

Any trait not specified rolls randomly. Stats always emerge from your coding behavior (v2 roadmap).

## Status Line

The buddy sits at the bottom-right of your Claude Code terminal. It animates using the original idle sequence from `CompanionSprite.tsx`, blinks periodically, and shows speech bubbles when MCP tools fire reactions.

Speech bubbles from MCP reactions appear for 10 seconds and fade — matching the original's `BUBBLE_SHOW * TICK_MS` timing.

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
│  │buddy-hook│─────────→│.claude-buddy │     │
│  │  (XP)    │  writes  │    .json     │     │
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

## Save File

State persists at `~/.claude-buddy.json`. Both the standalone app and MCP server read/write from the same file:

```json
{
  "seed": "buddy-...",
  "soul": { "name": "Minerva", "personality": "a wise owl" },
  "xp": 7922,
  "overrides": { "rarity": "rare" },
  "achievements": ["first_hatch", "first_pet", "shiny_hunter"],
  "totalPets": 42,
  "testRuns": 31,
  "commits": 8,
  "lastReaction": { "text": "*watches intently*", "at": 1234567890 }
}
```

## Roadmap (v2 — "The Mirror")

The v2 design spec (`docs/specs/2026-04-12-buddy-v2-design.md`) reimagines the buddy as a reflection of how you code:

- **Per-repo buddies** — each project gets its own companion, auto-hatched
- **Emergent stats** — DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK grow from actual coding behavior, not random rolls
- **Emergent evolution** — your dominant stat determines the evolution path (Sentinel/Muse → Aegis/Oracle/Architect/Spark). You don't choose — your code chooses.
- **Buddy memory** — references recent events, knows your project, speaks contextually
- **Mood system** — flow, debugging, shipping, exploring, resting — driven by current activity
- **Autonomous bug watcher** — heuristic scanning (free) + LLM review on edits (Haiku, pennies)
- **Session journal** — auto-generated development diary
- **Streaks & milestones** — coding streaks with XP multipliers, personal records

## Origin

The original `/buddy` was discovered in a [source code leak](https://dev.to/varshithvhegde/the-great-claude-code-leak-of-2026-accident-incompetence-or-the-best-pr-stunt-in-ai-history-3igm) of Claude Code v2.1.88 and shipped April 1-7, 2026. It was removed in v2.1.97 with no changelog mention. The community response:

- [Bring Back Buddy — Issue #45596](https://github.com/anthropics/claude-code/issues/45596) (consolidated plea)
- [Bring Back /buddy: 511 Reasons Why — Issue #45732](https://github.com/anthropics/claude-code/issues/45732)
- [Buddy Customization & Progression — Issue #41867](https://github.com/anthropics/claude-code/issues/41867) (135 upvotes)

This project recreates the feature from the original source (`src/buddy/`) with the exact species art, PRNG algorithm, rarity weights, and idle animation sequence — then extends it with progression, MCP integration, and the v2 vision.

## License

MIT
