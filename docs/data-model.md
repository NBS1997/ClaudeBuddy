# Data Model

The buddy is one JSON object per repo at `<repo>/.buddy/companion.json`, rewritten in full on every tool
use. All fields are optional and lazily added; readers must tolerate absence (the code uses `|| 0` / `||
{}` defaults throughout). Outside a git repo the same shape lives at `~/.claude-buddy.json`.

## `companion.json`

```jsonc
{
  // ── identity (deterministic from the seed; overrides re-skin) ──
  "seed": "repo:github.com/you/app:you", // repo remote-or-path + username; fixes species/rarity/eye/hat/shiny
  "soul": { "name": "Minerva", "personality": "a wise and chaotic owl" }, // name from /hatch or /rename
  "overrides": { "rarity": "rare", "species": "owl", "shiny": true },     // user-chosen look on top of seed
  "hatchedAt": 1775989730171,           // epoch ms; presence unlocks "Born to Code"
  "repo": "C:\\Users\\you\\app",        // git root this save belongs to (metadata)
  "migratedFromGlobal": true,           // set when migrated in from the legacy global buddy

  // ── progression (emergent — earned, not rolled) ──
  "xp": 454118,                          // level = floor(sqrt(xp/200)); every tool use adds XP
  "rawStats": { "DEBUGGING": 5868, "PATIENCE": 1, "CHAOS": 8, "WISDOM": 1, "SNARK": 3 }, // raw counters
  "statSnap": { "day": "2026-06-19", "raw": { /* yesterday's rawStats */ } },            // for ↑/↓ trend
  "streak": { "current": 1, "best": 1, "lastActiveDay": "2026-06-19" },                  // best only ever climbs

  // ── achievement source counters ──
  "totalPets": 0, "totalTalks": 0,       // /pet, /talk counts
  "testRuns": 4435, "commits": 717,      // bumped by Bash test/commit commands
  "bugFixes": 0, "nightOwl": true,       // bugFixes → "Bug Squasher"; nightOwl set when coding 00:00–05:00
  "konamiUnlocked": true,                // five fast pets → secret shiny
  "subagentRuns": 0,                     // sub-agents orchestrated (SubagentStop); ≥10 → "Conductor"
  "achievements": ["first_hatch", "test_runner", "night_owl", "committer", "evolved", "masterwork"],

  // ── activity stream + mood (drives Speech Gate + status-line eye) ──
  "lastToolAt": 1781868439614,
  "recentTools": [ { "t": 1781868439614, "n": "Edit" } ], // capped at 12; feeds seam/flow detection
  "flow": true, "mood": "flow",          // mood ∈ flow|debugging|shipping|exploring|resting|neutral

  // ── voice (the Speech Gate) ──
  "pendingLines": [ { "text": "...", "kind": "react", "at": 1781868439614 } ], // enqueued candidates
  "recentLines": ["a1b2c3"],             // hashed ring buffer (last 12) — never repeat a line
  "lastReaction": { "text": "that one fought back. respect.", "at": 1781868439614 }, // current bubble (10s TTL)
  "lastBubbleAt": 1781868439614,         // cooldown anchor (~2 min)

  // ── factual memory (accurate-or-silent) ──
  "lastFile": "buddy-v2-mirror-shipped.md",
  "recentEvents": [ { "type": "commit", "detail": "fix: …", "at": 1781868439614 } ], // capped at 20

  // ── milestone surfacing (each has a short TTL the status line checks) ──
  "lastLevelUp":   { "level": 47, "at": 1781807249599 },           // ~10s
  "lastEvolution": { "from": "juvenile", "to": "adult", "at": 0, "form": "Oracle", "path": "Sentinel", "primary": "DEBUGGING" }, // ~15s ceremony
  "lastAchievement": { "name": "Masterwork", "icon": "👑", "at": 0 }, // ~10s

  // ── opt-in bug watcher ──
  "bugWatcher": { "tier2Enabled": true } // /buddy-review on|off; pull-only, off by default
}
```

### Field notes

- **`seed` vs `overrides`:** the seed alone produces a complete look. `overrides` (from `/hatch`/`/rename`)
  re-skin it; rarity overrides also re-roll the stat *floor* deterministically. Both the MCP server and
  status line apply overrides the same way so the surfaces agree.
- **`rawStats` are counters, not percentages.** The 0–100 bars shown to the user are each stat's *share* of
  total activity (`displayStats`), so a stat can rise on the bar while another's raw value also grows. See
  [`progression.md`](progression.md) for the accrual rules.
- **`statSnap`** captures the previous day's raw totals so the status line can show a coarse ↑/→/↓ trend.
- **Milestone fields are write-once-per-event with a TTL** read by the status line — they are *displayed*,
  not authoritative state. The authoritative state is `xp` (level/stage) and `rawStats` (path/form).
- **`recentLines`** stores FNV-1a hashes of shown lines, not the lines themselves.

## Home-directory index / pointer files

| File | Shape | Purpose |
|---|---|---|
| `~/.claude-buddy.json` | a `companion.json` + `migratedTo` | The legacy global buddy. Migrates into the first repo edited after upgrade, then `migratedTo` blocks re-migration. Outside any repo, the active buddy. |
| `~/.claude-buddy-collection.json` | `{ "buddies": { "<gitRoot>": { repo, savePath, seed, name, xp, lastSeen } } }` | Cross-repo index for `/collection`. Keyed by git root; ordered by recency, never ranked by XP. |
| `~/.claude-buddy-active.json` | `{ savePath, repo, scope, at }` | "Last active repo" pointer. **Read only as the status line's last resort** when a session cwd is unavailable — resolving from it normally would bleed buddies across windows. |

## Lifecycle

- **Auto-hatch on real activity only.** `ensureBuddySave(ctx, { autoHatch })` creates a save only on
  Edit/Write/commit — never on reads or `cd` — so throwaway directories don't accrue junk buddies.
- **Migration is one-time.** The first real edit in a repo after upgrading moves the global buddy in
  (XP/level/name preserved); the global file is kept as a backup and marked `migratedTo`.
- **Deletion** = remove the repo's `.buddy/` folder. (The collection entry goes stale until next refresh;
  prune it from `~/.claude-buddy-collection.json` if you want `/collection` clean immediately.)
