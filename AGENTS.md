# Claude Buddy

Shared instructions for every coding agent on this repo. Don't add a `CLAUDE.md` or
`CLAUDE.local.md` anywhere: Claude Code reads those instead and silently ignores this file.

JavaScript (CommonJS) on Node.js with zero npm dependencies: no `package.json`, no lockfile,
only Node built-ins. A recreation of Claude Code's `/buddy` companion: a standalone terminal
pet, an MCP server, a status-line renderer and a `PostToolUse` XP hook. Source sits flat at
the repo root (`*.js`); slash-command prompts live in `skills/<name>/SKILL.md`. No minimum
Node version is declared.

## Commands

```bash
node scripts/voice-lint.js     # voice lint: exits 1 if any line instructs or guilt-trips the user
node --check <file>.js         # syntax check; there is no build step
node claude-buddy.js           # standalone full-screen terminal pet (interactive)
```

No automated tests yet. There is no install step: users point Claude Code straight at the
files in a clone (see README "Quick Start").

## Critical Rules

1. **Australian English** in new prose and new code: colour, behaviour, honour, organise.
   Existing identifiers such as `color` and `FLAVOR` predate this rule; don't rename them
   in passing.
2. **The Buddy Bill of Rights (README) is load-bearing.** Every feature must honour it: the
   status line is the only voice surface, reflect never prompt, no decay or guilt, no
   leaderboards, and the buddy itself never touches the network.
3. **Every new voice line must pass `node scripts/voice-lint.js`**: no instructions ("you
   should…") and no neediness ("I missed you"). It only scans the four files listed in its
   `FILES` array, so add any new file that holds voice lines there.
4. **Zero dependencies.** Node built-ins and relative `require('./buddy-*.js')` only. Modules
   must sit side by side at the root, because users' config points at this folder.
5. **The MCP server speaks newline-delimited JSON-RPC on stdout.** Log through its `log()`
   helper (stderr); a stray `console.log` in `buddy-mcp-server.js` or anything it requires
   breaks the protocol.
6. **`buddy-statusline.js` runs on every tick and is meant to stay under ~50 ms.** Don't add
   git spawns, network calls or heavy work there; the active pointer in `buddy-paths.js`
   exists to avoid that.
7. **MCP tool names (`buddy_*`) are referenced from `skills/*/SKILL.md` and the README.**
   Renaming or adding a tool means updating all three.
8. **Running the hook, MCP server or status line writes real state**: `<repo>/.buddy/`
   (gitignored, never commit it) and `~/.claude-buddy*.json` in your home folder.

## Documentation Map

| When you need... | Read |
|---|---|
| Setup, file roles, MCP tools, storage format, the Bill of Rights | `README.md` |
| The v2 "Mirror" design: per-repo buddies, emergent stats, evolution paths | `docs/specs/2026-04-12-buddy-v2-design.md` |
| The research behind v2 and the Bill of Rights | `docs/specs/2026-06-19-buddy-next-level-research.md` |
| The original XP, levels and achievements build plan (historical) | `docs/plans/2026-04-12-buddy-progression.md` |
| What each slash command asks Claude to do | `skills/<name>/SKILL.md` |

## Working Agreements

- Default branch is `master`. Branch before committing; don't commit to it directly.
- There is no CI and no pre-commit hook. Before committing, run `node --check` on every
  changed `.js` file and `node scripts/voice-lint.js`.
- Commit messages follow the existing style: `feat(buddy): …`, `fix(buddy): …`,
  `docs(buddy): …`.
