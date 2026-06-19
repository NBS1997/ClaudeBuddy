#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  xpForTool, levelFromXP, stageFromLevel, checkAchievements,
  isRecentLine, recordLine, recordStreak,
  dayKey, seedRawStats, accrueStats, evolutionInfo,
} = require('./buddy-progression.js');
const {
  resolveContext, ensureBuddySave, safeWriteJSON,
  writeActivePointer, updateCollection,
} = require('./buddy-paths.js');
const { pickGenericVoice } = require('./buddy-voice.js');

// Real activity = work that earns a buddy. A buddy is lazily created on
// the first edit/commit in a repo — never on a mere read or `cd`, so
// throwaway dirs don't accumulate junk buddies.
function isRealActivity(toolName, cmd) {
  if (/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(toolName)) return true;
  if (toolName === 'Bash' && /\bgit commit\b/i.test(cmd)) return true;
  return false;
}

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
  const cwd = hookData.cwd || hookData.workingDirectory || process.cwd();

  const now = Date.now();
  const ctx = resolveContext(cwd);
  const save = ensureBuddySave(ctx, { autoHatch: isRealActivity(toolName, cmd), now });
  if (!save) return; // no buddy here yet, and this isn't real activity — stay quiet


  const date = new Date();
  const prevToolAt = save.lastToolAt || 0;
  const prevLastFile = save.lastFile;
  const toolResponse = hookData.tool_response || hookData.tool_result || hookData.toolResponse || hookData.output || '';
  let resStr = '';
  try { resStr = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse || ''); } catch { resStr = ''; }

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

  // ── Emergent stats — accumulate a portrait of how you code ───
  seedRawStats(save);
  const today = dayKey(date);
  if (!save.statSnap || save.statSnap.day !== today) {
    save.statSnap = { day: today, raw: Object.assign({}, save.rawStats) };
  }
  const rapidEdit = /^(Edit|Write|MultiEdit)$/.test(toolName) && (now - prevToolAt) < 30000 && prevToolAt > 0;
  accrueStats(save, { toolName, cmd, toolInput, hour, rapid: rapidEdit });

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

  // ── Mood — drives the status line's eye expression ───────────
  let mood = 'neutral';
  if (seamKind === 'commit' || seamKind === 'push') mood = 'shipping';
  else if (seamKind === 'test') mood = 'debugging';
  else if (save.flow) mood = 'flow';
  else {
    const reads = inWindow.filter(e => /^(Read|Grep|Glob)$/.test(e.n)).length;
    const edits = inWindow.filter(e => /^(Edit|Write|MultiEdit)$/.test(e.n)).length;
    if (reads >= 3 && reads > edits * 2) mood = 'exploring';
  }
  save.mood = mood;

  // ── Reciprocity + contextual greeting (queued; the gate decides) ──
  save.pendingLines = save.pendingLines || [];
  const enqueue = (text, kind) => {
    if (!text) return;
    save.pendingLines.push({ text, kind, at: now });
    while (save.pendingLines.length > 6) save.pendingLines.shift();
  };

  // Solidarity on a red test; an earned ack on a fail→pass (accurate-or-silent:
  // only when the tool output actually tells us how it went).
  if (toolName === 'Bash' && TEST_RE.test(cmd) && resStr) {
    const failed = /✗|✕|\b(fail|failed|failing|not ok|failures?)\b/i.test(resStr);
    const passed = !failed && /✓|\b(pass|passed|passing|all tests|0 failures?)\b/i.test(resStr);
    if (failed) { enqueue(pickGenericVoice(save, 'worried'), 'reciprocity'); save.lastTestFailed = true; }
    else if (passed) {
      if (save.lastTestFailed) { enqueue(pickGenericVoice(save, 'happy'), 'reciprocity'); if (save.rawStats) save.rawStats.DEBUGGING += 3; }
      save.lastTestFailed = false;
    }
  }

  // At the start of a session, one factual callback about the work — never a
  // "days since you left me" deficit (that's the Replika trap).
  if (sessionStart) {
    enqueue(prevLastFile ? `back in ${prevLastFile}?` : pickGenericVoice(save, 'idle'), 'greeting');
  }

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
  save.repo = ctx.gitRoot || save.repo;

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
      const info = evolutionInfo(save); // the form your code just earned
      save.lastEvolution = {
        from: oldStage, to: newStage, at: Date.now(),
        form: info && info.form, path: info && info.path, primary: info && info.primary,
      };
    }
  }

  // ── Factual memory: where we were, what shipped ─────────────
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(toolName)) {
    const fp = (toolInput && typeof toolInput === 'object' && (toolInput.file_path || toolInput.path)) || '';
    if (fp) save.lastFile = path.basename(fp);
  }
  if (seamKind === 'commit') {
    save.recentEvents = save.recentEvents || [];
    const m = cmd.match(/git commit[^"']*["']([^"']+)["']/);
    save.recentEvents.push({ type: 'commit', detail: (m ? m[1] : 'a commit').slice(0, 48), at: now });
    while (save.recentEvents.length > 20) save.recentEvents.shift();
  }

  safeWriteJSON(ctx.savePath, save);
  writeActivePointer(ctx);
  updateCollection(ctx, save);
}
