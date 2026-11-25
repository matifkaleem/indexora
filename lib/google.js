// Google APIs via the official googleapis package.
// Auth: service account key from GOOGLE_KEY_JSON env var (JSON text),
// or GOOGLE_KEY_FILE env var, or ./google-key.json in the app folder.
// No key here is fine: calls fail gracefully and the dashboard says so.
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = [
  'https://www.googleapis.com/auth/indexing',
  'https://www.googleapis.com/auth/webmasters'
];

function loadKey() {
  if (process.env.GOOGLE_KEY_JSON) {
    try {
      return JSON.parse(process.env.GOOGLE_KEY_JSON);
    } catch (e) {
      return { error: 'GOOGLE_KEY_JSON is not valid JSON: ' + e.message };
    }
  }
  const p = process.env.GOOGLE_KEY_FILE || path.join(__dirname, '..', 'google-key.json');
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      return { error: 'Key file ' + p + ' is not valid JSON: ' + e.message };
    }
  }
  return { error: 'No service account key configured. Set the GOOGLE_KEY_JSON env var in hPanel, or upload google-key.json into the app folder.' };
}

let auth = null;

function getAuth() {
  if (auth) return { auth };
  const key = loadKey();
  if (key.error) return { error: key.error };
  auth = new google.auth.GoogleAuth({ credentials: key, scopes: SCOPES });
  return { auth };
}

function keyStatus() {
  const key = loadKey();
  if (key.error) return { configured: false, error: key.error };
  return { configured: true, email: key.client_email || '(key has no client_email field)', projectId: key.project_id || '' };
}

// Tell Google a URL was added or updated. Returns { ok, data } or { ok:false, error }.
async function publishUrl(url) {
  const a = getAuth();
  if (a.error) return { ok: false, error: a.error };
  try {
    const indexing = google.indexing({ version: 'v3', auth: a.auth });
    const res = await indexing.urlNotifications.publish({
      requestBody: { url, type: 'URL_UPDATED' }
    });
    return { ok: true, data: res.data };
  } catch (e) {
    return { ok: false, error: googleErrorMessage(e) };
  }
}

// Check one URL's index status in Search Console.
// Returns { ok, verdict, coverageState, indexingState, raw } or { ok:false, error }.
async function inspectUrl(siteUrl, url) {
  const a = getAuth();
  if (a.error) return { ok: false, error: a.error };
  try {
    const sc = google.searchconsole({ version: 'v1', auth: a.auth });
    const res = await sc.urlInspection.index.inspect({
      requestBody: { siteUrl, inspectionUrl: url }
    });
    const r = (res.data && res.data.inspectionResult) || {};
    const s = r.indexStatusResult || {};
    return {
      ok: true,
      verdict: s.verdict || '',
      coverageState: s.coverageState || '',
      indexingState: s.indexingState || '',
      robotsTxtState: s.robotsTxtState || '',
      raw: r
    };
  } catch (e) {
    return { ok: false, error: googleErrorMessage(e) };
  }
}

function googleErrorMessage(e) {
  if (e && e.response && e.response.data && e.response.data.error) {
    const err = e.response.data.error;
    return (err.status || 'Error') + ': ' + (err.message || JSON.stringify(err));
  }
  return (e && e.message) || String(e);
}

module.exports = { getAuth, publishUrl, inspectUrl, keyStatus, loadKey };
