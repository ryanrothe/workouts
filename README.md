# Exercise Library

One PWA that wraps twelve workout programs: **Father & Son Strength**, **The Functional Method 1.0**, **The Functional Method 2.0**, **Hyrox Home Engine**, **Achilles Rebuild**, **Athletic AF**, **Hotel Workouts** (Madsen upper/lower split), **KB Shred**, **6-Day PPL**, **Full Body Aesthetics**, **Dumbbells Only**, and **Full Body (3 Day Split)**.

Launcher at the root picks a program. Each sub-app keeps its own data, its own features, and its own per-program accent color — but they share one design system, one PWA shell, and one home-screen icon.

## Programs

| Program | Length | Cadence | Focus |
|---|---|---|---|
| **Father & Son Strength** | 12 weeks | 2×/week | Ryan and his 13-year-old son, cross-country and club soccer in season. Mon upper (meet day), Wed lower. Two lifters on one tracker with a Son / Ryan toggle; per-set integer logging with inferred hits and a coach on every row; pull-up step and push-up level tracks; readiness check and short-Monday mode; finisher menus with PRs; Day 1 / W4 / W8 / W12 benchmarks with L/R symmetry. Timers, session clock. Pushes its state to the `workout-sync` Worker so Karl can read it (Notes tab shows the device token). |
| **The Functional Method 1.0** | 8 weeks | 4×/week + 2 mobility | JTM Fit (John Madsen) functional strength — Mon full body, Tue upper, Thu KB/DB complexes, Fri legs, Wed/Sat mobility circuits. Week-phased with per-exercise weight logging, cross-week "Last:" recall by exercise name, automatic load progression (hit the top of the range → +5/+10 lb), rest/interval/accumulate timers, a session pacing clock, and a **60-minute mode** that re-plans each day to fit an hour. |
| **The Functional Method 2.0** | 8 weeks | 6×/week | JTM Fit sequel — heavy top sets (3-5×5), ladders and AMRAP finishers, KB complexes, mobility circuits. Same tracker engine as 1.0: progression coach, timers, session clock, 60-minute mode. |
| **Hyrox Home Engine** | 12 weeks | 4×/week | Hyrox-style conditioning on a home gym. Low-impact cardio (no programmed running), creative sled substitutes, a travel/hotel mode that swaps every exercise inline, and a Benchmarks tab that charts engine tests across the test weeks. |
| **Achilles Rebuild** | 12 weeks | 3×/week | Tendon-specific post-rupture rehab — isometrics, HSR, plyo progression, self-assessment. |
| **Athletic AF** | 5 phases + Wk 17 | — | Strength + conditioning. Per-set logging, PR detection, plate calculator, history, export/import. |
| **Hotel Workouts** | Upper / Lower | — | Madsen split. DB + bodyweight, travel-ready. |
| **KB Shred** | 8 weeks | 4×/week | Adam Gooch kettlebell program. Full-body daily with supersets and conditioning circuits. |
| **6-Day PPL** | Open-ended (3-month block) | 6×/week | Jason Helmes / Anyman Fitness push-pull-legs split. Six dated session logs, per-exercise rest timers, an Up Next stat that rotates the cycle, and **automatic load progression** — log a weight plus whether you hit the rep range, and the next session suggests +5 lb, a hold, or a plateau deload (−10% / +2 reps). |
| **Full Body Aesthetics** | rolling 4-week cycles | 4 lifts + 2 optional conditioning | Chalk Performance Training (Ryan Fischer). Rebuilt 2026-10-24 on the current Chalk cycles, read from the Chalk web portal by `automation/exercise-library/fba_ingest.py`: rep-max main lift, one accessory per body part, a scored closer, conditioning days with a clock and a meters score. On SetLog (`fba_v2`), carry-forward across cycles, coach, rest bar. |
| **Dumbbells Only** | 12 weeks, 56 sessions | A/B alternating, 4 to 5 per week | Chalk (Ryan Fischer) dumbbell-only builder, added 2026-10-24 from the Chalk portal via `automation/exercise-library/chalk_plan_ingest.py`. Session-based (no dates): three 4-week blocks, 4010 tempo → supersets → tri-sets as lettered groups with one rest bar, two dumbbell swaps. On SetLog (`dbo_v1`) and the cockpit. Travel-flagged. |
| **Full Body (3 Day Split)** | 8 weeks, 24 sessions | Day 1 / 2 / 3 | Chalk (Ryan Fischer) gym program (barbell, cable, machine), added 2026-10-24 the same way. Session-based, two blocks (build, then near max effort), straight sets. On SetLog (`fb3_v1`) and the cockpit. Same page code as Dumbbells Only. |
| **Nutrition** (tracker, not a program) | open-ended | daily | Macros against a bodyweight-derived cut target (Mifflin-St Jeor, 1 g/lb protein, 0.3 g/lb fat, carbs the remainder; or set by hand), a closed meal library logged by weighed grams, off-plan quick adds, weigh-ins with a 7-day average, and a Sunday planner that turns the week's meals into a batch-cook list and a grocery list. Pushes `days` to the `workout-sync` Worker; `pull.py nutrition`. Added 2026-09-25. |

## Structure

```
exercise-library/
├── index.html              ← Launcher (10 program tiles; Father & Son first, then TFM 1.0/2.0)
├── manifest.webmanifest    ← PWA manifest — installs as "Exercise Library"
├── sw.js                   ← Shared service worker (offline cache)
├── icon-180.png            ← Dumbbell icon — used by iOS Add to Home Screen
├── icon-192.png            ← Android home-screen icon
├── icon-512.png            ← Larger PWA icon
├── favicon.png             ← Browser-tab favicon (64×64)
├── shared/
│   ├── styles.css          ← Design tokens + shared components (appbar, cards, buttons, day card, exercise rows, set grid)
│   ├── setlog.js           ← Shared set logging, progression coach and sync (window.SetLog)
│   └── cockpit.js          ← Shared iPad board: lane + rail with clock, timeline, rest ring, tracker (window.Cockpit)
├── father-son/
│   └── index.html          ← Father & Son Strength — 12-week two-lifter program (self-contained)
├── tfm-1/
│   └── index.html          ← The Functional Method 1.0 — 8-week JTM Fit program (self-contained)
├── tfm-2/
│   └── index.html          ← The Functional Method 2.0 — 8-week JTM Fit sequel (self-contained)
├── hyrox/
│   └── index.html          ← Hyrox Home Engine — 12-week build, travel mode + benchmark charts (self-contained)
├── achilles/
│   └── index.html          ← Achilles Rebuild — 12-week tendon rehab
├── athletic-af/
│   ├── index.html          ← Athletic AF — re-skinned to light theme
│   └── data.json           ← 5-phase + Week 17 program data
├── hotel/
│   └── index.html          ← Hotel Workouts — Madsen upper/lower split
├── kb-shred/
│   ├── index.html          ← KB Shred — 8-week kettlebell program
│   └── data.json           ← Program data
├── ppl/
│   └── index.html          ← 6-Day PPL — push/pull/legs split (self-contained)
└── full-body-aesthetics/
    ├── index.html          ← Full Body Aesthetics — Chalk 4-week cycles, data-driven (schema 2)
    └── data.json           ← Program data
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

## Set logging, the coach and sync (`shared/setlog.js`)

Since 2026-09-24 seven programs log the same way: Father & Son, TFM 1.0 and 2.0, 6-Day PPL, Athletic AF, KB Shred and Hotel; Full Body Aesthetics joined on 2026-10-24. Hyrox and Achilles do not load it.

- **Every set is integers.** A log is `{ sets: [{ r, w }], notes }`: `r` is reps (seconds on timed rows), `w` the weight (added weight on bodyweight rows: blank = untracked, 0 = strict bodyweight). An `= 3 × 8` button fills the targets; type over what differed.
- **A hit is inferred**, never tapped: every required set at or above the target (PPL counts anywhere inside the range; the rest need the top). The old ✓ Hit / ✗ Missed toggles are gone.
- **The Last line** shows every set from the previous time that exercise appeared ("8, 8, 7 @ 185 lb · short"); **the coach chip** says what to do next: +5 lb (10 on lower-body lifts in TFM, Father & Son and Athletic AF; PPL and Hotel stay at 5), hold and beat the reps, a plateau cut after 3 short sessions at one weight, "add a rep" on bodyweight rows, "beat last" on max rows, hold the weight when this week's rep target climbs, and "next bell up" in KB Shred (bells move in fixed jumps).
- **Old logs are folded in at read time, never bulk-rewritten.** `{ weight, hit }` becomes one set at that weight and keeps its hit; free-text loads ("50 lb DBs") parse to the first number and the text moves into Notes the first time that log is edited.
- **Athletic AF and KB Shred keep their per-set check**, because checking a set is what starts the rest timer (and, in Athletic AF, what records it to history). They gained the fill button, the Last line and sync; KB Shred also gained a reps column and the coach.
- **Sync.** Every save PUTs `{ program, schema: 2, savedAt, state, entries }` to the `workout-sync` Worker under ONE library-wide device token (`workout_sync_token`, adopted from Father & Son's token on first run). `entries` is a flat list, one row per logged exercise, which is what Karl reads. Each program shows the token and a Sync now / Restore from a token pair on its Notes or About panel. On a test device, `localStorage.workout_sync_off = "1"` turns posting off.

## The iPad cockpit (`shared/cockpit.js`)

Built for Full Body Aesthetics on 2026-10-24 (design register: `full-body-aesthetics/DESIGN-BRIEF-2026-10-24.md`, "iPad layout register") and rolled to the other six single-lifter SetLog programs the same day: PPL, TFM 1.0, TFM 2.0, Hotel, KB Shred, Athletic AF. Father & Son keeps its own two-lifter lanes board; Hyrox, Achilles and nutrition are untouched.

- **Breakpoint.** At `(min-width: 740px) and (min-height: 600px)` a session renders as a board: the page's own phone content in a scrolling lane on the left, a 330 px rail on the right. Below that nothing in the module runs, so phones are unchanged.
- **Rail, top to bottom.** A dark clock card (session clock, ahead/behind against the plan, a planned-time timeline with one segment per row and a playhead at elapsed; tap a segment to jump), a rest ring (the page's rest drawn as a ring; at zero it focuses the next undone set's reps field), and the workout tracker (every row, one dot per prescribed set, the last-time line, a scored closer pinned at the bottom). iPad portrait folds the rail into a band across the top with a More drawer.
- **The timeline learns.** SetLog stamps `t` (ms) on a set when it is checked; KB Shred and Athletic AF stamp their own checks. Once an exercise has three or more timed sessions, its segment uses the median of logged durations (a row's time = the gap from the previous row's last check to its own); otherwise the page's static sets × rest model. The segment's tooltip says which.
- **Adapter, not a fork.** Each page fills in one adapter (`Cockpit.init({...})`: slots in order with planned seconds, the current row, set states, the rest key per row, the clock, how to draw the lane, how to jump) and calls `Cockpit.render(day, container)` while `Cockpit.active()`. State, payloads and the phone layout stay the page's. The full contract is in the header of `cockpit.js`.
- **Per-program notes.** PPL and Hotel label segments by muscle-group tag; TFM by block tag, with a mobility circuit day as one segment; KB Shred and Athletic AF treat a superset as one row (all its sets as dots), drive the ring from their own rest timers, and keep their bottom rest bar as well. The prominent last-time block and the "Last ·" line on Up next rows show on the board only (FBA shows them on the phone too).

## localStorage continuity

The merge **preserves all logged data**. Each sub-app keeps its original `localStorage` key:

| Sub-app | Key | What it holds |
|---|---|---|
| Father & Son Strength | `father_son_v1` (+ legacy `father_son_v1_sync_token`) | Active lifter; per week/day: date, session clock, readiness, short-Monday flag, warm-up checks, and per lifter: checks, set logs `{ sets: [{ r, w }], notes, step? }`, finisher pick/result; per lifter: pull-up step, push-up level, benchmark table |
| The Functional Method 1.0 | `tfm1_v1` | 60-min-mode flag; per week/day: date, session clock, checks (warm-up/main/cool-down), set logs (legacy `{ weight, hit }` still read) |
| The Functional Method 2.0 | `tfm2_v1` | Same shape as TFM 1.0 |
| Hyrox | `hyrox_home_v1` | Current week, travel-mode flag, checked exercises, per-exercise logs, benchmark + simulation times |
| Achilles | `achilles_program_v1` | Current week, checked exercises, weight/notes logs, self-assess scores |
| Athletic AF | `athleticAF.v1` | Current week + day, per-set logs, full session history, PR records |
| Hotel | `madsen_split_v1` | Sessions per workout (upper/lower) with checks + set logs (legacy free-text weights still read) |
| 6-Day PPL | `ppl_v1` | Sessions per workout (6 keys: pushA/pullA/legsA/pushB/pullB/legsB) with checks, subs, set logs (legacy `{ weight, hit }` still read) |
| KB Shred | `kb_shred_v1` | Per week/day: date, done flag, per exercise `r{i}` reps, `w{i}` weight, `s{i}` checked, notes |
| Nutrition | `nutrition_v1` | Profile and target settings (auto or manual), weigh-ins by date, food table (per-100 g or per-unit macros, source, yield, pack size), meal library, per-day log entries with macros frozen at log time, weekly plans (lunch/dinner/salad per day, prep and bought checks) |
| Sync (all programs) | `workout_sync_token` | The one device token every program posts under |
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

## Adding another program later

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
   For set logging, load the shared module before the program's own script and follow any of the seven programs that use it (`tfm-1/` for phased, `ppl/` for open-ended):
   ```html
   <script src="../shared/setlog.js"></script>
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

- **Service worker.** HTML, JS, CSS and JSON are network-first and revalidate with the server (`cache: 'no-cache'`), and the precache bypasses the HTTP cache, so a deploy lands on the next online open. Images and the manifest are cache-first. Still bump `CACHE = 'exercise-library-v...'` in `sw.js` on every deploy so the offline copy refreshes. If something still looks stale: Settings → Safari → Advanced → Website Data → remove "Exercise Library".
- **iOS PWA storage limits.** Safari currently caps localStorage at ~5 MB per origin and may evict data after long periods of non-use. Use Athletic AF's Export backup occasionally and stash the JSON in iCloud Drive or the repo.
- **Programs don't read each other's history.** Each program's data stays under its own key, and the Last line only looks inside its own program. The cross-program view is the sync: every program posts to the same Worker under one token, and Karl reads them together.
