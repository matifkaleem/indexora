const express = require('express');
const crypto = require('crypto');
const store = require('./store');
const auth = require('./auth');
const jobs = require('./jobs');
const g = require('./google');
const views = require('./views');

const router = express.Router();

function perSiteTotals() {
  const urls = store.getUrls();
  const per = {};
  for (const u of urls) {
    const p = per[u.siteId] = per[u.siteId] || { total: 0, indexed: 0, waiting: 0, sent: 0, problem: 0 };
    p.total++;
    if (u.status === 'indexed') p.indexed++;
    else if (u.status === 'waiting') p.waiting++;
    else if (u.status === 'sent') p.sent++;
    else if (u.status === 'problem') p.problem++;
  }
  return per;
}

function grandTotals() {
  const per = perSiteTotals();
  const t = { total: 0, indexed: 0, waiting: 0, sent: 0, problem: 0 };
  for (const p of Object.values(per)) {
    t.total += p.total; t.indexed += p.indexed;
    t.waiting += p.waiting + p.sent; t.sent += p.sent; t.problem += p.problem;
  }
  return t;
}

// --- Login (public) ---
router.get('/login', (req, res) => {
  if (auth.isAuthed(req)) return res.redirect('/');
  res.send(views.loginPage('', auth.passwordSet()));
});

router.post('/login', (req, res) => {
  if (!auth.passwordSet()) {
    return res.send(views.loginPage('No admin password is set. Set ADMIN_PASSWORD in hPanel first.', false));
  }
  if (auth.checkPassword(req.body.password || '')) {
    res.setHeader('Set-Cookie', 'indexora_admin=' + auth.adminToken() + '; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax');
    return res.redirect('/');
  }
  res.send(views.loginPage('Wrong password.', true));
});

router.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'indexora_admin=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/login');
});

// --- Protected pages ---
router.use(auth.requireAuth);

router.get('/', (req, res) => {
  const sites = store.getSites();
  const state = store.getState();
  res.send(views.dashboardPage({
    today: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    sites, perSite: perSiteTotals(), totals: grandTotals(),
    sentToday: state.indexingSent || 0,
    activity: store.getActivity().slice(0, 10),
    key: g.keyStatus()
  }));
});

router.get('/sites', (req, res) => {
  res.send(views.sitesPage(store.getSites(), perSiteTotals(), req.query.msg || ''));
});

router.post('/sites/add', (req, res) => {
  const name = (req.body.name || '').trim();
  const domain = (req.body.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  let sitemapUrl = (req.body.sitemapUrl || '').trim();
  const indexnowKey = (req.body.indexnowKey || '').trim();
  if (!name || !domain || !sitemapUrl) return res.redirect('/sites');
  if (!/^https?:\/\//.test(sitemapUrl)) sitemapUrl = 'https://' + sitemapUrl;
  const sites = store.getSites();
  sites.push({
    id: crypto.randomBytes(6).toString('hex'),
    name, domain,
    siteUrl: 'https://' + domain,
    sitemapUrl, indexnowKey,
    active: true, createdAt: new Date().toISOString()
  });
  store.saveSites(sites);
  store.logActivity('system', null, 'Site added: ' + name + ' (' + domain + ')', sitemapUrl);
  res.redirect('/sites?msg=' + encodeURIComponent('Site added. Run a watch from Settings to load its sitemap.'));
});

router.post('/sites/:id/toggle', (req, res) => {
  const sites = store.getSites();
  const s = sites.find(x => x.id === req.params.id);
  if (s) { s.active = !s.active; store.saveSites(sites); }
  res.redirect('/sites');
});

router.post('/sites/:id/delete', (req, res) => {
  const sites = store.getSites().filter(x => x.id !== req.params.id);
  store.saveSites(sites);
  store.saveUrls(store.getUrls().filter(u => u.siteId !== req.params.id));
  store.logActivity('system', req.params.id, 'Site deleted', '');
  res.redirect('/sites');
});

router.get('/urls', (req, res) => {
  const sites = store.getSites();
  const filter = {
    siteId: req.query.site || 'all',
    status: req.query.status || 'all'
  };
  let rows = store.getUrls();
  if (filter.siteId !== 'all') rows = rows.filter(u => u.siteId === filter.siteId);
  if (filter.status !== 'all') rows = rows.filter(u => u.status === filter.status);
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const perPage = 100;
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const slice = rows.slice((page - 1) * perPage, page * perPage);
  res.send(views.urlsPage(slice, sites, filter, page, totalPages, grandTotals()));
});

router.get('/activity', (req, res) => {
  res.send(views.activityPage(store.getActivity()));
});

router.get('/settings', (req, res) => {
  res.send(views.settingsPage({
    key: g.keyStatus(), state: store.getState(), sites: store.getSites(),
    msg: req.query.msg || '', err: req.query.err || ''
  }));
});

router.post('/run/:job', async (req, res) => {
  const job = req.params.job;
  if (!['watch', 'submit', 'check', 'cycle'].includes(job)) return res.redirect('/settings');
  const result = await jobs.runCycle(job);
  if (result.ok) {
    res.redirect('/settings?msg=' + encodeURIComponent('Run finished: ' + job + '. See Activity for details.'));
  } else {
    res.redirect('/settings?err=' + encodeURIComponent(result.error || 'Run failed.'));
  }
});

// JSON status for polling (also used by the dashboard run buttons).
router.get('/api/status', (req, res) => {
  const state = store.getState();
  res.json({
    running: jobs.status(),
    sentToday: state.indexingSent || 0,
    inspectionsToday: state.inspections || {},
    totals: grandTotals(),
    keyConfigured: g.keyStatus().configured,
    lastRun: state.lastRun
  });
});

module.exports = router;
