#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  xpForTool, levelFromXP, stageFromLevel, checkAchievements,
  isRecentLine, recordLine, recordStreak,
} = require('./buddy-progression.js');

const SAVE_PATH = path.join(os.homedir(), '.claude-buddy.json');

// ── Speech Gate tuning ─────────────────────────────────────────
const COOLDOWN_MS = 120000;       // no autonomous bubble within 2 min of the last
const PENDING_TTL = 90000;        // a queued reaction goes stale after 90s
const SESSION_GAP_MS = 30 * 60 * 1000; // >30 min idle ⇒ a new session (a seam)
const FLOW_WINDOW_MS = 180000;    // look back 3 min to detect flow
const FLOW_MIN_EVENTS = 6;        // this many tool events in-window ⇒ heads-down
const RECENT_TOOLS_CAP = 12;

const TEST_RE = /\b(jest|pytest|vitest|mocha|npm test|npm run test)\b/i;
const COMMIT_RE = /\bgit commit\b/i;
const PUSH_RE = /\bgit push\b/i;

// Tools that constitute a "seam" — a natural pause where the buddy may speak.
function seamFromEvent(toolName, cmd) {
  if (/buddy_react/i.test(toolName)) return 'react';   // the model chose to react
  if (toolName === 'Bash') {
    if (TEST_RE.test(cmd)) return 'test';
    if (PUSH_RE.test(cmd)) return 'push';
    if (COMMIT_RE.test(cmd)) return 'commit';
  }
  return null;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    run(input);
  } catch (e) {
    process.stderr.write(`[buddy-hook] error: ${e.message}\n`);
  }
  process.exit(0);
});

function run(raw) {
  let hookData;
  try { hookData = JSON.parse(raw); } catch { return; }

  const toolName = hookData.tool_name || hookData.toolName || '';
  const toolInput = hookData.tool_input || hookData.input || '';
  const cmd = typeof toolInput === 'string' ? toolInput : (toolInput && toolInput.command) || '';

  let save;
  try { save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')); } catch { return; }

  const now = Date.now();
  const date = new Date();
  const prevToolAt = save.lastToolAt || 0;

  const xpGain = xpForTool(toolName, toolInput);
  const oldXP = save.xp || 0;
  const oldLevel = levelFromXP(oldXP);
  save.xp = oldXP + xpGain;
  const newLevel = levelFromXP(save.xp);

  if (toolName === 'Bash') {
    if (/\b(jest|pytest|vitest|mocha|npm test|npm run test)\b/i.test(cmd)) {
      save.testRuns = (save.testRuns || 0) + 1;
    }
    if (/\bgit commit\b/i.test(cmd)) {
      save.commits = (save.commits || 0) + 1;
    }
  }

  const hour = date.getHours();
  if (hour >= 0 && hour < 5) {
    save.nightOwl = true;
  }

  // ── Lossless coding streak (weekends auto-skip; no shame) ────
  recordStreak(save, date);

  // ── Tool-event stream (drives seam + flow detection) ─────────
  save.recentTools = (save.recentTools || []);
  save.recentTools.push({ t: now, n: toolName });
  while (save.recentTools.length > RECENT_TOOLS_CAP) save.recentTools.shift();

  // A seam is a natural pause where the buddy is allowed to speak.
  const sessionStart = prevToolAt > 0 && (now - prevToolAt) > SESSION_GAP_MS;
  const seamKind = seamFromEvent(toolName, cmd) || (sessionStart ? 'session' : null);

  // Flow = heads-down: many events in a short window with no seam.
  // A seam moment is, by definition, not flow.
  const windowStart = now - FLOW_WINDOW_MS;
  const inWindow = save.recentTools.filter(e => e.t >= windowStart);
  save.flow = !seamKind
    && inWindow.length >= FLOW_MIN_EVENTS
    && (now - prevToolAt) < FLOW_WINDOW_MS;

  // ── The Speech Gate: promote a queued reaction only at a seam ──
  // Pull-not-push: buddy_react enqueues a candidate; here — and only
  // outside flow, past the cooldown, at a seam — does one surface.
  save.pendingLines = (save.pendingLines || []).filter(p => now - p.at < PENDING_TTL);
  const cooldownOk = !save.lastBubbleAt || (now - save.lastBubbleAt) > COOLDOWN_MS;
  if (seamKind && !save.flow && cooldownOk && save.pendingLines.length) {
    let cand = null;
    for (let i = save.pendingLines.length - 1; i >= 0; i--) {
      if (!isRecentLine(save, save.pendingLines[i].text)) { cand = save.pendingLines[i]; break; }
    }
    if (cand) {
      save.lastReaction = { text: cand.text, at: now };
      save.lastBubbleAt = now;
      recordLine(save, cand.text);
    }
    save.pendingLines = [];
  }

  save.lastToolAt = now;

  const newAchievements = checkAchievements(save);
  if (newAchievements.length > 0) {
    save.achievements = save.achievements || [];
    for (const a of newAchievements) {
      save.achievements.push(a.id);
    }
    save.lastAchievement = {
      name: newAchievements[0].name,
      icon: newAchievements[0].icon,
      at: Date.now(),
    };
  }

  if (newLevel > oldLevel) {
    const oldStage = stageFromLevel(oldLevel);
    const newStage = stageFromLevel(newLevel);
    save.lastLevelUp = { level: newLevel, at: Date.now() };
    if (newStage !== oldStage) {
      save.lastEvolution = { from: oldStage, to: newStage, at: Date.now() };
    }
  }

  try { fs.writeFileSync(SAVE_PATH, JSON.stringify(save, null, 2)); } catch {}
}
