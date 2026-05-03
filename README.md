# Health Tracker

A simple, Google-Forms-style web app for logging carbs, protein, weight, and fasting blood sugar — designed to be hosted free on **GitHub Pages**.

- One-page form with daily totals
- History view (edit / delete past entries)
- Stats: 7-day & 30-day averages plus weight and fasting BG trend charts
- Backup with CSV / JSON export & import
- All data stays in your browser (`localStorage`) — no account, no backend, no tracking
- Mobile-friendly; works offline once loaded

## Live demo

After deploying (see below) your app will live at:

```
https://<your-github-username>.github.io/<your-repo-name>/
```

## Project files

```
health-tracker-app/
├── index.html      ← the page
├── styles.css      ← styling (Google Forms-inspired)
├── app.js          ← all logic + storage
├── .nojekyll       ← tells GitHub Pages to serve files as-is
└── README.md       ← this file
```

## Deploy to GitHub Pages

### 1 — Create a new GitHub repo

1. Go to https://github.com/new
2. Name it something like `health-tracker` (public is required for free GitHub Pages on a personal account)
3. Skip the README/license toggles — leave the repo empty
4. Click **Create repository**

### 2 — Push these files

If you have **git** installed, in this folder run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

If you don't use git, you can also drag-and-drop the files via the GitHub web UI:

1. Open your new empty repo
2. Click **uploading an existing file**
3. Drag `index.html`, `styles.css`, `app.js`, `.nojekyll`, and `README.md` into the page
4. Click **Commit changes**

### 3 — Turn on GitHub Pages

1. In your repo, go to **Settings → Pages**
2. Under **Source**, pick **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`
4. Click **Save**
5. Wait ~1 minute. The page will refresh and show your URL at the top:
   `https://<your-username>.github.io/<your-repo-name>/`

That's it. Open the URL on your phone and add it to your home screen for an app-like experience.

## Using the app

| Tab | What it does |
|---|---|
| **Add entry** | One card per question. Pick a date, fill what you have, hit **Save entry**. Re-opening today's date will load and let you edit it. |
| **History** | Newest first. Click a row to expand → **Edit** loads it back into the form, **Delete** removes it. |
| **Stats** | Auto-updating averages for the last 7 and 30 days, plus weight and fasting BG trend charts. |
| **Data** | Export to CSV (perfect for pasting into the included Excel tracker) or JSON. Import works from either. |

## Where is my data?

In your browser's `localStorage`, under the key `healthTracker.entries`.

This means:
- Different browsers / devices = different data. Export and re-import to move data.
- Clearing your browser's site data deletes your entries. **Export a backup periodically.**
- Nothing is sent over the network — even GitHub never sees your numbers.

## Want syncing across devices?

That requires a backend. A few easy upgrade paths:
- **Firebase Firestore** (free tier) — swap `localStorage` calls in `app.js` for Firestore reads/writes
- **Supabase** — same idea, Postgres backend
- **iCloud / Google Drive sync** — manually export/import the JSON file

## Customizing

- Change colors by editing the CSS variables at the top of `styles.css` (look for the gradient on `.banner` and the meal stripe colors in `.meal-*::before`)
- Switch units (kg, mmol/L) by editing the labels in `index.html` — values are stored as plain numbers, no conversion is done
- Add a new field by adding it to (1) the form HTML, (2) the `FIELDS` array in `app.js`, and (3) the export headers if you want it in CSV

## License

Personal project — use it however you like.
