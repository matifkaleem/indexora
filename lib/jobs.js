// The three jobs and the daily full cycle.
// Quotas (Google, per day): Indexing API 200 notifications per project.
// URL Inspection API 2,000 checks per property. Counters live in state.json
// and reset automatically each new day. IndexNow is free and unlimited.
const crypto = require('crypto');
const store = require('./store');
const sitemap = require('./sitemap');
const g = require('./google');
const { submitIndexNow } = require('./indexnow');

const INDEXING_DAILY_LIMIT = 200;
const INSPECT_DAILY_LIMIT = 2000;

let running = null; // { kind, startedAt } while a job runs

function urlId(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

// Search Console property string for the checker. The URL Inspection API
// wants the exact property as registered: URL-prefix properties end with
// a trailing slash (https://example.com/). Sending the same address with
// no slash made Google answer PERMISSION_DENIED for every check (25 Nov 2026).
// A site can override with its own gscProperty (for example sc-domain:...).
function gscProperty(site) {
  if (site.gscProperty) return site.gscProperty;
  return (site.siteUrl || '').replace(/\/?$/, '/');
}

// --- Watcher: fetch each active site's sitemap, add new URLs, reopen changed ones.
async function watchAll() {
  const sites = store.getSites().filter(s => s.active);
  const urls = store.getUrls();
  const byUrl = new Map(urls.map(u => [u.url, u]));
  let added = 0, reopened = 0, total = 0;
  const changedBySite = {};

  for (const site of sites) {
    const res = await sitemap.fetchSitemapTree(site.sitemapUrl);
    total += res.urls.length;
    const changed = [];
    for (const entry of res.urls) {
      const existing = byUrl.get(entry.url);
      if (!existing) {
        const rec = {
          id: urlId(entry.url), siteId: site.id, url: entry.url,
          lastmod: entry.lastmod || '', status: 'waiting',
          firstSeen: new Date().toISOString(), lastSent: '', lastChecked: '',
          sentCount: 0, checkResult: '', lastError: ''
        };
        urls.push(rec);
        byUrl.set(entry.url, rec);
        added++;
        changed.push(entry.url);
      } else if (entry.lastmod && existing.lastmod !== entry.lastmod) {
        existing.lastmod = entry.lastmod;
        if (existing.status === 'indexed' || existing.status === 'sent') {
          existing.status = 'waiting';
          reopened++;
          changed.push(entry.url);
        }
      }
    }
    changedBySite[site.id] = changed;
    for (const err of res.errors) {
      store.logActivity('watch', site.id, 'Sitemap fetch problem for ' + site.name, err);
    }
    store.logActivity('watch', site.id,
      'Watched ' + site.name + ': ' + res.urls.length + ' URLs in sitemap, ' + changed.length + ' new or changed',
      res.sources.join(', '));
  }
  store.saveUrls(urls);
  return { added, reopened, total, changedBySite };
}

// --- Submitter: Google Indexing API (quota-capped) + IndexNow (unlimited).
async function submitAll(changedBySite) {
  const state = store.getState();
  const urls = store.getUrls();
  const sites = new Map(store.getSites().map(s => [s.id, s]));
  let sent = 0, failed = 0;
  const remaining = INDEXING_DAILY_LIMIT - (state.indexingSent || 0);

  const candidates = urls
    .filter(u => u.status === 'waiting')
    .sort((a, b) => (a.firstSeen || '').localeCompare(b.firstSeen || ''));

  const toSend = candidates.slice(0, Math.max(0, remaining));
  const queued = candidates.length - toSend.length;

  for (const u of toSend) {
    const r = await g.publishUrl(u.url);
    if (r.ok) {
      u.status = 'sent';
      u.lastSent = new Date().toISOString();
      u.sentCount = (u.sentCount || 0) + 1;
      u.lastError = '';
      sent++;
      state.indexingSent = (state.indexingSent || 0) + 1;
    } else {
      u.status = 'problem';
      u.lastError = r.error;
      failed++;
    }
    if (sent % 20 === 0) { store.saveUrls(urls); store.saveState(state); }
  }
  store.saveUrls(urls);
  store.saveState(state);
  store.logActivity('send', null,
    'Google Indexing API: sent ' + sent + ', failed ' + failed + ', ' + queued + ' still queued for tomorrow (daily limit ' + INDEXING_DAILY_LIMIT + ')',
    '');

  // IndexNow: send the new/changed URLs for every site that has a key.
  let indexNowSent = 0, indexNowErrors = [];
  for (const site of store.getSites().filter(s => s.active && s.indexnowKey)) {
    const list = (changedBySite && changedBySite[site.id]) || [];
    if (!list.length) continue;
    const keyLocation = site.siteUrl + '/' + site.indexnowKey + '.txt';
    const results = await submitIndexNow(site.domain, site.indexnowKey, keyLocation, list);
    for (const r of results) {
      if (r.status === 200 || r.status === 202) indexNowSent += r.count;
      else indexNowErrors.push(site.name + ': HTTP ' + r.status + ' ' + (r.error || ''));
    }
    store.logActivity('indexnow', site.id,
      'IndexNow: sent ' + list.length + ' URLs for ' + site.name,
      results.map(r => r.count + ' URLs -> HTTP ' + r.status).join('; '));
  }
  return { sent, failed, queued, indexNowSent, indexNowErrors };
}

// --- Checker: URL Inspection API, sent URLs first, then waiting ones.
async function checkAll() {
  const state = store.getState();
  const urls = store.getUrls();
  const sites = new Map(store.getSites().map(s => [s.id, s]));
  let checked = 0, indexed = 0, stillWaiting = 0, problems = 0;

  const bySite = {};
  for (const u of urls) {
    if (u.status !== 'sent' && u.status !== 'waiting' && u.status !== 'problem') continue;
    (bySite[u.siteId] = bySite[u.siteId] || []).push(u);
  }

  for (const siteId of Object.keys(bySite)) {
    const site = sites.get(siteId);
    if (!site) continue;
    const used = (state.inspections && state.inspections[siteId]) || 0;
    let remaining = INSPECT_DAILY_LIMIT - used;
    if (remaining <= 0) {
      store.logActivity('check', siteId, 'Check skipped for ' + site.name + ': daily URL Inspection limit reached (' + INSPECT_DAILY_LIMIT + ')', '');
      continue;
    }
    const list = bySite[siteId].sort((a, b) => {
      const rank = s => (s === 'sent' ? 0 : s === 'problem' ? 1 : 2);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return (a.lastChecked || '').localeCompare(b.lastChecked || '');
    });
    let siteChecked = 0, siteIndexed = 0;
    for (const u of list) {
      if (remaining <= 0) break;
      const r = await g.inspectUrl(gscProperty(site), u.url);
      remaining--;
      checked++;
      siteChecked++;
      state.inspections = state.inspections || {};
      state.inspections[siteId] = (state.inspections[siteId] || 0) + 1;
      u.lastChecked = new Date().toISOString();
      if (!r.ok) {
        u.status = 'problem';
        u.lastError = r.error;
        problems++;
        continue;
      }
      u.checkResult = r.coverageState || r.verdict || '';
      u.lastError = '';
      if (r.indexingState === 'INDEXING_STATE_INDEXED' || /Indexed/.test(r.coverageState || '')) {
        if (u.status !== 'indexed') {
          store.logActivity('check', siteId, 'Indexed: ' + u.url, r.coverageState);
        }
        u.status = 'indexed';
        indexed++;
        siteIndexed++;
      } else if (r.verdict === 'FAIL' || /Blocked|Invalid|Error/.test(r.coverageState || '')) {
        u.status = 'problem';
        problems++;
      } else {
        u.status = 'waiting';
        stillWaiting++;
      }
      if (siteChecked % 50 === 0) { store.saveUrls(urls); store.saveState(state); }
    }
    store.logActivity('check', siteId,
      'Checked ' + siteChecked + ' URLs for ' + site.name + ': ' + siteIndexed + ' indexed',
      '');
  }
  store.saveUrls(urls);
  store.saveState(state);
  return { checked, indexed, stillWaiting, problems };
}

// --- Full daily cycle: watch, then submit, then check.
async function runCycle(kind) {
  if (running) return { ok: false, error: 'A job is already running (' + running.kind + ' since ' + running.startedAt + ')' };
  running = { kind, startedAt: new Date().toISOString() };
  const started = Date.now();
  try {
    let out = { kind };
    if (kind === 'watch' || kind === 'cycle') out.watch = await watchAll();
    if (kind === 'submit' || kind === 'cycle') out.submit = await submitAll(out.watch ? out.watch.changedBySite : null);
    if (kind === 'check' || kind === 'cycle') out.check = await checkAll();
    const state = store.getState();
    state.lastRun = { kind, at: new Date().toISOString(), ms: Date.now() - started, result: out };
    store.saveState(state);
    store.logActivity('system', null, 'Run finished: ' + kind + ' in ' + Math.round((Date.now() - started) / 1000) + 's', '');
    return { ok: true, ...out };
  } catch (e) {
    store.logActivity('system', null, 'Run failed: ' + kind, e.message);
    return { ok: false, error: e.message };
  } finally {
    running = null;
  }
}

function status() {
  return running ? { running: true, ...running } : { running: false };
}

module.exports = { runCycle, watchAll, submitAll, checkAll, status, gscProperty, INDEXING_DAILY_LIMIT, INSPECT_DAILY_LIMIT };
