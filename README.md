# Exercise Library

One PWA that wraps three workout programs: **Achilles Rebuild**, **Athletic AF**, and **Hotel Workouts** (Madsen upper/lower split).

Launcher at the root picks a program. Each sub-app keeps its own data, its own features, and its own per-program accent color — but they share one design system, one PWA shell, and one home-screen icon.

## Structure

```
exercise-library/
├── index.html              ← Launcher (3 program tiles)
├── manifest.webmanifest    ← PWA manifest — installs as "Exercise Library"
├── sw.js                   ← Shared service worker (offline cache)
├── icon-180.png            ← Dumbbell icon — used by iOS Add to Home Screen
├── icon-192.png            ← Android home-screen icon
├── icon-512.png            ← Larger PWA icon
├── favicon.png             ← Browser-tab favicon (64×64)
├── shared/
│   └── styles.css          ← Design tokens + shared components (appbar, cards, buttons, day card, exercise rows)
├── achilles/
│   └── index.html          ← Achilles Rebuild — 12-week tendon rehab
├── athletic-af/
│   ├── index.html          ← Athletic AF — re-skinned to light theme
│   └── data.json           ← 5-phase + Week 17 program data
└── hotel/
    └── index.html          ← Hotel Workouts — Madsen upper/lower split
```

## What changed vs. the three source repos

- **Unified design system.** All three apps now share `shared/styles.css` for tokens, typography, the back-nav appbar, buttons, cards, and the day/exercise patterns.
- **Per-program accent color** keeps each program's identity:
  - Achilles → coral (`#d94f1c`) — calm, rehab-appropriate
  - Athletic AF → orange (`#f25c2d`) — retained from original
  - Hotel → blue (`#2f6fdc`) — travel/portable feel
- **Athletic AF was re-skinned from dark to light.** Every component (topbar, day chips, set rows, rest timer, modal, plate calc, history) translated to the shared light tokens. All features preserved: PR detection, history view, plate calculator, export/import, rest timer.
- **One PWA, one icon.** A single dumbbell icon used by iOS "Add to Home Screen" — no more generic-letter fallbacks. The shared service worker caches all three sub-apps so they all work offline.
- **Shared appbar with back-nav** on every sub-app so you always have a clear way back to the launcher.

## localStorage continuity

The merge **preserves all logged data**. Each sub-app keeps its original `localStorage` key:

| Sub-app | Key | What it holds |
|---|---|---|
| Achilles | `achilles_program_v1` | Current week, checked exercises, weight/notes logs, self-assess scores |
| Athletic AF | `athleticAF.v1` | Current week + day, per-set logs, full session history, PR records |
| Hotel | `madsen_split_v1` | Sessions per workout (upper/lower) with checks + logs |
| Athletic AF plate calc | `plateBar`, `plateTarget` | Last-used bar weight + target |

If you've been tracking workouts in the original repos, **the data still lives in those browsers** under those keys. To carry it over to the merged repo, either:

1. **Same domain — easiest.** Host the merged repo at the same URL where you ran the originals. Browsers will read the existing localStorage on first load.
2. **Different domain — manual.** In Athletic AF, use the Menu → Export backup (JSON), then Import in the new location. Achilles and Hotel don't have export — copy the JSON manually:
   ```js
   // In Safari devtools on the OLD page:
   copy(localStorage.getItem('achilles_program_v1'));
   // Then on the NEW page:
   localStorage.setItem('achilles_program_v1', `<paste here>`);
   ```

## Deploying to GitHub Pages

1. Create a new repo (public or private — Pages works on both for personal accounts).
2. Push the contents of `exercise-library/` to the **root** of the repo.
3. Repo → Settings → Pages → Source: `main` branch, root → Save.
4. After ~30 seconds, the site is at `https://<your-user>.github.io/<repo-name>/`.
5. Open that URL on your iPhone in Safari → Share → **Add to Home Screen**. The dumbbell icon picks up automatically.

## Adding a fourth program later

1. Make a new folder, e.g. `mobility/`, with its own `index.html`.
2. In `index.html`, link the shared stylesheet:
   ```html
   <link rel="stylesheet" href="../shared/styles.css" />
   ```
   Wire the apple icon + manifest to the umbrella PWA:
   ```html
   <link rel="manifest" href="../manifest.webmanifest" />
   <link rel="apple-touch-icon" href="../icon-180.png" />
   ```
   Add `<body data-program="mobility">` and optionally define an accent color in `shared/styles.css`:
   ```css
   body[data-program="mobility"] { --primary: #5b8c3a; ... }
   ```
3. Drop the shared appbar at the top of the body:
   ```html
   <header class="appbar">
     <div class="appbar-inner">
       <a class="appbar-back" href="../">← Library</a>
       <div class="appbar-title">
         <div class="eyebrow">Program</div>
         <div class="name">Mobility</div>
       </div>
     </div>
     <div class="appbar-accent"></div>
   </header>
   ```
4. Add a 4th tile in the launcher `index.html` following the `.tile.tile-...` pattern.
5. Add the new folder to the `PRECACHE` list in `sw.js`.
6. Bump the `CACHE` version string in `sw.js` so iOS picks up the new files.

## Local development

```bash
cd exercise-library
python3 -m http.server 8000
# Open http://localhost:8000
```

You can't open `index.html` by double-clicking — browsers block `fetch('data.json')` from `file://`, and the service worker won't register. The static server fixes both.

## Customizing program data

- **Athletic AF** is data-driven — edit `athletic-af/data.json` to add weeks, swap exercises, or change rest intervals.
- **Achilles** and **Hotel** are self-contained — exercise lists, phases, and day templates live inline in each `index.html` as JS objects. Edit there and the changes pick up on next load.

## Caveats to know

- **Service worker is sticky.** Once installed, the SW will serve the cached version even after you push new HTML. If something looks stale, in Safari iOS: Settings → Safari → Advanced → Website Data → remove "Exercise Library" — or bump the `CACHE = 'exercise-library-v...'` version string in `sw.js`.
- **iOS PWA storage limits.** Safari currently caps localStorage at ~5 MB per origin and may evict data after long periods of non-use. Use Athletic AF's Export backup occasionally and stash the JSON in iCloud Drive or the repo.
- **No cross-program sync.** Each program's data is isolated by design (different localStorage keys). If you want a "what did I lift across all 3 this week" view later, that needs a fourth layer pulling from all three keys.
