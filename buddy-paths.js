'use strict';

// ══════════════════════════════════════════════════════════════
//  Claude Buddy — storage resolution (per-repo companions)
//
//  Each git repo gets its own buddy at <repo>/.buddy/companion.json.
//  Outside a repo, the buddy lives globally at ~/.claude-buddy.json.
//  The legacy global buddy migrates into the first repo it sees and
//  is never reset — "she finds her home." A small active-pointer
//  lets the status line render the right buddy without reading stdin
//  or spawning git on every tick.
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const GLOBAL_PATH = path.join(HOME, '.claude-buddy.json');
const COLLECTION_PATH = path.join(HOME, '.claude-buddy-collection.json');
const ACTIVE_PATH = path.join(HOME, '.claude-buddy-active.json');

function safeReadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ── Concurrency: lockfile mutex + atomic write ─────────────────
// The PostToolUse hook is registered `"async": true` and fires for sub-agent
// tool calls too, so several hook processes can race on the same companion.json
// (read-modify-write). Without a lock, last-write-wins silently drops XP/stats
// during parallel sub-agent bursts. These helpers make the critical section
// mutually exclusive and the on-disk file always-complete (no torn reads for the
// read-only status line). Node stdlib only; nothing here ever throws.
const LOCK_SUFFIX    = '.lock';
const LOCK_RETRY_MS  = 15;     // sleep between acquire attempts
const LOCK_MAX_TRIES = 50;     // ~750ms bounded wait, then degrade (never drop the update)
const LOCK_STALE_MS  = 5000;   // steal a lock older than this (a crashed holder)
const RENAME_RETRIES = 5;      // transient EPERM/EBUSY on Windows (AV/indexer handles)
const RENAME_RETRY_MS = 10;
let _tmpSeq = 0;

// Real synchronous sleep with no event loop — survives the hook's process.exit(0),
// which setTimeout would not. Atomics.wait on a private (never-notified) buffer
// blocks the calling thread for the full timeout. Stdlib, no flags on Node 20.
function sleepMs(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  catch { /* never throw out of the lock helper */ }
}

function tmpPathFor(targetPath) {
  _tmpSeq = (_tmpSeq + 1) & 0xffff;
  // Same directory as target ⇒ same volume ⇒ atomic rename. pid avoids
  // cross-process collisions; the seq avoids same-process same-ms collisions.
  return `${targetPath}.${process.pid}.${_tmpSeq}.tmp`;
}

// Write via a temp file then atomic rename, so a concurrent reader sees either
// the complete old or complete new file, never a half-written one. Replaces the
// destination atomically (MoveFileExW(REPLACE_EXISTING) on Windows / rename(2)).
function safeWriteJSONAtomic(p, obj) {
  let json;
  try { json = JSON.stringify(obj, null, 2); } catch { return false; }
  const tmp = tmpPathFor(p);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(tmp, json);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
    return false;
  }
  for (let i = 0; i < RENAME_RETRIES; i++) {
    try { fs.renameSync(tmp, p); return true; }
    catch (e) {
      const code = e && e.code;
      if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && i < RENAME_RETRIES - 1) {
        sleepMs(RENAME_RETRY_MS);
        continue;
      }
      break;
    }
  }
  // Rename kept failing — write in place so we don't drop the update (not
  // torn-read-safe, but matches the pre-locking behavior), then drop the temp.
  let ok = false;
  try { fs.writeFileSync(p, json); ok = true; } catch { ok = false; }
  try { fs.unlinkSync(tmp); } catch { /* best effort */ }
  return ok;
}

// safeWriteJSON is now atomic everywhere it's called (collection, active pointer,
// migration/create, MCP/CLI writeSave) for free, via the same name.
const safeWriteJSON = safeWriteJSONAtomic;

function tryAcquireLock(lockPath) {
  try {
    // 'wx' ⇒ O_CREAT | O_EXCL: a single atomic syscall; two racers can't both win.
    const fd = fs.openSync(lockPath, 'wx');
    try { fs.writeSync(fd, String(process.pid)); } catch { /* content is advisory */ }
    fs.closeSync(fd);
    return true;
  } catch { return false; }
}

// A crashed holder leaves an orphan lockfile; steal it once it's clearly stale so
// we can never deadlock forever. A real hold is sub-millisecond, so 5s never false-steals.
function maybeStealStaleLock(lockPath, now) {
  try {
    const st = fs.statSync(lockPath);
    if (now - st.mtimeMs > LOCK_STALE_MS) {
      try { fs.unlinkSync(lockPath); } catch { /* another writer beat us — fine */ }
    }
  } catch { /* lock vanished between attempts — fine */ }
}

// Run fn() inside a per-savePath critical section (fn may read AND write the save).
// Never throws. If the lock can't be acquired within the budget, runs fn ANYWAY
// (degrade to last-write-wins) rather than dropping the update.
function withLock(savePath, fn) {
  const lockPath = savePath + LOCK_SUFFIX;
  let held = false;
  try { fs.mkdirSync(path.dirname(lockPath), { recursive: true }); } catch { /* best effort */ }
  for (let i = 0; i < LOCK_MAX_TRIES; i++) {
    if (tryAcquireLock(lockPath)) { held = true; break; }
    maybeStealStaleLock(lockPath, Date.now());
    sleepMs(LOCK_RETRY_MS);
  }
  try { return fn(); }
  catch { return undefined; }
  finally {
    // Only unlink a lock THIS call created — never one another process holds.
    if (held) { try { fs.unlinkSync(lockPath); } catch { /* best effort */ } }
  }
}

// Resolve a linked worktree's `.git` FILE to the MAIN repo working tree. A linked
// worktree's `.git` is a file `gitdir: <main>/.git/worktrees/<name>`; its `commondir`
// points back at the shared `<main>/.git`. Returns the main repo root so XP/saves
// land on the real repo's buddy instead of a throwaway worktree buddy that's
// discarded when the worktree is cleaned up. Returns null on ANY failure so the
// caller degrades to the worktree dir. Never throws.
function mainWorktreeRoot(worktreeDir, dotgitFile) {
  try {
    const raw = fs.readFileSync(dotgitFile, 'utf8');
    const m = raw.match(/^\s*gitdir:\s*(.+?)\s*$/m);
    if (!m) return null;
    let gitdir = m[1].trim();
    if (!path.isAbsolute(gitdir)) gitdir = path.resolve(worktreeDir, gitdir);
    gitdir = path.normalize(gitdir); // <main>/.git/worktrees/<name>

    let commonGitDir;
    try {
      const cd = fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim();
      commonGitDir = path.isAbsolute(cd) ? cd : path.resolve(gitdir, cd);
    } catch {
      commonGitDir = path.resolve(gitdir, '..', '..'); // conventional layout
    }
    commonGitDir = path.normalize(commonGitDir);

    // Trust it only if it actually looks like a real .git directory.
    let ok = false;
    try {
      const s = fs.statSync(commonGitDir);
      ok = s.isDirectory() &&
        (fs.existsSync(path.join(commonGitDir, 'HEAD')) ||
         fs.existsSync(path.join(commonGitDir, 'config')));
    } catch { ok = false; }
    if (!ok) return null;

    const mainRoot = path.dirname(commonGitDir);
    try { return fs.realpathSync(mainRoot); } catch { return mainRoot; }
  } catch { return null; }
}

// Walk up from a directory looking for a .git entry. A normal clone has a .git
// DIRECTORY (return it). A linked worktree has a .git FILE — resolve through to
// the MAIN repo so its buddy gets the XP (see mainWorktreeRoot).
function findGitRoot(startDir) {
  let dir = startDir || process.cwd();
  try { dir = fs.realpathSync(dir); } catch { /* keep raw */ }
  for (let i = 0; i < 64; i++) {
    const dotgit = path.join(dir, '.git');
    let st = null;
    try { st = fs.statSync(dotgit); } catch { st = null; }
    if (st) {
      if (st.isDirectory()) return dir;                          // normal clone
      if (st.isFile()) return mainWorktreeRoot(dir, dotgit) || dir; // linked worktree
      return dir;
    }
    const parent = path.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return null;
}

// Read the remote URL from .git/config without spawning git (fast).
function readRemoteUrl(gitRoot) {
  let cfg = '';
  try { cfg = fs.readFileSync(path.join(gitRoot, '.git', 'config'), 'utf8'); } catch { return null; }
  let inOrigin = false, originUrl = null, firstUrl = null;
  for (const line of cfg.split('\n')) {
    const sec = line.match(/^\s*\[remote\s+"([^"]+)"\]/);
    if (sec) { inOrigin = sec[1] === 'origin'; continue; }
    if (/^\s*\[/.test(line)) inOrigin = false;
    const u = line.match(/^\s*url\s*=\s*(.+?)\s*$/);
    if (u) {
      if (!firstUrl) firstUrl = u[1];
      if (inOrigin && !originUrl) originUrl = u[1];
    }
  }
  return originUrl || firstUrl || null;
}

function normalizeRemote(url) {
  return String(url).replace(/\/\/[^@/]+@/, '//').replace(/\.git$/, '').trim();
}

function username() {
  try { return os.userInfo().username; } catch { return process.env.USER || process.env.USERNAME || 'user'; }
}

// Deterministic seed for a repo's buddy: same person + same repo ⇒
// same species/rarity, always. Fork it ⇒ a different buddy.
function repoSeed(gitRoot) {
  const remote = readRemoteUrl(gitRoot);
  const base = remote ? normalizeRemote(remote) : gitRoot;
  return `repo:${base}:${username()}`;
}

// Resolve where this invocation's buddy lives.
function resolveContext(cwd) {
  const gitRoot = findGitRoot(cwd || process.cwd());
  if (gitRoot) {
    return {
      scope: 'repo',
      gitRoot,
      buddyDir: path.join(gitRoot, '.buddy'),
      savePath: path.join(gitRoot, '.buddy', 'companion.json'),
      seed: repoSeed(gitRoot),
    };
  }
  return { scope: 'global', gitRoot: null, buddyDir: null, savePath: GLOBAL_PATH, seed: null };
}

// Personal, never shared.
function ensureGitignore(gitRoot) {
  if (!gitRoot) return;
  const gi = path.join(gitRoot, '.gitignore');
  let txt = '';
  try { txt = fs.readFileSync(gi, 'utf8'); } catch { /* none yet */ }
  if (/^\s*\.buddy\/?\s*$/m.test(txt)) return;
  const prefix = txt && !txt.endsWith('\n') ? '\n' : '';
  try { fs.writeFileSync(gi, txt + prefix + '.buddy/\n'); } catch { /* best effort */ }
}

// Lightweight cross-repo index for /collection (M6).
function updateCollection(ctx, save) {
  if (!ctx || ctx.scope !== 'repo') return;
  const col = safeReadJSON(COLLECTION_PATH) || { buddies: {} };
  if (!col.buddies) col.buddies = {};
  col.buddies[ctx.gitRoot] = {
    repo: ctx.gitRoot,
    savePath: ctx.savePath,
    seed: save.seed,
    name: (save.soul && save.soul.name) || null,
    xp: save.xp || 0,
    lastSeen: Date.now(),
  };
  safeWriteJSON(COLLECTION_PATH, col);
}

// Pointer to the buddy of the repo you most recently worked in, so the
// status line renders the right one without reading stdin or git.
function writeActivePointer(ctx) {
  safeWriteJSON(ACTIVE_PATH, {
    savePath: ctx.savePath, repo: ctx.gitRoot, scope: ctx.scope, at: Date.now(),
  });
}

function readActiveSavePath() {
  const a = safeReadJSON(ACTIVE_PATH);
  if (a && a.savePath && fs.existsSync(a.savePath)) return a.savePath;
  if (fs.existsSync(GLOBAL_PATH)) return GLOBAL_PATH;
  return null;
}

// Ensure a buddy exists for this context. Performs one-time migration
// of the legacy global buddy, then lazy auto-hatch (only when asked —
// callers pass autoHatch on real activity, not on a mere `cd`).
// Returns the save object, or null when there is intentionally no buddy.
function ensureBuddySave(ctx, opts) {
  opts = opts || {};
  const now = opts.now || Date.now();

  const existing = safeReadJSON(ctx.savePath);
  if (existing) return existing;

  if (ctx.scope === 'global') {
    if (!opts.autoHatch) return null;
    const save = { seed: username(), soul: null, hatchedAt: now, totalPets: 0, totalTalks: 0 };
    safeWriteJSON(ctx.savePath, save);
    return save;
  }

  // repo scope, no companion yet — migrate the legacy global buddy once.
  const global = safeReadJSON(GLOBAL_PATH);
  if (global && !global.migratedTo) {
    const migrated = Object.assign({}, global);
    migrated.repo = ctx.gitRoot;
    migrated.migratedFromGlobal = true;
    safeWriteJSON(ctx.savePath, migrated);
    ensureGitignore(ctx.gitRoot);
    global.migratedTo = ctx.gitRoot; // she only finds one home
    safeWriteJSON(GLOBAL_PATH, global);
    updateCollection(ctx, migrated);
    return migrated;
  }

  if (!opts.autoHatch) return null;
  const save = { seed: ctx.seed, soul: null, hatchedAt: now, totalPets: 0, totalTalks: 0, repo: ctx.gitRoot };
  safeWriteJSON(ctx.savePath, save);
  ensureGitignore(ctx.gitRoot);
  updateCollection(ctx, save);
  return save;
}

module.exports = {
  GLOBAL_PATH, COLLECTION_PATH, ACTIVE_PATH,
  safeReadJSON, safeWriteJSON, safeWriteJSONAtomic, withLock,
  findGitRoot, readRemoteUrl, repoSeed, username,
  resolveContext, ensureBuddySave, ensureGitignore,
  updateCollection, writeActivePointer, readActiveSavePath,
};
