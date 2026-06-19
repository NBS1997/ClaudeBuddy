---
name: buddy-review
description: Pull an opt-in, in-character code review from your buddy
disable-model-invocation: true
argument-hint: [on | off]
---

Call the `buddy_review` MCP tool from the `buddy` server:
- If `$ARGUMENTS` is "on" / "enable", call it with `{ "enable": true }`.
- If `$ARGUMENTS` is "off" / "disable", call it with `{ "enable": false }`.
- Otherwise call it with no arguments to pull a review.

If the tool result begins with `[buddy_review` it is an in-character instruction — FOLLOW it: review the most recent change in this conversation and respond with the buddy's one terse verdict line (or `ok` if it's clean). Otherwise, display the returned message exactly as-is.

This review is pull-only and off by default. It never runs mid-edit, and the review is performed here in-session — the buddy itself never sends anything over the network.
