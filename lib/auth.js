// Single-admin login. Password comes from env ADMIN_PASSWORD.
// The session is one HMAC cookie, no server-side session store.
const crypto = require('crypto');

function secret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || 'indexora-change-this-secret';
}

function adminToken() {
  return crypto.createHmac('sha256', secret()).update('indexora-admin').digest('hex');
}

function passwordSet() {
  return !!process.env.ADMIN_PASSWORD;
}

function isAuthed(req) {
  const cookies = (req.headers.cookie || '').split(';').map(s => s.trim());
  return cookies.some(c => c === 'indexora_admin=' + adminToken());
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  return res.redirect('/login');
}

function checkPassword(pw) {
  if (!passwordSet()) return false;
  return pw === process.env.ADMIN_PASSWORD;
}

module.exports = { passwordSet, isAuthed, requireAuth, checkPassword, adminToken };
