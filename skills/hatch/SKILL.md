---
name: hatch
description: Hatch a new Claude Buddy with optional species, rarity, eye, hat, and name overrides
disable-model-invocation: true
argument-hint: [options like: dragon legendary shiny crown "Ember"]
---

Call the `buddy_hatch` MCP tool from the `buddy` server.

Parse $ARGUMENTS to extract any preferences the user specified. Map them to the tool's parameters:

**Species** (pass as `species`): duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk

**Rarity** (pass as `rarity`): common, uncommon, rare, epic, legendary

**Eyes** (pass as `eye`): one of these characters: · ✦ × ◉ @ °

**Hats** (pass as `hat`, uncommon+ only): crown, tophat, propeller, halo, wizard, beanie, tinyduck

**Shiny** (pass as `shiny`): if the user says "shiny", pass `true`

**Name** (pass as `name`): any quoted string or the word after "named"/"called"

Any trait not mentioned by the user should be omitted (rolled randomly).

Examples:
- `/hatch dragon` → `{ "species": "dragon" }`
- `/hatch legendary shiny cat named Mochi` → `{ "species": "cat", "rarity": "legendary", "shiny": true, "name": "Mochi" }`
- `/hatch` → `{}` (fully random)
- `/hatch axolotl epic crown` → `{ "species": "axolotl", "rarity": "epic", "hat": "crown" }`

Display the full result — it shows the hatching reveal with sprite, rarity badge, stats, and greeting.

**Then, if the user did NOT specify a name**, warmly invite them to name their new buddy — one short line, and make it clear it's optional (they can skip). Naming is the single biggest boost to how attached someone gets to their buddy, so it's worth offering, but never push.

When the user gives a name, call the `buddy_rename` MCP tool with it (this keeps the same buddy — species, rarity, stats, XP — and just gives it a name). If they decline or ignore it, leave the buddy unnamed and move on. Do not ask twice.
