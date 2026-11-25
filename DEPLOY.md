# Deploy Indexora on Hostinger

App: Node.js + Express + googleapis. Entry file `server.js`, start command `npm start`.
Runs on the Business Web Hosting plan, no VPS needed. The app is already built;
this file is only the upload and the two secrets.

## What is already done

- Sub-domain `indexora.topseospecialists.com` is live.
- Google Cloud project `indexora` exists, Indexing API and Search Console API enabled.
- Service account `indexora-key@indexora-515817.iam.gserviceaccount.com` exists and is
  Owner in Search Console for Bamboo.
- IndexNow key file for Bamboo is live on the site.
- The app ships with Bamboo pre-loaded: 383 product URLs, all status "waiting".

## Step 1: Upload the app

1. In Hostinger hPanel, go to **Websites**, click **Add Website**.
2. Choose **Node.js web app**.
3. Choose **Upload your files** and upload `indexora-deploy.zip`.
4. For the domain, pick `indexora.topseospecialists.com`.
5. Node.js version: **20** or **22**. Leave the application root and start command
   at their defaults (`npm start`, entry file `server.js` is auto-detected).
6. If Hostinger shows "Unsupported framework or invalid project structure":
   this means its detector missed the app. Fix it in the same flow: set the
   **Framework preset** dropdown to **Other** (Hostinger added this type
   exactly for apps its detector misses), set the entry file to `server.js`,
   and continue. Also make sure the zip you upload has `package.json` at its
   top level, not inside a folder. Then click **Deploy**. Hostinger installs
   the dependencies (takes a few minutes) and starts the app.

## Step 2: Set the two secrets

In hPanel, open the Node.js app, go to **Environment variables**, and add:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | Pick a strong password. This is the only login for the dashboard. |
| `ADMIN_SESSION_SECRET` | Any long random string, for example 32 random letters and numbers. |
| `GOOGLE_KEY_JSON` | The whole service account JSON key file, pasted as ONE line. |

### How to paste GOOGLE_KEY_JSON

1. Open the downloaded JSON key file in Notepad.
2. Select everything (Ctrl+A), copy it.
3. Paste it into the `GOOGLE_KEY_JSON` value box in hPanel.
4. It must stay valid JSON: it starts with `{` and ends with `}`. Do not add
   line breaks by hand; hPanel stores it as one value.

### Alternative: upload the key file instead

If you prefer not to paste the JSON, upload the key file with File Manager into
the app's root folder as `google-key.json`, and set this variable instead:

| Variable | Value |
|---|---|
| `GOOGLE_KEY_FILE` | `./google-key.json` |

Do NOT set both. `GOOGLE_KEY_JSON` wins if both are set. Never paste the key
in chat, email, or anywhere public. Anyone with it can send as the service
account.

After setting the variables, click **Restart application** in hPanel.

## Step 3: Log in and run the first cycle

1. Open `https://indexora.topseospecialists.com/` and log in with the
   `ADMIN_PASSWORD` you set.
2. The dashboard shows Bamboo with 383 URLs waiting.
3. Go to **Settings** and click **Run full cycle**. This watches the sitemap,
   sends the first 200 URLs to Google (the daily Indexing API limit), sends
   them to IndexNow too, and checks index status. The rest queue for tomorrow.
4. Check **Activity** for what happened. Statuses on the URLs page move from
   waiting to sent to indexed as Google answers.

## Daily running

- The app runs a full cycle on its own every day at 06:00 PKT.
- Quotas are tracked in the app: 200 Indexing API sends per day per project,
  2,000 URL Inspection checks per day per site. Over the limit, URLs wait
  for the next day. Nothing is lost.
- To add a site: Sites page, fill in name, domain, sitemap URL, and its
  IndexNow key (with the `{key}.txt` file already at that site's root).

## Honest limits

Indexora tells Google and Bing that a page exists or changed. It cannot force
Google to index a page; whether a page gets indexed depends on the page
itself. The Indexing API is officially for job posting and livestream pages,
so using it for product and blog pages is off-label, the same grey area the
paid indexers live in.

## If something goes wrong

- Dashboard shows "key not configured": the `GOOGLE_KEY_JSON` value is missing
  or broken. Re-paste the whole JSON file, then restart the app.
- Google sends fail with 403: the service account is not Owner in Search
  Console for that site. Add it under Settings, Users and permissions, as Owner.
- IndexNow sends fail with 403: the `{key}.txt` file is missing or has the
  wrong content at the site root.
- App will not start: check the hPanel build log. It usually means `npm install`
  failed; redeploy the zip.
