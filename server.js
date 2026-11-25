// Indexora - your own indexing system.
// Entry file. Hostinger auto-detects server.js and runs `npm start`.
// Listens on process.env.PORT (Hostinger sets it) or 3000 locally.
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const store = require('./lib/store');
const routes = require('./lib/routes');
const jobs = require('./lib/jobs');
const auth = require('./lib/auth');

store.ensureDir();
// Seed empty data files on first boot so the dashboard always has something to read.
if (!store.read('sites.json', null)) store.write('sites.json', store.read('sites.json', []));
if (!store.read('urls.json', null)) store.write('urls.json', []);
if (!store.read('activity.json', null)) store.write('activity.json', []);
store.getState();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Indexora listening on port ' + PORT);
  console.log('Admin password set: ' + (auth.passwordSet() ? 'yes' : 'NO - set ADMIN_PASSWORD env var'));
  console.log('Sites: ' + store.getSites().length + ' | URLs tracked: ' + store.getUrls().length);
});

// Daily cycle at 06:00 Asia/Karachi (configurable with CRON_SCHEDULE).
const schedule = process.env.CRON_SCHEDULE || '0 6 * * *';
cron.schedule(schedule, () => {
  console.log('Indexora daily cycle starting (' + new Date().toISOString() + ')');
  jobs.runCycle('cycle').then(r => console.log('Indexora daily cycle finished:', r.ok ? 'ok' : r.error));
}, { timezone: 'Asia/Karachi' });
console.log('Daily cycle scheduled: ' + schedule + ' (Asia/Karachi)');
