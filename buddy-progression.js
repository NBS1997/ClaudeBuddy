// C:/Users/natys/ClaudeBuddy/buddy-progression.js
'use strict';

const XP_TABLE = {
  Edit: 10, Write: 10, NotebookEdit: 10,
  Read: 2, Glob: 2, Grep: 2,
  Bash: 5,
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

// level = floor(sqrt(xp / 200))
// Level 1 ~ first session, Level 5 ~ a day, Level 15 (adult) ~ 2-3 weeks
function levelFromXP(xp) {
  return Math.floor(Math.sqrt((xp || 0) / 200));
}

function xpForLevel(level) {
  return level * level * 200;
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

const STAGES = ['egg', 'baby', 'juvenile', 'adult'];

function stageFromLevel(level) {
  if (level <= 0) return 'egg';
  if (level <= 4) return 'baby';
  if (level <= 14) return 'juvenile';
  return 'adult';
}

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
