// Sitemap fetching and parsing. Pure JS, no XML library needed:
// sitemaps are a fixed, simple format (<url><loc>…</loc><lastmod>…</lastmod></url>).
// Handles plain urlsets and sitemap indexes (followed recursively, depth-capped).
const MAX_SUB_SITEMAPS = 50;
const FETCH_TIMEOUT_MS = 20000;

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Indexora/1.0 (+https://indexora.topseospecialists.com/)' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + url);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function parseUrlset(xml) {
  const out = [];
  const urlRe = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = urlRe.exec(xml)) !== null) {
    const block = m[1];
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(block);
    if (!loc) continue;
    const lm = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(block);
    out.push({ url: loc[1].trim(), lastmod: lm ? lm[1].trim() : '' });
  }
  return out;
}

function parseSitemapIndex(xml) {
  const out = [];
  const smRe = /<sitemap>([\s\S]*?)<\/sitemap>/g;
  let m;
  while ((m = smRe.exec(xml)) !== null) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(m[1]);
    if (loc) out.push(loc[1].trim());
  }
  return out;
}

// Returns { urls: [{url, lastmod}], sources: [fetched sitemap urls], errors: [strings] }
async function fetchSitemapTree(startUrl, depth) {
  const seen = new Set();
  const urls = new Map(); // url -> {url, lastmod}
  const sources = [];
  const errors = [];

  async function walk(url, d) {
    if (seen.has(url)) return;
    seen.add(url);
    let xml;
    try {
      xml = await fetchText(url);
    } catch (e) {
      errors.push(url + ': ' + e.message);
      return;
    }
    sources.push(url);
    if (/<sitemapindex[\s>]/.test(xml) && d < 2) {
      const subs = parseSitemapIndex(xml).slice(0, MAX_SUB_SITEMAPS);
      for (const sub of subs) await walk(sub, d + 1);
    } else {
      for (const u of parseUrlset(xml)) {
        if (!urls.has(u.url)) urls.set(u.url, u);
        else if (u.lastmod && urls.get(u.url).lastmod !== u.lastmod) {
          urls.get(u.url).lastmod = u.lastmod;
        }
      }
    }
  }

  await walk(startUrl, depth || 0);
  return { urls: Array.from(urls.values()), sources, errors };
}

module.exports = { fetchText, parseUrlset, parseSitemapIndex, fetchSitemapTree };
