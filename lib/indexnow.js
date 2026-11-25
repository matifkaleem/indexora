// IndexNow (Bing, Yandex, Seznam, Naver, Yep). Google does NOT take part.
// Free, no quota. Batches of 100 URLs per POST (limit is 10,000).
// Returns [{ status, count, error? }] one entry per batch.
async function submitIndexNow(host, key, keyLocation, urls) {
  const batches = [];
  for (let i = 0; i < urls.length; i += 100) batches.push(urls.slice(i, i + 100));
  const results = [];
  for (const batch of batches) {
    try {
      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, key, keyLocation, urlList: batch })
      });
      results.push({ status: res.status, count: batch.length, error: res.status >= 400 ? ('HTTP ' + res.status) : '' });
    } catch (e) {
      results.push({ status: 0, count: batch.length, error: e.message });
    }
  }
  return results;
}

module.exports = { submitIndexNow };
