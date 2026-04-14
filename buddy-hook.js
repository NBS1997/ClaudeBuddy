#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { xpForTool, levelFromXP, stageFromLevel, checkAchievements } = require('./buddy-progression.js');

const SAVE_PATH = path.join(os.homedir(), '.claude-buddy.json');

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

  let save;
  try { save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')); } catch { return; }

  const xpGain = xpForTool(toolName, toolInput);
  const oldXP = save.xp || 0;
  const oldLevel = levelFromXP(oldXP);
  save.xp = oldXP + xpGain;
  const newLevel = levelFromXP(save.xp);

  if (toolName === 'Bash') {
    const cmd = typeof toolInput === 'string' ? toolInput : (toolInput.command || '');
    if (/\b(jest|pytest|vitest|mocha|npm test|npm run test)\b/i.test(cmd)) {
      save.testRuns = (save.testRuns || 0) + 1;
    }
    if (/\bgit commit\b/i.test(cmd)) {
      save.commits = (save.commits || 0) + 1;
    }
  }

  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) {
    save.nightOwl = true;
  }

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
