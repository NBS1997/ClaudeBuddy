# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Claude Buddy is a terminal companion (Tamagotchi) for Claude Code: a per-repo pet that lives in the
status line, reacts via MCP tools, and turns *how you code* into emergent stats and an evolution path.
It is plain Node.js (v20, stdlib only — **no package.json, no dependencies, no build step**).

## Commands

```bash
# Run the standalone full-screen terminal pet (its own thing, not the Claude Code integration)
node claude-buddy.js

# Voice lint — the only CI-style check. Enforces "reflect-never-prompt" (Bill of Rights #2)
# on every quoted string in the voice-bearing files. Exit 1 on any violation. Wire into pre-commit/CI.
node scripts/voice-lint.js

# Register the MCP server (user scope = available in every repo)
claude mcp add -s user buddy -- node /path/to/ClaudeBuddy/buddy-mcp-server.js
```

There is **no automated test suite**. To verify MCP server behavior without restarting Claude Code,
drive it directly over stdio JSON-RPC (set `CLAUDE_PROJECT_DIR` to choose which repo's buddy it resolves):

```bash
CLAUDE_PROJECT_DIR="/path/to/some/repo" printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"s","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"buddy_status","arguments":{}}}' \
  | node buddy-mcp-server.js
```

**Dev-loop gotcha:** the hook and status line are spawned *per invocation*, so edits to them take effect
immediately. The **MCP server is long-lived per session** and resolves its repo **once at startup**, so
edits to `buddy-mcp-server.js` (or MCP config changes) require restarting Claude Code or `/mcp` reconnect.

## Architecture (big picture)

Four entrypoints share three libraries; everything funnels through one save file per repo.

- **Entrypoints:** `claude-buddy.js` (standalone CLI) · `buddy-mcp-server.js` (MCP server, the `buddy_*`
  tools) · `buddy-statusline.js` (status-line renderer) · `buddy-hook.js` (PostToolUse hook).
- **Libraries:** `buddy-progression.js` (XP/levels/stages/emergent stats/evolution/achievements/streak) ·
  `buddy-paths.js` (storage resolution, migration, collection index) · `buddy-voice.js` (~1000 voice lines).
- **The single source of truth is `<repo>/.buddy/companion.json`.** The **hook writes** it on every tool
  use (XP, stats, mood, streak, evolution, memory). The **MCP server reads + writes** it (interactions).
  The **status line only reads** it. Three home-dir files support this: `~/.claude-buddy.json` (legacy
  global buddy + one-time migration source), `~/.claude-buddy-collection.json` (powers `/collection`),
  `~/.claude-buddy-active.json` (status-line last-resort pointer — see invariant below).

See `docs/` for the full knowledge base (data model, resolution matrix, mechanics, design rationale).

## Load-bearing invariants — do not break these

1. **Per-session repo resolution.** Each surface must resolve *its own session's* repo, never a shared/
   ambient one, or buddies bleed across concurrent windows. The hook uses `hookData.cwd`; the status line
   reads `cwd` from its stdin payload; the MCP server uses `process.env.CLAUDE_PROJECT_DIR`. **Never use
   `process.cwd()`** for resolution, and **never read `~/.claude-buddy-active.json`** except as a true last
   resort when no session cwd is available. (This is the exact cross-window-bleed bug already fixed once.)

2. **The roll + sprite logic is duplicated and must stay byte-identical** across `claude-buddy.js`,
   `buddy-mcp-server.js`, and `buddy-statusline.js`: `SALT = 'friend-2026-401'`, the `mulberry32`/
   `hashString` PRNG, the `SPECIES`/`EYES`/`HATS` arrays, and the *order* of `rng()` calls in `roll()`.
   Change one without the others and the same buddy renders differently in its status line vs. its reports.

3. **`buddy_card` must stay escape-code-free** (no ANSI / cursor codes) — it is the paste-safe artifact for
   screenshots and Slack/Discord. ANSI rarity colour lives only in `buddy_status`, which the skill renders raw.

4. **The Bill of Rights is binding** (see README "Buddy Bill of Rights"). Voice is pull-based and
   seam-gated (the Speech Gate in `buddy-hook.js`): `buddy_react` only *enqueues* `pendingLines`; the hook
   surfaces at most one, at a seam, outside flow, past a ~2-min cooldown, never repeating. No decay/guilt/
   nagging; stats are read-only; nothing leaves the machine without opt-in (`buddy_review` is off by default).
   `scripts/voice-lint.js` mechanically guards the no-instruction / no-neediness rule.

5. **Determinism vs. emergence.** The seed (`repo remote-or-path + username`) fixes species/rarity per repo
   and must never depend on time/random; *everything else* (XP, stats, streak, mood, evolution) emerges from
   logged behavior. `companion.json` is rewritten in full on every tool use. Concurrent writers (parallel
   sub-agent hooks — PostToolUse fires for sub-agent tool calls too — and the MCP server) are serialized by
   a **lockfile mutex** (`withLock` in `buddy-paths.js`) around the read-modify-write, and writes are
   **atomic** (temp-file + rename, so readers never see a torn file). The hook reads *inside* the lock; the
   MCP server re-reads fresh inside `commit(applyDelta)` so its writes can't clobber the hook's XP. The lock
   degrades to last-write-wins only if it can't be acquired within its budget (never drops the update, never
   throws). Always go through `safeReadJSON`/`safeWriteJSON` (now atomic) and `withLock`.

## Conventions

- Pure CommonJS, `'use strict'`, Node stdlib only — keep it dependency-free.
- Save I/O never throws: use `safeReadJSON`/`safeWriteJSON` from `buddy-paths.js`.
- A buddy auto-hatches only on *real activity* (Edit/Write/commit), never on reads or `cd`, so throwaway
  dirs stay clean. Per-repo saves are gitignored (`.buddy/` auto-added to the repo's `.gitignore`).
