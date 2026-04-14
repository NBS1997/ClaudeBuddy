---
name: buddy
description: Show your Claude Buddy companion — the terminal pet that lives alongside your coding session
disable-model-invocation: true
---

Call the `buddy_status` MCP tool from the `buddy` server to show the user's companion.

Display the result exactly as returned — it contains the full ASCII sprite, name, rarity, species, eye, hat, and stat bars.

If the user added arguments like "pet" or "talk", route to the appropriate action:
- If $ARGUMENTS contains "pet": call `buddy_pet` instead
- If $ARGUMENTS contains "talk" or "say": call `buddy_talk` instead
- If $ARGUMENTS contains "hatch": call `buddy_hatch` instead, passing any species/rarity/name preferences from the arguments
- Otherwise: call `buddy_status`
