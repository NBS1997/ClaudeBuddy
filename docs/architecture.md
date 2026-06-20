# Architecture

Plain Node.js (v20, stdlib only). No package.json, no dependencies, no build step. Four entrypoints share
three libraries and converge on a single per-repo save file.

## Module map

```
                 ┌────────────────────── shared libraries ──────────────────────┐
                 │ buddy-progression.js   XP · levels · stages · emergent stats  │
                 │                        evolution paths · achievements · streak│
                 │ buddy-paths.js         storage resolution · migration ·       │
                 │                        collection index · safe JSON I/O       │
                 │ buddy-voice.js         ~1000 voice lines (18 species ×        │
                 │                        stat-modulated flavor)                 │
                 └───────────────────────────────────────────────────────────────┘
                          ▲              ▲                ▲              ▲
        ┌─────────────────┘              │                │              └────────────────┐
        │                                │                │                               │
┌───────────────┐            ┌────────────────────┐ ┌──────────────────┐        ┌──────────────────┐
│ claude-buddy  │            │ buddy-mcp-server   │ │ buddy-statusline │        │ buddy-hook       │
│ standalone CLI│            │ MCP: buddy_* tools │ │ status renderer  │        │ PostToolUse hook │
│ (own loop)    │            │ reads + writes     │ │ reads only       │        │ writes           │
└───────────────┘            └─────────┬──────────┘ └────────┬─────────┘        └────────┬─────────┘
                                       │                     │ reads                     │ writes
                                       └─────────────► <repo>/.buddy/companion.json ◄─────┘
```

`claude-buddy.js` is a self-contained recreation of the original full-screen pet; it shares the seed/roll
math but runs its own render loop and is not part of the Claude Code integration path.

## Data flow per tool use

1. You run any tool in Claude Code.
2. **PostToolUse hook** (`buddy-hook.js`, `async:true`) fires — for *every* tool, no matcher. It resolves
   the session repo from `hookData.cwd`, loads/creates that repo's save, then updates XP, emergent stats,
   mood, streak, tool-event stream, evolution transitions, factual memory (`lastFile`, commit events), and
   runs the Speech Gate. It rewrites `companion.json`, then `~/.claude-buddy-active.json` and the collection.
3. **Status line** (`buddy-statusline.js`, every refresh tick) reads `cwd` from its stdin payload, resolves
   that repo's save, and renders the sprite/name/level/stats/bubble/ceremony. **Render only — never writes.**
4. **MCP server** (`buddy-mcp-server.js`) handles `buddy_*` tool calls; interaction tools (`pet`, `talk`,
   `react`, `hatch`, `rename`, `review`) write the save.

## Per-session repo resolution (the load-bearing invariant)

Each surface must learn *which repo this session is in* from a per-session signal — never `process.cwd()`
(which for a user-scoped server is the launcher's dir, shared across editor windows) and never the shared
active pointer except as a true last resort. Getting this wrong bleeds one repo's buddy into another's
window/report (a bug already fixed once — keep it fixed).

| Surface | Repo signal | Notes |
|---|---|---|
| `buddy-hook.js` | `hookData.cwd` (stdin payload) | Correct per session; spawned per invocation. |
| `buddy-statusline.js` | `cwd` from stdin payload | Falls back to `~/.claude-buddy-active.json` **only** when no cwd is available. |
| `buddy-mcp-server.js` | `process.env.CLAUDE_PROJECT_DIR` | Claude Code sets it per session; resolved **once at startup** (server is long-lived). Falls back to `process.cwd()` only if unset. |
| `claude-buddy.js` | `process.cwd()` | Correct — a standalone CLI run by the user in their shell. |

All resolution goes through `resolveContext(cwd)` in `buddy-paths.js`, which walks up to the git root,
derives the deterministic seed, and returns `{ scope, gitRoot, buddyDir, savePath, seed }`.

## Determinism vs. emergence

- **Deterministic (from the seed):** species, rarity, eye, hat, shiny. Seed = `repo:<normalized remote or
  path>:<username>` (or just `<username>` outside a repo). Same person + same repo ⇒ same look, always.
  Fork the repo (different remote) ⇒ a different buddy. The seed must **never** depend on time or randomness.
- **Emergent (from logged behavior):** XP/level/stage, the five stats, evolution path/form, streak, mood,
  memory. These are earned, read-only, and accumulate over time.
- **User overrides:** `/hatch` and `/rename` write a `soul`/`overrides` block that re-skins the look on top
  of the seed — but stats and personality still emerge. Both the MCP server and status line apply overrides
  identically so the two surfaces agree.

## The duplicated-render sync contract

The seed→bones roll and the sprite art are **intentionally duplicated** in `claude-buddy.js`,
`buddy-mcp-server.js`, and `buddy-statusline.js` (the status line avoids `require`-ing heavy modules to stay
fast). They must stay identical or a buddy looks different in its status line vs. its `buddy_status`/
`buddy_card` reports. The parts that must match:

- `SALT = 'friend-2026-401'`
- `mulberry32(seed)` and `hashString(s)` (FNV-1a) — byte-for-byte
- the `SPECIES`, `EYES`, `HATS`, `RARITIES`, `RARITY_WEIGHTS`, `RARITY_FLOOR` tables
- the **order** of `rng()` consumption inside `roll()` (rarity → species → eye → hat → shiny → stats)
- the `BODIES` sprite frames + `HAT_LINES`

If you change any of these, change all copies together and re-verify with the MCP smoke test plus a status-
line glance.

## The Speech Gate (anti-Clippy state machine)

Speech is **pull, not push**. `buddy_react` never writes to the status line; it appends a candidate to
`save.pendingLines`. The hook decides if/when one surfaces, in `buddy-hook.js`:

- A **seam** is a natural pause: a `git commit`/`push`, a test run, the start of a session (>30 min idle),
  or an explicit `buddy_react`.
- **Flow** = heads-down: ≥6 tool events in a 3-min window with no seam. In flow, the buddy is silent.
- A queued line surfaces only **at a seam, not in flow, past a ~2-min cooldown, and never if it (or a recent
  line) is in the de-dup ring buffer** (`recentLines`, last 12 hashed). Otherwise the queue is cleared unsurfaced.
- `/pet` and `/talk` are direct requests — they answer immediately (still recorded to the ring buffer).

`mood` (flow / debugging / shipping / exploring / resting) is derived here too and drives the status-line
eye. A local Tier-1 error scan of tool output can nudge mood to `debugging` — mood only, never a bubble,
never the network.

## Storage & home-dir files

| Path | Role | Written by |
|---|---|---|
| `<repo>/.buddy/companion.json` | The buddy. Single source of truth. Gitignored (`.buddy/` auto-appended to the repo's `.gitignore`). | hook + MCP server |
| `~/.claude-buddy.json` | Legacy global buddy + one-time migration source ("she finds her home" — migrates into the first repo on first edit, then is marked `migratedTo`). | migration / global scope |
| `~/.claude-buddy-collection.json` | Cross-repo index powering `/collection`. Keyed by git root. A showcase, never a ranking. | hook + MCP server |
| `~/.claude-buddy-active.json` | "Last active repo" pointer. **Status-line last resort only** when no session cwd is available. | hook + MCP server |

`safeReadJSON`/`safeWriteJSON` wrap all I/O and never throw — a missing/corrupt file reads as `null`.

## Dev workflows

- **Edit hook / status line:** spawned per invocation, so changes apply on the next tool use / refresh tick.
- **Edit MCP server:** long-lived per session and resolves its repo once at startup → restart Claude Code
  (or `/mcp` reconnect) to load new code or pick up config changes.
- **Verify the MCP server without restarting Claude:** drive it over stdio JSON-RPC (see `CLAUDE.md`
  "Commands"); set `CLAUDE_PROJECT_DIR` to choose the repo, send `initialize` then `tools/call`.
- **Before committing voice changes:** run `node scripts/voice-lint.js` (it scans `buddy-voice.js`,
  `buddy-mcp-server.js`, `buddy-statusline.js`, `buddy-progression.js`).
- **Concurrency caveat:** multiple terminals in the same repo do unlocked read-modify-write on one
  `companion.json`; simultaneous bursts are last-write-wins (lost increments, never corruption).
