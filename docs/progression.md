# Progression Mechanics

All logic lives in `buddy-progression.js` (pure functions, no I/O). This is the reference for the numbers.

## XP

`xpForTool(toolName, toolInput)` — earned on **every** tool use (the hook has no matcher):

| Tool | XP |
|---|---|
| Edit / Write / NotebookEdit | 10 |
| Read / Glob / Grep | 2 |
| Bash — test (`jest`/`pytest`/`vitest`/`mocha`/`npm test`) | 15 |
| Bash — `git commit` | 20 |
| Bash — `git push` | 25 |
| Bash — other | 5 |
| anything else | 3 (fallback) |
| `SubagentStop` (a sub-agent finishes — credit for the *act* of delegating) | 5 |

PostToolUse fires for **sub-agent** tool calls too, so a sub-agent's inner Edits/Bash/etc. already earn XP
on the right buddy. `SubagentStop` (fired by the `Task`/Agent spawn, not a PostToolUse) adds a small flat
bump for orchestrating — handled in `runSubagentStop`, which never auto-hatches a buddy.

XP is **unmetered** — no cooldown, dedup, or diminishing returns — so it tracks tool *volume*. Long
autonomous sessions accrue XP steadily; that is current behavior, not a bug. (If level should reflect effort
over volume, add pacing here — it is the single choke point.)

## Levels & stages

```
level = floor(sqrt(xp / 200))      xpForLevel(L) = L*L*200
```

| Stage | Levels | XP floor |
|---|---|---|
| egg | 0 | 0 |
| baby | 1–4 | 200 |
| juvenile | 5–14 | 5,000 |
| adult | 15–24 | 45,000 |
| master | 25+ | 125,000 |

Rough cadence (by design): Lv.1 ≈ first session, Lv.5 ≈ a day, Lv.15 (adult) ≈ 2–3 weeks.

## Emergent stats

Five stats — **DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK** — are *not rolled*. `accrueStats(save, ev)` adds
raw points per tool event; they are read-only and shown relative to each other.

| Stat | Earned from |
|---|---|
| **DEBUGGING** | test runs (+1); commits whose message says fix/bug/patch/hotfix/resolve/repair (+3) |
| **PATIENCE** | Read / Grep / Glob (+1 each); a sub-agent finishing (`SubagentStop`, +1) — understanding/marshalling before acting |
| **CHAOS** | rapid edits (<30s apart, +1); `git push --force` (+3); `git revert`/`reset` (+2) |
| **WISDOM** | reading docs (`.md`/`.rst`/`.txt`/…, +1); net-negative edits where new < old length (+1) — simplification |
| **SNARK** | coding 00:00–05:00 (+1); also +1 from a revert/reset |

`seedRawStats` back-fills on first read from the only history kept (`testRuns + commits*2 + bugFixes*3` into
DEBUGGING; `+3 SNARK` if `nightOwl`) — honest, not invented.

`displayStats(save)` converts raw counters to a 0–100 **share** scale (`round(share * 250)`, capped 100),
with a ↑/→/↓ trend vs. `statSnap` (yesterday) and the `dominant` stat (highest raw). Each stat has a fixed
`STAT_MEANING` string.

## Evolution paths (you don't choose — your code does)

`evolutionInfo(save)` returns identity only once adult/master; `trendingPath(save)` previews the path
*before* it locks so it's recognized, not sprung.

- **At adult (Lv.15)** the **dominant** stat sets the path:
  - DEBUGGING or PATIENCE → **Sentinel** (glyph `⊕`)
  - CHAOS, WISDOM, or SNARK → **Muse** (glyph `✦`)
- **At master (Lv.25)** the **secondary** stat sets the final form:

  | Path | secondary = PATIENCE | secondary = CHAOS | otherwise |
  |---|---|---|---|
  | Sentinel | **Aegis** | — | **Oracle** |
  | Muse | — | **Spark** | **Architect** |

The status line announces transitions with a ~15s ceremony (`evolutionLine` provides the in-character lore,
species-specific at adult). Forms are *earned, not chosen*.

## Achievements

`checkAchievements` / `allAchievements` over `ACHIEVEMENT_DEFS` (id → name → icon → `check(save)`):

| Icon | Name | Unlock |
|---|---|---|
| 🐾 | First Pet | `totalPets ≥ 1` |
| 💯 | Pet Century | `totalPets ≥ 100` |
| 🥚 | Born to Code | `hatchedAt` set |
| 🐛 | Bug Squasher | `bugFixes ≥ 10` |
| 🦉 | Night Owl | coded 00:00–05:00 |
| 🧪 | Test Runner | `testRuns ≥ 50` |
| 📝 | Serial Committer | `commits ≥ 25` |
| ✨ | Shiny Hunter | `overrides.shiny === true` |
| 🌟 | True Form | level ≥ 15 |
| 👑 | Masterwork | level ≥ 25 |
| 💬 | Chatty | `totalTalks ≥ 50` |
| 🎮 | Cheat Code | `konamiUnlocked` (five fast pets) |

## Streak (lossless)

`recordStreak(save, date)` tracks a high-water mark only:

- Same day → no change. First ever → `current = 1`.
- Next active day with **0 weekdays missed in between** → `current++` (weekends auto-skip via
  `weekdaysBetween`).
- Any larger gap → `current = 1`, **silently** — no message, no sad sprite, no XP penalty.
- `best = max(best, current)` and only ever climbs. The status line shows `·Nd` for `best ≥ 3`.

This is deliberate (Bill of Rights #5): there is no streak you can "break."
