// Simple JSON-file storage. No database server, no native modules.
// Files live in data/. Writes go through a temp file + rename so a
// crash mid-write cannot corrupt the live file.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function file(name) {
  return path.join(DATA_DIR, name);
}

function read(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function write(name, data) {
  ensureDir();
  const tmp = file(name + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file(name));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Daily quota counters. Resets automatically when the date changes.
function getState() {
  const s = read('state.json', { date: todayStr(), indexingSent: 0, inspections: {}, lastRun: null });
  if (s.date !== todayStr()) {
    s.date = todayStr();
    s.indexingSent = 0;
    s.inspections = {};
    write('state.json', s);
  }
  return s;
}
function saveState(s) { write('state.json', s); }

function getSites() { return read('sites.json', []); }
function saveSites(s) { write('sites.json', s); }

function getUrls() { return read('urls.json', []); }
function saveUrls(u) { write('urls.json', u); }

function getActivity() { return read('activity.json', []); }

function logActivity(type, siteId, message, detail) {
  const a = getActivity();
  a.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: new Date().toISOString(),
    type,
    siteId: siteId || null,
    message,
    detail: detail || ''
  });
  write('activity.json', a.slice(0, 500));
}

module.exports = {
  DATA_DIR, ensureDir, read, write, todayStr,
  getState, saveState, getSites, saveSites, getUrls, saveUrls,
  getActivity, logActivity
};
