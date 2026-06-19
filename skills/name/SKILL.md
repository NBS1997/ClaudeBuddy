---
name: name
description: Name (or rename) your current Claude Buddy without rerolling it
disable-model-invocation: true
argument-hint: [a name, e.g. "Minerva"]
---

Call the `buddy_rename` MCP tool from the `buddy` server, passing the name from `$ARGUMENTS` as `name`.

This keeps the exact same buddy — same species, rarity, stats, and XP — and only changes its name. If `$ARGUMENTS` is empty, ask the user what they'd like to name their buddy (one short line), then call `buddy_rename` with their answer.

Display the result exactly as returned.
