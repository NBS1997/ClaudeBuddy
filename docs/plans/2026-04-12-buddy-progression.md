# Claude Buddy Progression System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add XP/leveling, sprite evolution (egg → baby → juvenile → adult), auto-observer hook, and achievements so the buddy grows alongside your coding activity.

**Architecture:** XP is awarded by a `PostToolUse` hook that writes events to the save file. The MCP server reads XP, computes level, and selects the appropriate evolution stage when rendering sprites. The status line shows the current stage sprite + level. Achievements are checked on each XP award and stored in the save file.

**Tech Stack:** Node.js (zero deps), Claude Code hooks (settings.json), shared JSON save file (`~/.claude-buddy.json`).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `C:/Users/natys/ClaudeBuddy/buddy-progression.js` | Create | XP/level math, achievement definitions, evolution stage logic — shared module |
| `C:/Users/natys/ClaudeBuddy/buddy-hook.js` | Create | PostToolUse hook script — awards XP, checks achievements, writes to save file |
| `C:/Users/natys/ClaudeBuddy/buddy-mcp-server.js` | Modify | Import progression module, add `buddy_achievements` tool, use evolution stage in renders |
| `C:/Users/natys/ClaudeBuddy/buddy-statusline.js` | Modify | Show evolution-stage sprite + level indicator |
| `C:/Users/natys/.claude/settings.json` | Modify | Add PostToolUse hook entry |
| `C:/Users/natys/.claude/skills/achievements/SKILL.md` | Create | `/achievements` slash command |

## Evolution Stages & Sprite Sizes

| Stage | Level | Sprite Height | Description |
|---|---|---|---|
| Egg | 0 | 2 lines | Just an egg with the rarity color. No species visible yet. |
| Baby | 1-4 | 3 lines | Species face only — the `renderFace()` output centered in a small frame. |
| Juvenile | 5-14 | 4 lines | Full species art, but top line (hat slot) always blank. No hats yet. |
| Adult | 15+ | 4-5 lines | Full original art with hat. Unlocks at max evolution. |

## XP Table

| Tool Used | XP Awarded |
|---|---|
| Edit, Write, NotebookEdit | 10 |
| Bash (test/jest/pytest/npm test) | 15 |
| Bash (git commit) | 20 |
| Bash (git push) | 25 |
| Bash (other) | 5 |
| Read, Glob, Grep | 2 |
| Any other tool | 3 |

**Level formula:** `level = floor(sqrt(xp / 50))` — Level 1 at 50 XP, Level 5 at 1250 XP, Level 15 at 11250 XP.

## Achievements

| ID | Name | Condition | Icon |
|---|---|---|---|
| `first_pet` | First Pet | totalPets >= 1 | 🐾 |
| `century_pet` | Pet Century | totalPets >= 100 | 💯 |
| `first_hatch` | Born to Code | buddy hatched | 🥚 |
| `bug_squasher` | Bug Squasher | 10 error→success transitions | 🐛 |
| `night_owl` | Night Owl | XP earned between midnight–5am | 🦉 |
| `test_runner` | Test Runner | 50 test commands | 🧪 |
| `committer` | Serial Committer | 25 git commits | 📝 |
| `shiny_hunter` | Shiny Hunter | hatched a shiny buddy | ✨ |
| `evolved` | Final Form | reached adult stage (level 15) | 🌟 |
| `chatty` | Chatty | totalTalks >= 50 | 💬 |

---

### Task 1: Progression Module (`buddy-progression.js`)

**Files:**
- Create: `C:/Users/natys/ClaudeBuddy/buddy-progression.js`

- [ ] **Step 1: Create the XP/level calculation module**

```javascript
// C:/Users/natys/ClaudeBuddy/buddy-progression.js
'use strict';

// ── XP Awards by tool type ──────────────────────────────────
const XP_TABLE = {
  Edit: 10, Write: 10, NotebookEdit: 10,
  Read: 2, Glob: 2, Grep: 2,
  Bash: 5, // default, overridden by content match below
};

const BASH_BONUS = [
  { pattern: /\b(jest|pytest|vitest|mocha|npm test|npm run test)\b/i, xp: 15 },
  { pattern: /\bgit commit\b/i, xp: 20 },
  { pattern: /\bgit push\b/i, xp: 25 },
];

function xpForTool(toolName, toolInput) {
  if (toolName === 'Bash' && toolInput) {
    const cmd = typeof toolInput === 'string' ? toolInput : (toolInput.command || '');
    for (const { pattern, xp } of BASH_BONUS) {
      if (pattern.test(cmd)) return xp;
    }
  }
  return XP_TABLE[toolName] || 3;
}

// ── Level from XP ───────────────────────────────────────────
// level = floor(sqrt(xp / 50))
// Level 1 = 50 XP, Level 5 = 1250, Level 10 = 5000, Level 15 = 11250

function levelFromXP(xp) {
  return Math.floor(Math.sqrt((xp || 0) / 50));
}

function xpForLevel(level) {
  return level * level * 50;
}

function xpProgress(xp) {
  const level = levelFromXP(xp);
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  return {
    level,
    xp,
    xpInLevel: xp - currentFloor,
    xpNeeded: nextFloor - currentFloor,
    percent: Math.min(100, Math.round(((xp - currentFloor) / (nextFloor - currentFloor)) * 100)),
  };
}

// ── Evolution Stages ────────────────────────────────────────
// egg(0) → baby(1-4) → juvenile(5-14) → adult(15+)

const STAGES = ['egg', 'baby', 'juvenile', 'adult'];

function stageFromLevel(level) {
  if (level <= 0) return 'egg';
  if (level <= 4) return 'baby';
  if (level <= 14) return 'juvenile';
  return 'adult';
}

// ── Achievements ────────────────────────────────────────────

const ACHIEVEMENT_DEFS = [
  { id: 'first_pet',    name: 'First Pet',       icon: '\uD83D\uDC3E', check: s => (s.totalPets || 0) >= 1 },
  { id: 'century_pet',  name: 'Pet Century',     icon: '\uD83D\uDCAF', check: s => (s.totalPets || 0) >= 100 },
  { id: 'first_hatch',  name: 'Born to Code',    icon: '\uD83E\uDD5A', check: s => !!s.hatchedAt },
  { id: 'bug_squasher', name: 'Bug Squasher',    icon: '\uD83D\uDC1B', check: s => (s.bugFixes || 0) >= 10 },
  { id: 'night_owl',    name: 'Night Owl',       icon: '\uD83E\uDD89', check: s => !!s.nightOwl },
  { id: 'test_runner',  name: 'Test Runner',     icon: '\uD83E\uDDEA', check: s => (s.testRuns || 0) >= 50 },
  { id: 'committer',    name: 'Serial Committer', icon: '\uD83D\uDCDD', check: s => (s.commits || 0) >= 25 },
  { id: 'shiny_hunter', name: 'Shiny Hunter',    icon: '\u2728',       check: s => !!s.overrides && s.overrides.shiny === true },
  { id: 'evolved',      name: 'Final Form',      icon: '\uD83C\uDF1F', check: s => levelFromXP(s.xp || 0) >= 15 },
  { id: 'chatty',       name: 'Chatty',          icon: '\uD83D\uDCAC', check: s => (s.totalTalks || 0) >= 50 },
];

function checkAchievements(save) {
  const existing = save.achievements || [];
  const newlyUnlocked = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (existing.includes(def.id)) continue;
    if (def.check(save)) newlyUnlocked.push(def);
  }
  return newlyUnlocked;
}

function allAchievements(save) {
  const unlocked = save.achievements || [];
  return ACHIEVEMENT_DEFS.map(d => ({
    ...d,
    unlocked: unlocked.includes(d.id),
  }));
}

module.exports = {
  xpForTool, levelFromXP, xpForLevel, xpProgress,
  STAGES, stageFromLevel,
  ACHIEVEMENT_DEFS, checkAchievements, allAchievements,
};
```

- [ ] **Step 2: Verify the module loads**

Run: `node -e "const p = require('C:/Users/natys/ClaudeBuddy/buddy-progression.js'); console.log('Level at 0 XP:', p.levelFromXP(0)); console.log('Level at 5000 XP:', p.levelFromXP(5000)); console.log('Stage at L0:', p.stageFromLevel(0)); console.log('Stage at L10:', p.stageFromLevel(10)); console.log('Stage at L15:', p.stageFromLevel(15)); console.log('XP for Edit:', p.xpForTool('Edit')); console.log('XP for test bash:', p.xpForTool('Bash', {command:'npm test'}));"`

Expected:
```
Level at 0 XP: 0
Level at 5000 XP: 10
Stage at L0: egg
Stage at L10: juvenile
Stage at L15: adult
XP for Edit: 10
XP for test bash: 15
```

- [ ] **Step 3: Commit**

```bash
cd C:/Users/natys/ClaudeBuddy && git init 2>/dev/null; git add buddy-progression.js && git commit -m "feat: add progression module — XP, levels, stages, achievements"
```

---

### Task 2: Auto-Observer Hook (`buddy-hook.js`)

**Files:**
- Create: `C:/Users/natys/ClaudeBuddy/buddy-hook.js`
- Modify: `C:/Users/natys/.claude/settings.json` (add hook)

- [ ] **Step 1: Create the hook script**

The hook reads the tool name and input from stdin (Claude Code pipes JSON), awards XP, tracks stats, checks achievements, and writes to the save file. Exits 0 (non-blocking).

```javascript
// C:/Users/natys/ClaudeBuddy/buddy-hook.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { xpForTool, levelFromXP, stageFromLevel, checkAchievements } = require('./buddy-progression.js');

const SAVE_PATH = path.join(os.homedir(), '.claude-buddy.json');

// Read hook input from stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    run(input);
  } catch (e) {
    // Never crash — hooks must not block Claude Code
    process.stderr.write(`[buddy-hook] error: ${e.message}\n`);
  }
  process.exit(0);
});

function run(raw) {
  let hookData;
  try { hookData = JSON.parse(raw); } catch { return; }

  const toolName = hookData.tool_name || hookData.toolName || '';
  const toolInput = hookData.tool_input || hookData.input || '';

  // Load save
  let save;
  try { save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')); } catch { return; } // no buddy yet

  // Award XP
  const xpGain = xpForTool(toolName, toolInput);
  const oldXP = save.xp || 0;
  const oldLevel = levelFromXP(oldXP);
  save.xp = oldXP + xpGain;
  const newLevel = levelFromXP(save.xp);

  // Track tool-specific stats for achievements
  if (toolName === 'Bash') {
    const cmd = typeof toolInput === 'string' ? toolInput : (toolInput.command || '');
    if (/\b(jest|pytest|vitest|mocha|npm test|npm run test)\b/i.test(cmd)) {
      save.testRuns = (save.testRuns || 0) + 1;
    }
    if (/\bgit commit\b/i.test(cmd)) {
      save.commits = (save.commits || 0) + 1;
    }
  }

  // Night owl check (midnight–5am local time)
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) {
    save.nightOwl = true;
  }

  // Check for new achievements
  const newAchievements = checkAchievements(save);
  if (newAchievements.length > 0) {
    save.achievements = save.achievements || [];
    for (const a of newAchievements) {
      save.achievements.push(a.id);
    }
    // Write achievement notification for status line to pick up
    save.lastAchievement = {
      name: newAchievements[0].name,
      icon: newAchievements[0].icon,
      at: Date.now(),
    };
  }

  // Write level-up notification for status line
  if (newLevel > oldLevel) {
    const oldStage = stageFromLevel(oldLevel);
    const newStage = stageFromLevel(newLevel);
    save.lastLevelUp = { level: newLevel, at: Date.now() };
    if (newStage !== oldStage) {
      save.lastEvolution = { from: oldStage, to: newStage, at: Date.now() };
    }
  }

  // Save
  try { fs.writeFileSync(SAVE_PATH, JSON.stringify(save, null, 2)); } catch {}
}
```

- [ ] **Step 2: Verify the hook runs without error**

Run: `echo '{"tool_name":"Edit","tool_input":{"file_path":"test.js"}}' | node C:/Users/natys/ClaudeBuddy/buddy-hook.js && echo "Exit: $?" && node -e "const s=JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.claude-buddy.json','utf8')); console.log('XP:', s.xp);"`

Expected: `Exit: 0` and `XP:` should show a number (previous XP + 10).

- [ ] **Step 3: Register the hook in settings.json**

Add to `C:/Users/natys/.claude/settings.json` inside the top-level object:

```json
"hooks": {
  "PostToolUse": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node C:/Users/natys/ClaudeBuddy/buddy-hook.js",
          "async": true,
          "statusMessage": ""
        }
      ]
    }
  ]
}
```

The `"async": true` makes it non-blocking — Claude Code doesn't wait for the hook to finish.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/natys/ClaudeBuddy && git add buddy-hook.js && git commit -m "feat: add auto-observer hook — XP, stats, achievements on every tool use"
```

---

### Task 3: Evolution Sprites in MCP Server

**Files:**
- Modify: `C:/Users/natys/ClaudeBuddy/buddy-mcp-server.js`

- [ ] **Step 1: Add require for progression module at the top (after line 18)**

After the existing `require` lines, add:

```javascript
const { levelFromXP, xpProgress, stageFromLevel, allAchievements } = require('./buddy-progression.js');
```

- [ ] **Step 2: Add egg and baby sprite renderers**

Add after the existing `renderFace` function (after line 248):

```javascript
// ── Evolution Stage Sprites ───────────────────────────────────

function renderEgg(bones) {
  const RARITY_EGG_CHAR = { common: '.', uncommon: 'o', rare: '*', epic: '+', legendary: '#' };
  const c = RARITY_EGG_CHAR[bones.rarity] || '.';
  return [
    `  (${c}${c}${c})  `,
    `   ~~   `,
  ];
}

function renderBaby(bones) {
  const face = renderFace(bones);
  // Pad face to be centered in ~8 chars
  const padded = face.length < 8 ? ' '.repeat(Math.floor((8 - face.length) / 2)) + face : face;
  return [
    ` .${'-'.repeat(Math.max(face.length, 4))}.  `,
    ` | ${face} |  `,
    ` '${'-'.repeat(Math.max(face.length, 4))}'  `,
  ];
}

function renderJuvenile(bones, frame) {
  // Full species art but strip the hat line (line 0) — always blank
  const frames = BODIES[bones.species];
  const body = frames[frame % frames.length].map(l => l.replaceAll('{E}', bones.eye));
  // Drop the hat/top line entirely for juvenile stage
  const lines = body.slice(1);
  return lines;
}

// Unified render: picks the right sprite for the buddy's evolution stage
function renderBuddySprite(bones, save, frame, blink) {
  const level = levelFromXP(save.xp || 0);
  const stage = stageFromLevel(level);

  let lines;
  switch (stage) {
    case 'egg':
      lines = renderEgg(bones);
      break;
    case 'baby':
      lines = renderBaby(bones);
      if (blink) lines = lines.map(l => l.replaceAll(bones.eye, '-'));
      break;
    case 'juvenile':
      lines = renderJuvenile(bones, frame);
      if (blink) lines = lines.map(l => l.replaceAll(bones.eye, '-'));
      break;
    case 'adult':
    default:
      lines = renderSprite(bones, frame);
      if (blink) lines = lines.map(l => l.replaceAll(bones.eye, '-'));
      break;
  }
  return lines;
}
```

- [ ] **Step 3: Update `toolBuddyStatus` to show level, XP, stage, and achievements**

Find the `toolBuddyStatus` function and replace its body with a version that includes progression info. The sprite render call changes from `renderSprite(b, 0)` to `renderBuddySprite(b, buddySave, 0, false)`. Add XP bar and level after the stat bars. Add an achievements section at the bottom.

```javascript
function toolBuddyStatus() {
  ensureBuddy();

  const name = getBuddyName();
  const b = buddyBones;
  const stars = RARITY_STARS[b.rarity];
  const shinyTag = b.shiny ? ' \u2728' : '';

  const prog = xpProgress(buddySave.xp || 0);
  const stage = stageFromLevel(prog.level);

  const lines = [];
  lines.push(`${stars} ${b.rarity.toUpperCase()}${shinyTag}  Lv.${prog.level} (${stage})`);
  lines.push('');

  const sprite = renderBuddySprite(b, buddySave, 0, false);
  for (const sl of sprite) lines.push('    ' + sl);
  lines.push('');
  lines.push(`~ ${name} ~`);
  lines.push(`Species: ${b.species} | Eye: ${b.eye} | Hat: ${stage === 'adult' ? b.hat : 'locked'}`);
  lines.push('');

  // XP bar
  const barW = 20;
  const filled = Math.round((prog.percent / 100) * barW);
  const xpBar = '\u2588'.repeat(filled) + '\u2591'.repeat(barW - filled);
  lines.push(`XP: ${xpBar} ${prog.xp}/${prog.xp + (prog.xpNeeded - prog.xpInLevel)} (${prog.percent}%)`);
  lines.push('');

  // Stats
  for (const sn of STAT_NAMES) {
    lines.push(`${sn.padEnd(10)} ${statBar(b.stats[sn], 10)}  ${b.stats[sn]}`);
  }
  lines.push('');

  // Achievements
  const achs = allAchievements(buddySave);
  const unlocked = achs.filter(a => a.unlocked);
  const locked = achs.filter(a => !a.unlocked);
  if (unlocked.length > 0) {
    lines.push(`Achievements (${unlocked.length}/${achs.length}):`);
    for (const a of unlocked) lines.push(`  ${a.icon} ${a.name}`);
    if (locked.length > 0) {
      lines.push(`  + ${locked.length} locked`);
    }
  } else {
    lines.push(`Achievements: 0/${achs.length} unlocked`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Update `toolBuddyReact` and `toolBuddyPet` to use evolution sprite**

In `toolBuddyPet`, replace `renderSprite(b, 0)` with `renderBuddySprite(b, buddySave, 0, false)`.

- [ ] **Step 5: Add `buddy_achievements` tool**

Add to `TOOL_DEFINITIONS`:

```javascript
{
  name: 'buddy_achievements',
  description: 'Show all achievements — unlocked and locked — for your Claude Buddy.',
  inputSchema: { type: 'object', properties: {}, required: [] },
},
```

Add case in `handleToolCall`:

```javascript
case 'buddy_achievements':
  result = toolBuddyAchievements();
  break;
```

Add implementation:

```javascript
function toolBuddyAchievements() {
  ensureBuddy();
  const achs = allAchievements(buddySave);
  const lines = ['=== Claude Buddy Achievements ===', ''];
  for (const a of achs) {
    const status = a.unlocked ? a.icon : '\u2610';
    const dim = a.unlocked ? '' : '(locked) ';
    lines.push(`${status} ${a.name} ${dim}`);
  }
  lines.push('');
  lines.push(`${achs.filter(a => a.unlocked).length}/${achs.length} unlocked`);
  return lines.join('\n');
}
```

- [ ] **Step 6: Verify syntax**

Run: `node --check C:/Users/natys/ClaudeBuddy/buddy-mcp-server.js && echo OK`

- [ ] **Step 7: Commit**

```bash
cd C:/Users/natys/ClaudeBuddy && git add buddy-mcp-server.js && git commit -m "feat: evolution sprites, XP/level in status, achievements tool"
```

---

### Task 4: Evolution Sprites in Status Line

**Files:**
- Modify: `C:/Users/natys/ClaudeBuddy/buddy-statusline.js`

- [ ] **Step 1: Add require for progression module**

After the existing constants, add:

```javascript
const { levelFromXP, xpProgress, stageFromLevel } = require('./buddy-progression.js');
```

- [ ] **Step 2: Add egg, baby, juvenile render functions**

Copy the same `renderEgg`, `renderBaby`, `renderJuvenile`, and `renderBuddySprite` functions from Task 3 into the status line script (it's self-contained, doesn't share code at runtime with the MCP server).

- [ ] **Step 3: Replace the sprite render call**

Replace:
```javascript
let sprite = renderSprite(bones, frame);
if (blink) sprite = sprite.map(l => l.replaceAll(bones.eye, '-'));
```

With:
```javascript
let sprite = renderBuddySprite(bones, save, frame, blink);
```

- [ ] **Step 4: Add level indicator to the name line**

Replace the name line output with:

```javascript
const prog = xpProgress(save.xp || 0);
const stage = stageFromLevel(prog.level);
const levelTag = prog.level > 0 ? ` Lv.${prog.level}` : ' \uD83E\uDD5A';
const nameDisplay = `${name}${levelTag}`;
out.push(`\x1b[${namePad + 1}G${DIM}${ITAL}${rc}${nameDisplay}${RST}`);
```

- [ ] **Step 5: Show level-up and achievement notifications**

After the name line, add checks for recent level-up and achievement notifications (within last 10 seconds), displayed as a brief flash:

```javascript
// Level-up notification (fades after 10s)
if (save.lastLevelUp && Date.now() - save.lastLevelUp.at < 10000) {
  const lvlMsg = `\u2B06 Level ${save.lastLevelUp.level}!`;
  out.push(`\x1b[${namePad + 1}G${rc}\x1b[1m${lvlMsg}${RST}`);
}

// Achievement notification (fades after 10s)
if (save.lastAchievement && Date.now() - save.lastAchievement.at < 10000) {
  const achMsg = `${save.lastAchievement.icon} ${save.lastAchievement.name}!`;
  out.push(`\x1b[${namePad + 1}G\x1b[38;5;220m\x1b[1m${achMsg}${RST}`);
}
```

- [ ] **Step 6: Verify syntax and test**

Run: `node --check C:/Users/natys/ClaudeBuddy/buddy-statusline.js && echo OK`
Run: `node C:/Users/natys/ClaudeBuddy/buddy-statusline.js` and verify output shows egg/baby/level based on current XP in save file.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/natys/ClaudeBuddy && git add buddy-statusline.js && git commit -m "feat: evolution sprites and level in status line"
```

---

### Task 5: Achievements Slash Command

**Files:**
- Create: `C:/Users/natys/.claude/skills/achievements/SKILL.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: achievements
description: Show your Claude Buddy achievement progress
disable-model-invocation: true
---

Call the `buddy_achievements` MCP tool from the `buddy` server. Display the result exactly as returned — it shows all achievements with their unlock status.
```

- [ ] **Step 2: Verify skill file exists**

Run: `cat C:/Users/natys/.claude/skills/achievements/SKILL.md`

- [ ] **Step 3: Commit**

```bash
cd C:/Users/natys/ClaudeBuddy && git add -A && git commit -m "feat: /achievements slash command"
```

---

### Task 6: Wire Up the PostToolUse Hook

**Files:**
- Modify: `C:/Users/natys/.claude/settings.json`

- [ ] **Step 1: Add hook configuration**

Add the `hooks` key to `settings.json` (after `effortLevel`):

```json
"hooks": {
  "PostToolUse": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node C:/Users/natys/ClaudeBuddy/buddy-hook.js",
          "async": true
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Verify settings.json is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('C:/Users/natys/.claude/settings.json','utf8')); console.log('Valid JSON')"`

- [ ] **Step 3: Test the hook end-to-end**

Simulate a tool use event:
```bash
echo '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' | node C:/Users/natys/ClaudeBuddy/buddy-hook.js
node -e "const s=JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.claude-buddy.json','utf8')); console.log('XP:', s.xp, 'Tests:', s.testRuns);"
```

Expected: XP increased by 15, testRuns incremented.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/natys/ClaudeBuddy && git add -A && git commit -m "feat: register PostToolUse hook for auto XP tracking"
```

---

### Task 7: Integration Test

- [ ] **Step 1: Run full integration test**

```bash
# Reset XP to test egg→baby transition
node -e "
const fs = require('fs'), p = require('path'), os = require('os');
const f = p.join(os.homedir(), '.claude-buddy.json');
const s = JSON.parse(fs.readFileSync(f, 'utf8'));
s.xp = 0; delete s.lastLevelUp; delete s.lastEvolution; delete s.lastAchievement;
fs.writeFileSync(f, JSON.stringify(s, null, 2));
console.log('Reset XP to 0');
"

# Verify egg stage
node C:/Users/natys/ClaudeBuddy/buddy-statusline.js
echo "--- should show egg ---"

# Award enough XP for level 1 (50 XP = 5 edits)
for i in 1 2 3 4 5; do
  echo '{"tool_name":"Edit","tool_input":{}}' | node C:/Users/natys/ClaudeBuddy/buddy-hook.js
done

# Verify baby stage
node C:/Users/natys/ClaudeBuddy/buddy-statusline.js
echo "--- should show baby face ---"
```

- [ ] **Step 2: Test MCP server with progression**

```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"buddy_status","arguments":{}},"id":2}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"buddy_achievements","arguments":{}},"id":3}' | node C:/Users/natys/ClaudeBuddy/buddy-mcp-server.js 2>/dev/null | node -e "
const rl=require('readline').createInterface({input:process.stdin});
rl.on('line',l=>{const m=JSON.parse(l); if(m.id>=2) console.log(m.result.content[0].text); });
"
```

Expected: Status shows level, XP bar, evolution stage. Achievements shows at least "Born to Code" unlocked.

- [ ] **Step 3: Final commit**

```bash
cd C:/Users/natys/ClaudeBuddy && git add -A && git commit -m "feat: buddy progression system complete — XP, evolution, achievements, auto-observer"
```
