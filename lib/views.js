// Server-rendered HTML. No view engine, plain template strings.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status) {
  const map = { indexed: 'ok', sent: 'info', waiting: 'warn', problem: 'bad' };
  return '<span class="badge ' + (map[status] || 'warn') + '">' + esc(status) + '</span>';
}

function layout(title, active, body) {
  const nav = [
    ['/', 'Dashboard'], ['/sites', 'Sites'], ['/urls', 'URLs'],
    ['/activity', 'Activity'], ['/settings', 'Settings']
  ].map(([href, label]) =>
    '<a href="' + href + '" class="' + (active === href ? 'active' : '') + '">' + label + '</a>'
  ).join('');
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + esc(title) + ' - Indexora</title>'
    + '<link rel="stylesheet" href="/public/style.css"></head><body>'
    + '<div class="app"><aside class="sidebar"><div class="brand">Indexora</div>'
    + '<div class="brand-sub">indexora.topseospecialists.com</div>'
    + '<nav>' + nav + '</nav>'
    + '<div class="side-foot"><a href="/logout">Log out</a><div class="honest">Indexora can only notify Google and Bing. It cannot force a page to be indexed.</div></div>'
    + '</aside><main class="main">' + body + '</main></div></body></html>';
}

function loginPage(error, passwordSet) {
  const note = passwordSet
    ? ''
    : '<p class="alert">No admin password is set. Set the ADMIN_PASSWORD environment variable in hPanel, then restart the app.</p>';
  const err = error ? '<p class="alert">' + esc(error) + '</p>' : '';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>Log in - Indexora</title><link rel="stylesheet" href="/public/style.css"></head><body>'
    + '<div class="login-wrap"><div class="login-card"><div class="brand big">Indexora</div>'
    + '<p class="muted">Your own indexing system. Log in to continue.</p>'
    + err + note
    + '<form method="POST" action="/login"><label>Password</label>'
    + '<input type="password" name="password" autofocus autocomplete="current-password">'
    + '<button type="submit" class="btn primary">Log in</button></form>'
    + '<p class="muted small">Indexora can only notify Google and Bing that a page exists. It cannot force indexing.</p>'
    + '</div></div></body></html>';
}

function dashboardPage(d) {
  const siteRows = d.sites.map(s => {
    const u = d.perSite[s.id] || { total: 0, indexed: 0, waiting: 0, sent: 0, problem: 0 };
    const pct = u.total ? Math.round((u.indexed / u.total) * 100) : 0;
    return '<tr><td><strong>' + esc(s.name) + '</strong><br><span class="muted small">' + esc(s.domain) + '</span></td>'
      + '<td>' + u.total + '</td><td>' + u.indexed + '</td><td>' + u.waiting + '</td>'
      + '<td>' + fmtDate(s.lastWatched) + '</td>'
      + '<td><span class="badge ' + (s.active ? 'ok' : 'warn') + '">' + (s.active ? 'Active' : 'Paused') + '</span></td>'
      + '<td><div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div><span class="muted small">' + pct + '%</span></td></tr>';
  }).join('');
  const actRows = d.activity.slice(0, 10).map(a =>
    '<li><span class="muted">' + fmtDate(a.ts) + '</span> <strong>' + esc(a.type) + '</strong> ' + esc(a.message) + '</li>'
  ).join('') || '<li class="muted">No activity yet. Run a cycle from Settings.</li>';
  const keyWarn = d.key.configured ? '' :
    '<p class="alert">Google key not configured. ' + esc(d.key.error) + ' Add it in Settings.</p>';
  return layout('Dashboard', '/', ''
    + '<div class="topbar"><h1>Dashboard</h1><span class="muted">' + esc(d.today) + '</span></div>'
    + keyWarn
    + '<div class="cards">'
    + '<div class="card"><div class="card-label">Total URLs</div><div class="card-num">' + d.totals.total + '</div></div>'
    + '<div class="card"><div class="card-label">Indexed</div><div class="card-num">' + d.totals.indexed + '</div></div>'
    + '<div class="card"><div class="card-label">Waiting</div><div class="card-num">' + d.totals.waiting + '</div></div>'
    + '<div class="card"><div class="card-label">Sent today</div><div class="card-num">' + d.sentToday + ' / 200</div><div class="muted small">Google Indexing API daily limit</div></div>'
    + '</div>'
    + '<div class="panel"><h2>Your sites</h2><table><thead><tr><th>Site</th><th>URLs</th><th>Indexed</th><th>Waiting</th><th>Last check</th><th>Status</th><th>Progress</th></tr></thead><tbody>'
    + (siteRows || '<tr><td colspan="7" class="muted">No sites yet. Add one on the Sites page.</td></tr>')
    + '</tbody></table></div>'
    + '<div class="panel"><h2>Recent activity</h2><ul class="activity">' + actRows + '</ul>'
    + '<p><a href="/activity">See all activity</a> &middot; <a href="/settings">Run a cycle now</a></p></div>');
}

function sitesPage(sites, perSite, msg) {
  const rows = sites.map(s => {
    const u = perSite[s.id] || { total: 0, indexed: 0, waiting: 0 };
    return '<tr><td><strong>' + esc(s.name) + '</strong><br><span class="muted small">' + esc(s.domain) + '</span></td>'
      + '<td class="small">' + esc(s.sitemapUrl) + '</td>'
      + '<td>' + u.total + ' URLs<br><span class="muted small">' + u.indexed + ' indexed, ' + u.waiting + ' waiting</span></td>'
      + '<td>' + (s.indexnowKey ? 'Set' : 'Not set') + '</td>'
      + '<td><span class="badge ' + (s.active ? 'ok' : 'warn') + '">' + (s.active ? 'Active' : 'Paused') + '</span></td>'
      + '<td><form method="POST" action="/sites/' + esc(s.id) + '/toggle" style="display:inline"><button class="btn small">' + (s.active ? 'Pause' : 'Resume') + '</button></form> '
      + '<form method="POST" action="/sites/' + esc(s.id) + '/delete" style="display:inline" onsubmit="return confirm(\'Delete this site and all its URLs?\')"><button class="btn small danger">Delete</button></form></td></tr>';
  }).join('');
  return layout('Sites', '/sites', ''
    + '<div class="topbar"><h1>Sites</h1></div>'
    + (msg ? '<p class="alert ok">' + esc(msg) + '</p>' : '')
    + '<div class="panel"><h2>Your sites</h2><table><thead><tr><th>Site</th><th>Sitemap</th><th>URLs</th><th>IndexNow key</th><th>Status</th><th>Actions</th></tr></thead><tbody>'
    + (rows || '<tr><td colspan="6" class="muted">No sites yet.</td></tr>')
    + '</tbody></table></div>'
    + '<div class="panel"><h2>Add a site</h2>'
    + '<form method="POST" action="/sites/add" class="form-grid">'
    + '<label>Name <input name="name" required placeholder="Bamboo"></label>'
    + '<label>Domain <input name="domain" required placeholder="thebambooinsider.com"></label>'
    + '<label>Sitemap URL <input name="sitemapUrl" required placeholder="https://example.com/sitemap.xml"></label>'
    + '<label>IndexNow key (optional) <input name="indexnowKey" placeholder="32 character key"></label>'
    + '<button type="submit" class="btn primary">Add site</button></form>'
    + '<p class="muted small">The sitemap can be a plain sitemap or a sitemap index, Indexora follows indexes. The IndexNow key file must already live at the site root as {key}.txt.</p></div>');
}

function urlsPage(rows, sites, filter, page, totalPages, totals) {
  const siteOpts = sites.map(s => '<option value="' + esc(s.id) + '"' + (filter.siteId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
  const statusOpts = ['all', 'waiting', 'sent', 'indexed', 'problem'].map(st =>
    '<option value="' + st + '"' + (filter.status === st ? ' selected' : '') + '>' + st + '</option>').join('');
  const trs = rows.map(u => {
    const site = sites.find(s => s.id === u.siteId);
    return '<tr><td class="small"><a href="' + esc(u.url) + '" target="_blank" rel="noopener">' + esc(u.url) + '</a><br><span class="muted small">' + esc(site ? site.name : u.siteId) + '</span></td>'
      + '<td>' + statusBadge(u.status) + '</td>'
      + '<td class="small">' + esc(u.lastmod || '-') + '</td>'
      + '<td class="small">' + fmtDate(u.lastSent) + '</td>'
      + '<td class="small">' + fmtDate(u.lastChecked) + '</td>'
      + '<td class="small">' + esc(u.checkResult || u.lastError || '-') + '</td></tr>';
  }).join('');
  const pager = totalPages > 1
    ? '<p class="muted">Page ' + page + ' of ' + totalPages + ' &nbsp; '
      + (page > 1 ? '<a href="/urls?site=' + esc(filter.siteId) + '&status=' + esc(filter.status) + '&page=' + (page - 1) + '">Previous</a> ' : '')
      + (page < totalPages ? '<a href="/urls?site=' + esc(filter.siteId) + '&status=' + esc(filter.status) + '&page=' + (page + 1) + '">Next</a>' : '') + '</p>'
    : '';
  return layout('URLs', '/urls', ''
    + '<div class="topbar"><h1>URLs</h1><span class="muted">' + totals.total + ' total &middot; ' + totals.indexed + ' indexed &middot; ' + totals.waiting + ' waiting</span></div>'
    + '<div class="panel"><form method="GET" action="/urls" class="filters">'
    + '<label>Site <select name="site"><option value="all">All sites</option>' + siteOpts + '</select></label>'
    + '<label>Status <select name="status">' + statusOpts + '</select></label>'
    + '<button type="submit" class="btn">Filter</button></form>'
    + '<table><thead><tr><th>URL</th><th>Status</th><th>Last modified</th><th>Last sent</th><th>Last checked</th><th>Result</th></tr></thead><tbody>'
    + (trs || '<tr><td colspan="6" class="muted">No URLs match. Run a watch from Settings to load a site sitemap.</td></tr>')
    + '</tbody></table>' + pager + '</div>');
}

function activityPage(log) {
  const rows = log.map(a =>
    '<li><span class="muted">' + fmtDate(a.ts) + '</span> <strong>' + esc(a.type) + '</strong> ' + esc(a.message)
    + (a.detail ? '<br><span class="muted small">' + esc(a.detail) + '</span>' : '') + '</li>'
  ).join('') || '<li class="muted">No activity yet.</li>';
  return layout('Activity', '/activity', ''
    + '<div class="topbar"><h1>Activity</h1></div>'
    + '<div class="panel"><ul class="activity">' + rows + '</ul></div>');
}

function settingsPage(d) {
  const key = d.key;
  const keyBlock = key.configured
    ? '<p>Service account key: <strong>configured</strong><br><span class="muted">Account: ' + esc(key.email) + (key.projectId ? ' &middot; Project: ' + esc(key.projectId) : '') + '</span></p>'
    : '<p class="alert">Service account key: <strong>not configured</strong><br>' + esc(key.error) + '</p>';
  const last = d.state.lastRun
    ? esc(d.state.lastRun.kind) + ' at ' + fmtDate(d.state.lastRun.at) + ' (' + Math.round(d.state.lastRun.ms / 1000) + 's)'
    : 'Never';
  const insp = Object.entries(d.state.inspections || {}).map(([sid, n]) => {
    const s = d.sites.find(x => x.id === sid);
    return '<li>' + esc(s ? s.name : sid) + ': ' + n + ' / 2,000 checks today</li>';
  }).join('') || '<li>No checks today.</li>';
  return layout('Settings', '/settings', ''
    + '<div class="topbar"><h1>Settings</h1></div>'
    + (d.msg ? '<p class="alert ok">' + esc(d.msg) + '</p>' : '')
    + (d.err ? '<p class="alert">' + esc(d.err) + '</p>' : '')
    + '<div class="panel"><h2>Google connection</h2>' + keyBlock
    + '<p class="muted small">Set the key with the GOOGLE_KEY_JSON environment variable in hPanel (paste the whole JSON file as one line), or upload the file as google-key.json into the app folder and set GOOGLE_KEY_FILE to ./google-key.json. The key file itself is never shown here.</p></div>'
    + '<div class="panel"><h2>Daily quotas (today)</h2>'
    + '<p>Google Indexing API: <strong>' + d.state.indexingSent + ' / 200</strong> sent</p>'
    + '<ul class="activity">' + insp + '</ul>'
    + '<p class="muted small">Limits reset at midnight. URLs over the limit are queued for tomorrow, nothing is lost.</p></div>'
    + '<div class="panel"><h2>Run now</h2>'
    + '<p class="muted">The daily cycle runs at 06:00 PKT. You can also run any step now.</p>'
    + '<form method="POST" action="/run/cycle" style="display:inline"><button class="btn primary">Run full cycle</button></form> '
    + '<form method="POST" action="/run/watch" style="display:inline"><button class="btn">Watch sitemaps</button></form> '
    + '<form method="POST" action="/run/submit" style="display:inline"><button class="btn">Send to Google + IndexNow</button></form> '
    + '<form method="POST" action="/run/check" style="display:inline"><button class="btn">Check index status</button></form>'
    + '<p class="muted small">Last run: ' + last + '</p></div>'
    + '<div class="panel"><h2>Honest limits</h2>'
    + '<p>Indexora tells Google (Indexing API) and Bing and the others (IndexNow) that a page exists or changed, and it checks Search Console for the result. It cannot force Google to index a page. Whether a page gets indexed depends on the page itself. The Indexing API is officially for job posting and livestream pages, so using it for product and blog pages is off-label, the same grey area the paid indexers live in.</p></div>');
}

module.exports = { esc, layout, loginPage, dashboardPage, sitesPage, urlsPage, activityPage, settingsPage, fmtDate };
