# Claude Buddy — Knowledge Base

The fuller reference behind the top-level [`CLAUDE.md`](../CLAUDE.md). Start there for the quick map and
the load-bearing invariants; come here for the depth.

## Contents

| Doc | What it covers |
|---|---|
| [`architecture.md`](architecture.md) | Module map, data flow, the per-session resolution matrix, the duplicated-render sync contract, the Speech Gate state machine, storage & home-dir files, and dev workflows. |
| [`data-model.md`](data-model.md) | Full `companion.json` field reference and the three home-dir index/pointer files. |
| [`progression.md`](progression.md) | The mechanics: XP table, level/stage curves, emergent stat accrual rules, evolution paths & forms, achievements, streaks. |

## Design history (pre-existing)

| Doc | What it is |
|---|---|
| [`specs/2026-04-12-buddy-v2-design.md`](specs/2026-04-12-buddy-v2-design.md) | The original v2 ("The Mirror") design spec. |
| [`specs/2026-06-19-buddy-next-level-research.md`](specs/2026-06-19-buddy-next-level-research.md) | Virtual-pet psychology / engagement research that grounds the Bill of Rights. |
| [`plans/2026-04-12-buddy-progression.md`](plans/2026-04-12-buddy-progression.md) | The progression-system implementation plan. |

## The non-negotiables

Everything in this codebase serves the **Buddy Bill of Rights** (see the project README). The buddy is a
companion, not an engagement-farming gimmick: status-line-only, reflect-never-prompt, pull-based and
seam-gated speech, no decay/death/guilt, no breakable streak, read-only earned stats, default-local, no
leaderboards, accurate-or-silent memory. `scripts/voice-lint.js` enforces the line-level half of this in CI.
