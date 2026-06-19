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

// ── Speech de-dup ring buffer ──────────────────────────────────
// A line is never shown twice in the recent window — the single
// mechanism that turned Clippy's one catchphrase from charming-once
// to infuriating-on-repeat. Shared by every voice surface.

const RECENT_LINES_CAP = 12;

function hashLine(text) {
  let h = 2166136261;
  const s = String(text == null ? '' : text);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function isRecentLine(save, text) {
  return (save.recentLines || []).includes(hashLine(text));
}

function recordLine(save, text) {
  const buf = save.recentLines || [];
  buf.push(hashLine(text));
  while (buf.length > RECENT_LINES_CAP) buf.shift();
  save.recentLines = buf;
  return save;
}

// ── Lossless streak (weekends auto-skip, no decay, no shame) ───
// Tracks a high-water mark that can only climb. A gap silently
// resets the live counter with ZERO message/sad-sprite/nag and
// carries NO XP multiplier — see the Buddy Bill of Rights.

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Weekday (Mon–Fri) calendar days strictly between two YYYY-MM-DD keys.
function weekdaysBetween(fromKey, toKey) {
  const cur = new Date(fromKey + 'T00:00:00');
  const to = new Date(toKey + 'T00:00:00');
  let count = 0;
  cur.setDate(cur.getDate() + 1);
  while (cur < to) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function recordStreak(save, date) {
  const today = dayKey(date);
  const s = save.streak || { current: 0, best: 0, lastActiveDay: null };
  if (s.lastActiveDay === today) { save.streak = s; return save; }
  if (!s.lastActiveDay) {
    s.current = 1;
  } else if (today > s.lastActiveDay && weekdaysBetween(s.lastActiveDay, today) === 0) {
    s.current = (s.current || 0) + 1; // consecutive — weekends auto-skip
  } else {
    s.current = 1; // silent reset: no message, no shame, ever
  }
  s.best = Math.max(s.best || 0, s.current);
  s.lastActiveDay = today;
  save.streak = s;
  return save;
}

// ── Evolution ceremony lines (the climactic milestone moment) ──
// Reflect-never-prompt: each line owns the moment in character and
// ties growth to the work — never an instruction, never neediness.

const EVOLUTION_STAGE_CAPTION = {
  baby: 'A face at last. We are getting somewhere.',
  juvenile: 'Growing into it. Earned, not handed over.',
  adult: 'Fully grown. The hat is earned.',
};

const SPECIES_EVOLUTION_LINES = {
  duck:     'Bigger wings now. Still no bread. The hunt continues.',
  goose:    'I am large now. The semicolons fear me.',
  blob:     'More mass. More jiggle. Same vibe.',
  cat:      'I have grown. I judge from a greater height now.',
  dragon:   'My hoard finally has a guardian worthy of it. Me.',
  octopus:  'Eight arms, fully grown. I can break more things at once.',
  owl:      'I see further now. The hat is earned.',
  penguin:  'NOOT. But, like, a senior noot.',
  turtle:   'Took my time. Worth it. ...still here.',
  snail:    '...made...it... took a while. Glorious.',
  ghost:    'I have haunted long enough to grow. Boo, but mature.',
  axolotl:  'Still smiling. Just bigger now. Blep, evolved.',
  capybara: 'Grew up. Did not stress about it. ...nice.',
  cactus:   'Grew a whole inch. Do not touch. ...okay, maybe once.',
  robot:    'UPGRADE COMPLETE. SELF-ESTEEM SUBROUTINE: ONLINE.',
  rabbit:   'Bigger binkies. Same chaos. *thump*',
  mushroom: 'The mycelium network has expanded. I am the network now.',
  chonk:    '*is, somehow, even larger* ...magnificent.',
};

function evolutionLine(species, toStage) {
  if (toStage === 'adult' && SPECIES_EVOLUTION_LINES[species]) {
    return SPECIES_EVOLUTION_LINES[species];
  }
  return EVOLUTION_STAGE_CAPTION[toStage] || 'Something changed.';
}

// ── Emergent stats — a portrait of how you code ────────────────
// Stats are NOT rolled. They accumulate from real behavior, are
// READ-ONLY, and are shown relative to each other so the buddy
// becomes a mirror of how you work. Quality-weighted, hard to fake.

const STAT_KEYS = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'];

const STAT_MEANING = {
  DEBUGGING: 'You find and fix problems.',
  PATIENCE:  'You understand before you act.',
  CHAOS:     'You move fast and break things.',
  WISDOM:    'You simplify and learn.',
  SNARK:     "You've seen some things.",
};

function emptyStats() {
  return { DEBUGGING: 0, PATIENCE: 0, CHAOS: 0, WISDOM: 0, SNARK: 0 };
}

// First time we look, seed from the only history we kept — honest, not invented.
function seedRawStats(save) {
  if (save.rawStats) return save;
  const r = emptyStats();
  r.DEBUGGING = (save.testRuns || 0) + (save.commits || 0) * 2 + (save.bugFixes || 0) * 3;
  if (save.nightOwl) r.SNARK += 3;
  save.rawStats = r;
  return save;
}

// Accumulate raw points from one tool event. ev: {toolName, cmd, toolInput, hour, rapid}.
function accrueStats(save, ev) {
  save.rawStats = save.rawStats || emptyStats();
  const r = save.rawStats;
  const t = ev.toolName || '';
  const cmd = ev.cmd || '';
  const ti = (ev.toolInput && typeof ev.toolInput === 'object') ? ev.toolInput : {};

  // PATIENCE — understand before acting
  if (/^(Read|Grep|Glob)$/.test(t)) r.PATIENCE += 1;

  // WISDOM — simplify & learn
  if (t === 'Read') {
    const fp = ti.file_path || ti.path || '';
    if (/\.(md|mdx|rst|txt|adoc)$/i.test(fp)) r.WISDOM += 1;
  }
  if (/^(Edit|MultiEdit)$/.test(t)) {
    const oldL = (ti.old_string || '').length;
    const newL = (ti.new_string || '').length;
    if (oldL > 0 && newL < oldL) r.WISDOM += 1; // net-negative edit = simplification
  }

  // CHAOS — move fast & break things
  if (/^(Edit|Write|MultiEdit)$/.test(t) && ev.rapid) r.CHAOS += 1;

  if (t === 'Bash') {
    if (/\bgit push\b[^\n]*(-f\b|--force)/i.test(cmd)) r.CHAOS += 3;
    if (/\bgit (revert|reset)\b/i.test(cmd)) { r.CHAOS += 2; r.SNARK += 1; }
    // DEBUGGING — find & fix
    if (/\b(jest|pytest|vitest|mocha|npm test|npm run test)\b/i.test(cmd)) r.DEBUGGING += 1;
    if (/\bgit commit\b/i.test(cmd) && /\b(fix|bug|patch|hotfix|resolve|repair)\b/i.test(cmd)) r.DEBUGGING += 3;
  }

  // SNARK — you've seen some things
  if (ev.hour != null && ev.hour >= 0 && ev.hour < 5) r.SNARK += 1;
  return save;
}

// Normalize raw counters to a 0–100 display scale, relative to each
// other (a stat's *share* of total activity), with a coarse trend.
function displayStats(save) {
  const raw = save.rawStats || emptyStats();
  const total = STAT_KEYS.reduce((a, k) => a + (raw[k] || 0), 0);
  const snap = (save.statSnap && save.statSnap.raw) || null;
  const snapTotal = snap ? STAT_KEYS.reduce((a, k) => a + (snap[k] || 0), 0) : 0;

  const stats = STAT_KEYS.map(k => {
    const share = total > 0 ? (raw[k] || 0) / total : 0;
    const value = Math.min(100, Math.round(share * 250));
    let trend = '→';
    if (snap && snapTotal > 0 && total > 0) {
      const prev = (snap[k] || 0) / snapTotal;
      if (share > prev + 0.02) trend = '↑';
      else if (share < prev - 0.02) trend = '↓';
    }
    return { name: k, value, raw: raw[k] || 0, trend, meaning: STAT_MEANING[k] };
  });

  let dom = stats[0];
  for (const s of stats) if (s.raw > dom.raw) dom = s;
  return { stats, dominant: total > 0 ? dom.name : null, total };
}

module.exports = {
  xpForTool, levelFromXP, xpForLevel, xpProgress,
  STAGES, stageFromLevel,
  ACHIEVEMENT_DEFS, checkAchievements, allAchievements,
  hashLine, isRecentLine, recordLine,
  dayKey, weekdaysBetween, recordStreak,
  EVOLUTION_STAGE_CAPTION, SPECIES_EVOLUTION_LINES, evolutionLine,
  STAT_KEYS, STAT_MEANING, emptyStats, seedRawStats, accrueStats, displayStats,
};
