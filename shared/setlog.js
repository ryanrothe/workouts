/* ===========================================================================
   SetLog: the Exercise Library's shared set logging, progression coach and
   sync. Lifted out of the Father & Son tracker (2026-09-23) on 2026-09-24 so
   every program logs the same way.

   Each program keeps its own data, state shape and history walk. This file
   owns the parts that must behave the same everywhere:
     · a log is { sets: [{ r, w }], notes }; r is reps (or seconds on timed
       rows), w is the weight (added weight on bodyweight rows)
     · legacy logs fold in at read time and are never bulk-rewritten:
       { weight, hit } keeps its hit as `legacyHit`, "50 lb DBs" parses to 50
     · a hit is inferred: every required set at or above the target
     · the coach: +inc / hold / plateau on weighted rows, add a rep / hold on
       bodyweight rows, "beat last" on max rows. No history, no suggestion.
     · sync: every save posts the program's state to the workout-sync Worker
       under ONE library-wide device token, so Karl can read every program

   A "spec" describes one row as one lifter sees it:
     { name, sets, minSets, repTop, repRange, isMax,
       unit: "reps" | "s" | "none",   // "none" = weight per round only (complexes)
       loaded, bw, lower,              // loaded: weight column; bw: the weight is ADDED to bodyweight
       hitAt?,                         // reps that count as a hit; default repTop (top of the range)
       goal?, next?, promote? }        // track rows (Father & Son)
   =========================================================================== */
(function () {
  const SL = {};

  /* ---------------------------------------------------------------------------
     NUMBERS
     --------------------------------------------------------------------------- */
  SL.parseWeight = function (x) {
    if (typeof x === "number") return isFinite(x) ? x : null;
    if (typeof x === "string") { const m = x.match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; }
    return null;
  };
  SL.parseInt = function (x) {
    if (typeof x === "number") return isFinite(x) ? Math.round(x) : null;
    if (typeof x === "string") { const m = x.match(/\d+/); return m ? parseInt(m[0], 10) : null; }
    return null;
  };
  SL.fmtWeight = n => (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");
  SL.fmtLoad = (n, bw) => bw ? (n === 0 ? "BW" : `BW +${SL.fmtWeight(n)} lb`) : `${SL.fmtWeight(n)} lb`;
  SL.roundToInc = (n, inc, floor) => Math.max(floor != null ? floor : inc, Math.round(n / inc) * inc);
  SL.bumpRange = function (range, top) {
    if (range) { const m = range.match(/^(\d+)-(\d+)$/); if (m) return `${+m[1] + 2}-${+m[2] + 2}`; }
    return top ? `${top + 2}` : null;
  };
  SL.normName = n => String(n).toLowerCase().replace(/[^a-z0-9]/g, "");

  /* ---------------------------------------------------------------------------
     PRESCRIPTIONS
     parseReps("10-12 / leg") → { repTop: 12, repRange: "10-12", isMax: false, unit: "reps" }
     Parentheticals are stripped FIRST: "6 (1-2 second tempo)" is 6, not 1-2.
     A seconds figure anywhere wins: "40 yards or 45 seconds" is a 45 s hold.
     --------------------------------------------------------------------------- */
  SL.parseReps = function (str) {
    const s = String(str == null ? "" : str).replace(/\([^)]*\)/g, " ").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
    const out = { repTop: null, repRange: null, isMax: false, unit: "reps" };
    if (!s) return out;
    if (/max|amrap|failure/i.test(s)) { out.isMax = true; return out; }
    const sec = s.match(/(\d+)(?:\s*-\s*(\d+))?\s*(?:s|secs?|seconds?)\b/i);
    if (sec) {
      out.unit = "s";
      if (sec[2]) { out.repRange = `${sec[1]}-${sec[2]}`; out.repTop = parseInt(sec[2], 10); }
      else out.repTop = parseInt(sec[1], 10);
      return out;
    }
    const rr = s.match(/^(\d+)\s*-\s*(\d+)(?!\s*-)/);
    if (rr) { out.repRange = `${rr[1]}-${rr[2]}`; out.repTop = parseInt(rr[2], 10); return out; }
    const rf = s.match(/^(\d+)\b(?!\s*[\/:.]\s*\d)/);
    if (rf) out.repTop = parseInt(rf[1], 10);
    return out;
  };
  /* "3" → 3/3 · "3-4" → min 3, max 4 · "6-8 sets · rest 2 min" → 6/8. Unparseable → fallback. */
  SL.parseSets = function (str, fallback) {
    const m = String(str == null ? "" : str).replace(/[–—]/g, "-").match(/^\s*(\d+)(?:\s*-\s*(\d+))?/);
    if (!m) return { sets: fallback || 3, minSets: fallback || 3 };
    const lo = parseInt(m[1], 10), hi = m[2] ? parseInt(m[2], 10) : lo;
    return { sets: hi, minSets: lo };
  };

  /* ---------------------------------------------------------------------------
     LOGS
     --------------------------------------------------------------------------- */
  const LEGACY_KEYS = { weight: 1, hit: 1, sets: 1, notes: 1 };
  /* Any stored shape → { sets: [{ r, w }], notes, ...carried fields }. Never truncates. */
  SL.normLog = function (raw, nSets) {
    const out = { sets: [], notes: "" };
    if (raw && typeof raw === "object") {
      Object.keys(raw).forEach(k => { if (!LEGACY_KEYS[k]) out[k] = raw[k]; });   // step, legacyHit, anything a program adds
      out.notes = typeof raw.notes === "string" ? raw.notes : "";
      if (Array.isArray(raw.sets)) {
        out.sets = raw.sets.map(x => {
          x = x || {};
          const r = x.r != null ? x.r : x.reps;
          const w = x.w != null ? x.w : x.weight;
          const o = { r: r === "" || r == null ? null : SL.parseInt(r), w: w === "" || w == null ? null : SL.parseWeight(w) };
          if (x.d || x.done) o.d = true;
          return o;
        });
      } else if (raw.weight != null && raw.weight !== "") {
        out.sets = [{ r: null, w: SL.parseWeight(raw.weight) }];
        if (out.sets[0].w == null) out.sets = [];
      }
      if (typeof raw.hit === "boolean" && out.legacyHit == null) out.legacyHit = raw.hit;
    }
    while (out.sets.length < (nSets || 0)) out.sets.push({ r: null, w: null });
    return out;
  };
  SL.hasSets = log => !!log && log.sets.some(x => x.r != null || x.w != null);
  SL.hasData = log => !!log && (SL.hasSets(log) || !!(log.notes && log.notes.trim()));
  SL.topWeight = function (sets) { const w = sets.map(x => x.w).filter(x => x != null); return w.length ? Math.max(...w) : null; };
  /* true / false / null (nothing to judge). A legacy { weight, hit } log keeps its hit. */
  SL.hit = function (log, spec) {
    const sets = log.sets;
    const need = spec.minSets || spec.sets || sets.length;
    if (spec.unit === "none") {
      if (!sets.some(x => x.w != null)) return typeof log.legacyHit === "boolean" ? log.legacyHit : null;
      return sets.slice(0, need).every(x => x.w != null);
    }
    if (!sets.some(x => x.r != null)) return typeof log.legacyHit === "boolean" ? log.legacyHit : null;
    if (spec.goal) return spec.goal(sets.map(x => x.r == null ? 0 : x.r));
    const bar = spec.hitAt != null ? spec.hitAt : spec.repTop;
    if (bar == null) return null;
    return sets.slice(0, need).every(x => x.r != null && x.r >= bar);
  };
  SL.fmtSets = function (sets, unit) {
    if (unit === "none") { const n = sets.filter(x => x.w != null).length; return `${n} round${n === 1 ? "" : "s"}`; }
    let end = sets.length;
    while (end > 0 && sets[end - 1].r == null) end--;   // trailing empty sets are not "–"
    if (!end) return "";
    return sets.slice(0, end).map(x => x.r == null ? "–" : x.r).join(", ") + (unit === "s" ? " s" : "");
  };
  /* One history entry, as the coach and the Last: line read it. */
  SL.entry = function (log, spec, meta) {
    return Object.assign({ sets: log.sets, weight: SL.topWeight(log.sets), hit: SL.hit(log, spec), unit: spec.unit || "reps", target: spec.repTop != null ? spec.repTop : null }, meta || {});
  };
  SL.lastText = function (e, spec) {
    const sets = SL.fmtSets(e.sets, e.unit);
    const load = e.weight != null ? SL.fmtLoad(e.weight, spec.bw) : "";
    return sets && load ? `${sets} @ ${load}` : (sets || load);
  };
  /* A newer set of the same exercise logged in a stack (stack.html, Phase 2) wins the Last line. */
  SL.stackNewer = function (name, afterDate) {
    let es = [];
    try { es = JSON.parse(localStorage.getItem("entries.stack") || "[]"); } catch (err) { return null; }
    const k = SL.normName(name); let best = null;
    es.forEach((x) => {
      if (!x || SL.normName(x.exercise) !== k || !x.date || (afterDate && x.date <= afterDate)) return;
      if (!Array.isArray(x.sets) || !x.sets.some((s) => s.r != null || s.w != null)) return;
      if (!best || x.date > best.date) best = x;
    });
    return best;
  };
  SL.lastHtml = function (e, spec, where) {
    const st = spec && spec.name ? SL.stackNewer(spec.name, e && e.date) : null;
    if (st) {
      const sets = st.sets.filter((s) => s.r != null || s.w != null).map((s) => ({ r: s.r, w: s.w }));
      const e2 = { sets, weight: SL.topWeight(sets), unit: (e && e.unit) || spec.unit || "reps" };
      const md = new Date(st.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `<div class="ex-last">Last (stack · ${md}): <strong>${SL.lastText(e2, spec)}</strong></div>`;
    }
    const flag = spec.isMax ? "" : e.hit === true ? ` · <span class="ex-hit-flag yes">hit</span>` : e.hit === false ? ` · <span class="ex-hit-flag no">short</span>` : "";
    return `<div class="ex-last">Last${where ? ` (${where})` : ""}: <strong>${SL.lastText(e, spec)}</strong>${flag}</div>`;
  };

  /* ---------------------------------------------------------------------------
     REST BAR (2026-09-25; channels 2026-10-19). One rest at a time PER CHANNEL. A
     program with one lifter uses the default channel ("page"), so it behaves as
     before: one rest per page. Father & Son passes the lifter as the channel, so
     Porter and Ryan each run their own rest at the same time. A set check starts
     it; the length comes from the row's own rest timer button (data-default "90s" /
     "2:00"), else spec.rest, else 90 s. Survives re-renders: every grid with the
     same key repaints from this state. Ends with a vibration and two short beeps.
     onPaint(fn) lets a page draw its own readout (fn gets the channel map).
     --------------------------------------------------------------------------- */
  SL.rest = (function () {
    const chans = {};
    const listeners = [];
    let timer = null;
    let ctx = null;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    function chan(c) { const k = c || "page"; return chans[k] || (chans[k] = { key: null, end: 0, total: 0, goUntil: 0 }); }
    function unlock() {
      try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); } catch (e) { ctx = null; }
    }
    function beep() {
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
      if (!ctx) return;
      try {
        [0, 0.28].forEach((t) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = 880; g.gain.value = 0.18;
          o.connect(g); g.connect(ctx.destination);
          o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18);
        });
      } catch (e) {}
    }
    function secsFor(root, spec) {
      const row = (root.closest && (root.closest(".hs-row") || root.closest(".exercise"))) || root.parentElement || root;
      const t = row && row.querySelector(".row-timer, .btn-timer");
      const label = t ? (t.dataset.default || t.textContent || "") : "";
      let m = label.match(/(\d+):(\d{2})/);
      if (m) return +m[1] * 60 + +m[2];
      m = label.match(/(\d+)\s*s\b/);
      if (m) return +m[1];
      m = label.match(/(\d+)\s*min/);
      if (m) return +m[1] * 60;
      return spec && spec.rest ? spec.rest : 90;
    }
    const live = (c) => !!(c.key && (c.end || c.goUntil));
    function left(c) { return Math.max(0, Math.ceil((c.end - Date.now()) / 1000)); }
    function paintAll() {
      document.querySelectorAll(".sl-rest").forEach((el) => {
        const grid = el.closest(".sl-grid");
        const k = grid && grid.dataset.slKey;
        const c = k ? Object.values(chans).find((x) => live(x) && x.key === k) : null;
        if (!c) { el.hidden = true; el.classList.remove("go"); return; }
        el.hidden = false;
        const l = left(c);
        const go = l === 0;
        el.classList.toggle("go", go);
        el.querySelector(".sl-rest-t").textContent = go ? "Go" : fmt(l);
        el.querySelector(".sl-rest-l").textContent = go ? "Rest done" : "Rest";
        el.querySelector(".sl-rest-bar i").style.width = `${go ? 100 : Math.min(100, (1 - l / c.total) * 100).toFixed(1)}%`;
      });
      listeners.forEach((fn) => { try { fn(chans); } catch (e) {} });
    }
    function tick() {
      const now = Date.now();
      let any = false;
      Object.values(chans).forEach((c) => {
        if (c.end && now >= c.end) { c.end = 0; c.goUntil = now + 4000; beep(); }
        if (!c.end && c.goUntil && now >= c.goUntil) { c.goUntil = 0; c.key = null; }
        if (live(c)) any = true;
      });
      if (!any && timer) { clearInterval(timer); timer = null; }
      paintAll();
    }
    function start(key, secs, channel) {
      const c = chan(channel);
      c.key = key; c.total = secs; c.end = Date.now() + secs * 1000; c.goUntil = 0;
      if (!timer) timer = setInterval(tick, 250);
      paintAll();
    }
    function stop(channel) {
      (channel === undefined ? Object.values(chans) : [chan(channel)]).forEach((c) => { c.end = 0; c.goUntil = 0; c.key = null; });
      paintAll();
    }
    function onPaint(fn) { listeners.push(fn); }
    return { start, stop, paintAll, secsFor, unlock, chan, left, fmt, onPaint, state: chan("page") };
  })();

  /* ---------------------------------------------------------------------------
     COACH. hist is newest first. opts.inc overrides the 5 upper / 10 lower rule.
       weighted:   hit → +inc · miss → hold, beat the reps · 3 misses at one weight → −10%, +2 reps
                   hit, but today's rep target is higher than last time's → hold the weight
       bodyweight: hit → add a rep (or 5 s) · miss → hold, clean it up
       max rows:   beat last
       opts.bells: loads move in fixed jumps (kettlebells), so the coach names no
                   weight: top of the range → next bell up; stuck 3 times → drop a bell
       track rows: hit → promotion earned
     --------------------------------------------------------------------------- */
  SL.PLATEAU = 3;
  SL.suggest = function (hist, spec, opts) {
    if (!hist || !hist.length) return null;
    const o = opts || {};
    const last = hist[0];
    const unit = spec.unit || "reps";
    if (spec.promote) {
      if (last.hit === true) return { type: "promote", label: spec.next ? `Promotion earned: ${spec.next}` : "Goal met. Top of the track" };
      if (last.hit === false) return { type: "hold", label: `Beat last: ${SL.fmtSets(last.sets, unit)}` };
      return null;
    }
    if (spec.isMax) {
      const s = SL.fmtSets(last.sets, unit);
      if (!s && last.weight == null) return null;
      return { type: "hold", weight: last.weight != null ? last.weight : undefined, label: `Beat last: ${SL.lastText(last, spec)}` };
    }
    if (spec.loaded && last.weight != null && o.bells) {
      const load = SL.fmtLoad(last.weight, spec.bw);
      if (hist.length >= SL.PLATEAU) {
        const win = hist.slice(0, SL.PLATEAU);
        if (win.every(e => e.weight === win[0].weight) && win.every(e => e.hit === false))
          return { type: "plateau", label: `Stuck 3 times at ${load}: drop a bell, rebuild the reps` };
      }
      if (last.hit === true && unit === "reps" && last.target != null && spec.repTop != null && spec.repTop > last.target)
        return { type: "hold", weight: last.weight, label: `Hold ${load}, reps climb to ${spec.repTop}` };
      if (last.hit === true) return { type: "up", label: `Top of the range at ${load}: next bell up` };
      if (last.hit === false) return { type: "hold", weight: last.weight, label: `Hold ${load}, beat your reps` };
      return { type: "hold", weight: last.weight, label: `Last: ${load}` };
    }
    if (spec.loaded && last.weight != null) {
      const inc = o.inc != null ? o.inc : (spec.lower ? 10 : 5);
      const floor = spec.bw ? 0 : undefined;
      if (hist.length >= SL.PLATEAU) {
        const win = hist.slice(0, SL.PLATEAU);
        if (win.every(e => e.weight === win[0].weight) && win.every(e => e.hit === false)) {
          const wt = SL.roundToInc(win[0].weight * 0.9, inc, floor);
          const reps = unit === "reps" ? SL.bumpRange(spec.repRange, spec.repTop) : null;
          return { type: "plateau", weight: wt, reps, label: `Plateau: drop to ${SL.fmtLoad(wt, spec.bw)}${reps ? ` × ${reps}` : ""}` };
        }
      }
      if (last.hit === true && unit === "reps" && last.target != null && spec.repTop != null && spec.repTop > last.target)
        return { type: "hold", weight: last.weight, label: `Hold ${SL.fmtLoad(last.weight, spec.bw)}, reps climb to ${spec.repTop}` };
      if (last.hit === true) return { type: "up", weight: last.weight + inc, label: `Try ${SL.fmtLoad(last.weight + inc, spec.bw)}` };
      if (last.hit === false) return { type: "hold", weight: last.weight, label: `Hold ${SL.fmtLoad(last.weight, spec.bw)}, beat your reps` };
      return { type: "hold", weight: last.weight, label: `Last: ${SL.fmtLoad(last.weight, spec.bw)}` };
    }
    if (spec.repTop == null || unit === "none") return null;
    const step = unit === "s" ? 5 : 1;
    if (last.hit === true) return { type: "up", reps: spec.repTop + step, label: `Add ${unit === "s" ? "5 s" : "a rep"}: ${spec.sets} × ${spec.repTop + step}${unit === "s" ? " s" : ""}` };
    if (last.hit === false) return { type: "hold", label: `Hold ${spec.sets} × ${spec.repTop}${unit === "s" ? " s" : ""}, clean it up` };
    return null;
  };
  SL.suggestHtml = function (sugg) {
    if (!sugg) return "";
    const cls = sugg.type === "promote" ? "up" : sugg.type;
    const tap = sugg.type === "promote" ? "tap to promote" : (sugg.weight != null || sugg.reps != null) ? "tap to fill" : "";
    return `<button class="ex-suggest ${cls}">${sugg.label}${tap ? `<span class="sg-tap">${tap}</span>` : ""}</button>`;
  };

  /* ---------------------------------------------------------------------------
     THE GRID. gridHtml renders; wireGrid binds it. Typing never re-renders
     (that would blur the field mid-entry); the buttons do.
     --------------------------------------------------------------------------- */
  SL.gridHtml = function (log, spec, sugg) {
    const unit = spec.unit || "reps";
    const hasR = unit !== "none";
    const hasW = !!spec.loaded;
    const cols = (hasR ? 1 : 0) + (hasW ? 1 : 0);
    const rLabel = unit === "s" ? "seconds" : "reps";
    const head = `<div class="sl-head"><span>${unit === "none" ? "Round" : "Set"}</span>` +
      (hasR ? `<span>${rLabel}${spec.hitAt != null && spec.repRange ? ` · range ${spec.repRange}` : spec.repTop != null ? ` · target ${spec.repTop}` : ""}</span>` : "") +
      (hasW ? `<span>lb${spec.bw ? " added" : ""}</span>` : "") + `<span></span></div>`;
    // Per-set check (2026-09-25): marks the set done (d: true, already a stored field), fills
    // what's missing and starts the rest bar below the grid.
    const ok = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 8"/></svg>';
    const rows = log.sets.map((x, i) => `
      <div class="sl-row${i >= (spec.minSets || spec.sets || 0) && i < (spec.sets || 0) ? " sl-opt" : ""}${x.d ? " sl-done" : ""}">
        <span class="sl-n">${i + 1}</span>
        ${hasR ? `<input type="number" class="sl-r" inputmode="numeric" pattern="[0-9]*" min="0" step="1" data-i="${i}" placeholder="${spec.repTop != null ? spec.repTop : "–"}" value="${x.r == null ? "" : x.r}">` : ""}
        ${hasW ? `<input type="number" class="sl-w" inputmode="decimal" min="0" step="0.5" data-i="${i}" placeholder="${spec.bw ? "+lb" : "lb"}" value="${x.w == null ? "" : x.w}">` : ""}
        <button type="button" class="sl-ok${x.d ? " on" : ""}" data-i="${i}" aria-pressed="${x.d ? "true" : "false"}" aria-label="Set ${i + 1} done">${ok}</button>
      </div>`).join("");
    const rest = `<div class="sl-rest" hidden role="timer" aria-live="off"><span class="sl-rest-l">Rest</span><b class="sl-rest-t">0:00</b><span class="sl-rest-bar"><i></i></span><button type="button" class="sl-rest-skip">Skip</button></div>`;
    const fw = sugg && sugg.weight != null && hasW ? sugg.weight : null;
    let fill = "";
    const req = spec.minSets || spec.sets;   // fill the required sets; an optional extra set is typed
    if (hasR && spec.repTop != null) fill = `= ${req} × ${spec.repTop}${unit === "s" ? " s" : ""}${fw != null ? " @ " + SL.fmtWeight(fw) : ""}`;
    else if (!hasR && fw != null) fill = `= ${req} rounds @ ${SL.fmtWeight(fw)}`;
    return `
    <div class="sl-grid sl-k sl-c${cols}">
      ${head}${rows}
      ${rest}
      <div class="sl-tools">
        ${fill ? `<button type="button" class="btn sl-fill">${fill}</button>` : ""}
        ${hasW && log.sets.length > 1 ? `<button type="button" class="btn sl-same" title="Copy set 1's weight to every open set">Same lb ↓</button>` : ""}
        <button type="button" class="btn sl-clear">Clear</button>
      </div>
    </div>`;
  };
  /* cfg: { spec, sugg, getLog() → the stored, normalized log (created on demand),
            save(), rerender(), onPromote(),
            restKey?, restChannel? (one rest per channel; default one per page),
            noRest? → true when a set check should not start a rest (the first
            half of a superset: the rest comes after the pair) } */
  SL.wireGrid = function (root, cfg) {
    const spec = cfg.spec, sugg = cfg.sugg;
    const hasW = !!spec.loaded;
    // getLog() may hand back a fresh object each call: fetch it ONCE per handler.
    const first = lg => lg.sets.slice(0, Math.min(spec.sets || lg.sets.length, lg.sets.length));
    const required = lg => lg.sets.slice(0, Math.min(spec.minSets || spec.sets || lg.sets.length, lg.sets.length));
    const fillBtn = root.querySelector(".sl-fill");
    if (fillBtn) fillBtn.onclick = () => {
      const lg = cfg.getLog();
      required(lg).forEach(x => {
        if (spec.unit !== "none" && x.r == null && spec.repTop != null) x.r = spec.repTop;
        if (hasW && x.w == null && sugg && sugg.weight != null) x.w = sugg.weight;
      });
      cfg.save(); cfg.rerender();
    };
    // Rest key: one per exercise row, stable across re-renders (the row's data-key when the
    // page sets one, plus the exercise name), so only the grid you checked shows the bar.
    const rowEl = root.closest && root.closest("[data-key]");
    const restKey = cfg.restKey || `${spec.name || "set"}|${rowEl ? rowEl.dataset.key : ""}`;
    const gridEl = root.querySelector(".sl-grid") || root;
    gridEl.dataset.slKey = restKey;
    root.querySelectorAll(".sl-ok").forEach((b) => (b.onclick = () => {
      const i = parseInt(b.dataset.i, 10), lg = cfg.getLog(), x = lg.sets[i];
      if (!x) return;
      if (x.d) { delete x.d; cfg.save(); cfg.rerender(); SL.rest.paintAll(); return; }
      x.d = true;
      if (spec.unit !== "none" && x.r == null && spec.repTop != null) x.r = spec.repTop;
      if (hasW && x.w == null) {
        const prev = lg.sets.slice(0, i).reverse().find((y) => y.w != null);
        if (prev) x.w = prev.w; else if (sugg && sugg.weight != null) x.w = sugg.weight;
      }
      SL.rest.unlock();
      const secs = SL.rest.secsFor(root, spec);
      cfg.save(); cfg.rerender();
      const skipRest = typeof cfg.noRest === "function" ? cfg.noRest() : !!cfg.noRest;
      if (secs > 0 && !skipRest) SL.rest.start(restKey, secs, cfg.restChannel);
    }));
    // Same weight: copy set 1's weight (else the first set with one) to every set not yet checked.
    const sameBtn = root.querySelector(".sl-same");
    if (sameBtn) sameBtn.onclick = () => {
      const lg = cfg.getLog();
      const src = lg.sets.find((x) => x.w != null);
      if (!src) return;
      lg.sets.forEach((x) => { if (!x.d) x.w = src.w; });
      cfg.save(); cfg.rerender();
    };
    const clearBtn = root.querySelector(".sl-clear");
    if (clearBtn) clearBtn.onclick = () => { cfg.getLog().sets.forEach(x => { x.r = null; x.w = null; delete x.d; }); cfg.save(); cfg.rerender(); };
    const skip = root.querySelector(".sl-rest-skip");
    if (skip) skip.onclick = () => SL.rest.stop(cfg.restChannel);
    SL.rest.paintAll();
    root.querySelectorAll(".sl-r").forEach(inp => inp.addEventListener("input", e => {
      const i = parseInt(e.target.dataset.i, 10), raw = e.target.value.trim();
      cfg.getLog().sets[i].r = raw === "" ? null : parseInt(raw, 10); cfg.save();
    }));
    root.querySelectorAll(".sl-w").forEach(inp => inp.addEventListener("input", e => {
      const i = parseInt(e.target.dataset.i, 10), raw = e.target.value.trim();
      cfg.getLog().sets[i].w = raw === "" ? null : parseFloat(raw); cfg.save();
    }));
    const chip = root.querySelector(".ex-suggest");
    if (chip && sugg) chip.onclick = () => {
      if (sugg.type === "promote") { if (cfg.onPromote) cfg.onPromote(); return; }
      if (sugg.weight == null && sugg.reps == null) return;
      const lg = cfg.getLog();
      // Only sets not yet done (no reps logged) take the suggestion.
      first(lg).forEach(x => {
        if (spec.unit !== "none" && x.r != null) return;
        if (hasW && sugg.weight != null) x.w = sugg.weight;
        if (sugg.reps != null && spec.unit !== "none") x.r = parseInt(String(sugg.reps).split("-").pop(), 10);
      });
      cfg.save(); cfg.rerender();
      if (cfg.openLog) cfg.openLog();
    };
  };

  /* ---------------------------------------------------------------------------
     MERGE (2026-10-19). Three-way JSON merge: base is the copy both devices last
     agreed on (what the server held at the last pull or push). A field changed on
     one side only takes that side; a field changed on both takes `prefer` ("local"
     or "remote", whichever was edited last). Objects merge key by key, equal-length
     arrays index by index, so Porter's sets on the iPad and Ryan's on the iPhone,
     or two different sets of one lifter, both survive. A key deleted on one side
     and untouched on the other is deleted. Pure: returns a new object.
     --------------------------------------------------------------------------- */
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  SL.canon = function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (isObj(v)) return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  };
  const same = (x, y) => SL.canon(x) === SL.canon(y);
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  SL.merge3 = function merge3(base, a, b, prefer) {
    if (base === null) base = undefined;
    if (same(a, b)) return clone(a);
    if (base !== undefined && same(a, base)) return clone(b);
    if (base !== undefined && same(b, base)) return clone(a);
    if (isObj(a) && isObj(b)) {
      const out = {};
      new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => {
        const bk = isObj(base) ? base[k] : undefined;
        const inA = a[k] !== undefined, inB = b[k] !== undefined;
        if (inA && inB) out[k] = merge3(bk, a[k], b[k], prefer);
        else if (inA) { if (!(bk !== undefined && same(a[k], bk))) out[k] = clone(a[k]); }   // b deleted it and a didn't touch it: gone
        else if (inB) { if (!(bk !== undefined && same(b[k], bk))) out[k] = clone(b[k]); }
      });
      return out;
    }
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      const bb = Array.isArray(base) && base.length === a.length ? base : null;
      return a.map((x, i) => merge3(bb ? bb[i] : undefined, x, b[i], prefer));
    }
    return clone(prefer === "local" ? a : b);
  };

  /* ---------------------------------------------------------------------------
     SYNC. Two-way since 2026-10-19, so an iPad and an iPhone on one token share
     one log. Every save PUTs the program's state to the workout-sync Worker (Karl
     reads it there too). Opening a program, and coming back to it, pulls the
     server copy and merges it in (SL.merge3) before you touch anything; the merged
     result goes back up if it differs. A PUT names the revision it was built on
     (x-base-rev); if another device wrote since, the Worker answers 409 with its
     copy, and this device merges and posts again. Local storage still holds a
     full copy, so a phone offline in the garage loses nothing: the next pull
     merges it. One device token covers the whole library (programs share an
     origin, so they share localStorage). The first program to run adopts Father &
     Son's existing token. Pair a second device once with "Pair with another
     device" (Notes) or Library → Restore everything.
     cfg: { slug, storageKey, payload() → { state, entries, ...extras }, hasData(),
            apply?(mergedState) → redraw in place; without it the page reloads }
     --------------------------------------------------------------------------- */
  const SYNC_BASE = "https://workout-sync.ryanrothe.workers.dev/v1/";
  const LIB_TOKEN_KEY = "workout_sync_token";
  const OLD_TOKEN_KEYS = ["father_son_v1_sync_token"];
  const TOKEN_RE = /^[a-f0-9]{24}$/;
  const sync = { cfg: null, timer: null, busy: false, status: { at: null, ok: null, msg: "not yet" } };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  const K = {
    base: () => sync.cfg.storageKey + "_sync_base",     // the server copy last agreed on
    rev: () => sync.cfg.storageKey + "_sync_rev",       // its revision number
    edited: () => sync.cfg.storageKey + "_edited_at"    // when this device last saved an edit
  };
  const off = () => lsGet("workout_sync_off") === "1";
  sync.token = function () {
    let t = lsGet(LIB_TOKEN_KEY);
    if (t && TOKEN_RE.test(t)) return t;
    const olds = (sync.cfg ? [sync.cfg.storageKey + "_sync_token"] : []).concat(OLD_TOKEN_KEYS);
    for (const k of olds) { const o = lsGet(k); if (o && TOKEN_RE.test(o)) { t = o; break; } }
    if (!t || !TOKEN_RE.test(t)) {
      const bytes = new Uint8Array(12);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      t = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    }
    lsSet(LIB_TOKEN_KEY, t);
    return t;
  };
  const url = () => `${SYNC_BASE}${sync.cfg.slug}/${sync.token()}`;
  sync.init = function (cfg) {
    sync.cfg = cfg;
    sync.token();
    // A save waits 1.5 s before posting. Leaving the page inside that window (tapping
    // "← Library" right after typing) must still post it: flush on hide AND on pagehide,
    // which is the event an in-app navigation fires (found 2026-09-24: an edit never synced).
    const flush = () => { if (sync.timer) sync.push(true); };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
      else sync.refresh();                                   // back from the other device: pull first
    });
    window.addEventListener("pagehide", flush);
    window.addEventListener("pageshow", (e) => { if (e.persisted) sync.refresh(); });
    // Open: pull and merge, which posts whatever this device has that the server lacks (the
    // first run of an upgraded program still backs up its untouched data this way). Held in
    // sync.timer so leaving within the 0.3 s still posts through flush().
    clearTimeout(sync.timer); sync.timer = setTimeout(sync.refresh, 300);
    // While a page that can redraw in place stays open, look for the other device's sets each minute.
    if (cfg.apply) setInterval(() => { if (document.visibilityState === "visible") sync.refresh(); }, 60000);
  };
  sync.schedule = function () {
    if (!sync.cfg) return;
    lsSet(K.edited(), String(Date.now()));
    clearTimeout(sync.timer); sync.timer = setTimeout(sync.push, 1500);
  };
  function buildPayload() {
    const payload = Object.assign({ program: sync.cfg.slug, schema: 2, savedAt: new Date().toISOString(), ua: navigator.userAgent }, sync.cfg.payload());
    // Each program's own push carries its Today summary (shared/shell.js), so Cloudflare has
    // it even when the Library page hasn't been opened since.
    const sm = window.HS && window.HS.readSummary ? window.HS.readSummary(sync.cfg.slug) : null;
    if (sm && !payload.summary) payload.summary = sm;
    // Keep the flat entries on the phone too, so Gaps and Progress (Today, Phase 2) can read every
    // program's logged sets offline. Written before the off switch, so it works in the preview.
    if (Array.isArray(payload.entries)) lsSet("entries." + sync.cfg.slug, JSON.stringify(payload.entries));
    return payload;
  }
  sync.push = async function (unloading, attempt) {
    if (!sync.cfg) return;
    clearTimeout(sync.timer); sync.timer = null;
    let payload;
    try { payload = buildPayload(); }
    catch (e) { sync.status = { at: Date.now(), ok: false, msg: "could not build the payload: " + e.message }; sync.paint(); return; }
    if (off()) { sync.status = { at: Date.now(), ok: null, msg: "off on this device (testing)" }; sync.paint(); return; }
    try {
      const body = JSON.stringify(payload);
      // keepalive lets a post outlive the page, but browsers refuse keepalive bodies over
      // 64 KB outright. Use it only for the unload flush, and only while the body fits.
      const keepalive = !!unloading && body.length < 60000;
      const headers = { "content-type": "application/json" };
      const rev = lsGet(K.rev());
      if (rev) headers["x-base-rev"] = rev;
      const r = await fetch(url(), { method: "PUT", headers, body, keepalive });
      if (r.status === 409 && !unloading && (attempt || 0) < 3) {
        // Another device wrote since our copy: merge theirs in, then post again.
        const cur = await r.json();
        await sync.absorb(cur.current || cur, (attempt || 0) + 1);
        return;
      }
      let j = null;
      try { j = await r.json(); } catch (e) {}
      if (r.ok) {
        if (j && j.rev != null) lsSet(K.rev(), String(j.rev));
        lsSet(K.base(), JSON.stringify(payload.state));
      }
      sync.status = { at: Date.now(), ok: r.ok, msg: r.ok ? "synced" : r.status === 409 ? "the other device saved at the same moment, will merge on the next save" : `server said ${r.status}` };
    } catch (e) {
      sync.status = { at: Date.now(), ok: false, msg: "offline, will retry on the next save" };
    }
    sync.paint();
  };
  /* The token changed: every program's agreed copy and revision belong to the old token. */
  sync.forgetHistory = function () {
    const ks = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/_sync_(base|rev)$/.test(k)) ks.push(k); } } catch (e) {}
    ks.forEach(lsDel);
  };
  /* Pull the server copy and merge it in. Quiet on failure: local data is untouched. */
  sync.refresh = async function () {
    if (!sync.cfg || sync.busy) return;
    if (sync.timer) { clearTimeout(sync.timer); sync.timer = null; }   // the pull decides whether to post
    if (off()) { sync.status = { at: Date.now(), ok: null, msg: "off on this device (testing)" }; sync.paint(); return; }
    sync.busy = true;
    try {
      const r = await fetch(url(), { cache: "no-store" });
      if (r.status === 404) { if (!sync.cfg.hasData || sync.cfg.hasData()) await sync.push(); return; }
      if (!r.ok) { sync.status = { at: Date.now(), ok: false, msg: `server said ${r.status}` }; sync.paint(); return; }
      await sync.absorb(await r.json(), 0);
    } catch (e) {
      sync.status = { at: Date.now(), ok: false, msg: "offline, will retry on the next save" }; sync.paint();
    } finally { sync.busy = false; }
  };
  /* Merge a server document into this device, redraw if anything changed, post if the server lacks something. */
  sync.absorb = async function (remote, attempt) {
    const key = sync.cfg.storageKey;
    if (!remote || !remote.state) { await sync.push(false, attempt); return; }
    const local = sync.cfg.payload().state;
    let base = null;
    try { base = JSON.parse(lsGet(K.base()) || "null"); } catch (e) {}
    // First two-way run on a device that has only ever pushed: the server copy is this device's
    // own older save, so it is the common ancestor (else a set unchecked since would come back).
    if (base == null && remote.ua && remote.ua === navigator.userAgent) base = remote.state;
    const editedAt = parseInt(lsGet(K.edited()) || "0", 10) || 0;
    const remoteAt = Date.parse(remote.savedAt || "") || 0;
    const merged = SL.merge3(base, local, remote.state, editedAt > remoteAt ? "local" : "remote");
    if (remote.rev != null) lsSet(K.rev(), String(remote.rev));
    lsSet(K.base(), JSON.stringify(remote.state));
    const changedHere = !same(merged, local);
    if (changedHere) {
      lsSet(key, JSON.stringify(merged));
      if (sync.cfg.apply) { try { sync.cfg.apply(merged); } catch (e) {} }
      else {
        // No in-place redraw: reload once. A second reload inside 15 s means something keeps
        // changing the state on load, so stop and say so instead of looping.
        const last = parseInt(sessionStorage.getItem("sync_reload_at") || "0", 10);
        if (Date.now() - last > 15000) { try { sessionStorage.setItem("sync_reload_at", String(Date.now())); } catch (e) {} location.reload(); return; }
        sync.status = { at: Date.now(), ok: null, msg: "merged the other device's changes; reopen to see them" }; sync.paint();
      }
    }
    if (!same(merged, remote.state)) await sync.push(false, attempt);
    else { sync.status = { at: Date.now(), ok: true, msg: changedHere ? "merged from the other device" : "up to date" }; sync.paint(); }
  };
  sync.pull = async function (token) {
    const r = await fetch(`${SYNC_BASE}${sync.cfg.slug}/${token}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status === 404 ? "no data for that token" : `server said ${r.status}`);
    return r.json();
  };
  sync.paint = function () {
    const el = document.getElementById("sync-status");
    if (!el) return;
    const s = sync.status;
    const when = s.at ? new Date(s.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    el.textContent = s.ok === null ? "Sync: " + s.msg : `Sync: ${s.msg}${when ? " · " + when : ""}`;
    el.style.color = s.ok === false ? "var(--danger)" : "var(--muted)";
  };
  sync.notesHtml = function () {
    return `
    <h3>Sync</h3>
    <p>Every save posts this program's data to a private sync endpoint, where Karl reads it. Opening the program, or coming back to it, pulls the latest copy and merges it in, so an iPad and an iPhone paired to one token keep one log. Each device keeps a full copy, so nothing is lost offline.</p>
    <p><strong>Device token:</strong> <code id="sync-token" style="user-select:all;font-size:13px">${sync.token()}</code><br><span id="sync-status" style="font-size:12px;color:var(--muted)">Sync: not yet</span></p>
    <div class="ex-actions" style="margin-top:6px">
      <button class="btn" id="sync-now">↻ Sync now</button>
      <button class="btn" id="sync-restore">⇄ Pair with another device</button>
    </div>
    <p style="font-size:12px;color:var(--muted)">Pairing: on the new device, tap Pair and paste the token shown on the device you already use. Both then share every program's log. Nothing is replaced: the two copies merge.</p>`;
  };
  /* Call after notesHtml() is in the DOM. */
  sync.wireNotes = function () {
    const now = document.getElementById("sync-now");
    if (now) now.onclick = () => { sync.status = { at: null, ok: null, msg: "syncing…" }; sync.paint(); sync.refresh(); };
    const rest = document.getElementById("sync-restore");
    if (rest) rest.onclick = async () => {
      const t = prompt("Paste the device token from the device you already use (24 characters). This device then shares its log; the two copies merge.");
      if (!t || !TOKEN_RE.test(t.trim())) { if (t) alert("That is not a 24-character token."); return; }
      try {
        const payload = await sync.pull(t.trim());
        if (!payload.state || !confirm(`Found data saved ${payload.savedAt}. Pair this device and merge the two logs?`)) return;
        lsSet(LIB_TOKEN_KEY, t.trim());
        sync.forgetHistory();                      // a new pairing has no common history yet, in any program
        await sync.absorb(payload, 0);
        sync.paint();
      } catch (e) { alert("Pairing failed: " + e.message); }
    };
    sync.paint();
  };
  SL.sync = sync;

  window.SetLog = SL;
})();
