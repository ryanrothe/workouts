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
  SL.lastHtml = function (e, spec, where) {
    const flag = spec.isMax ? "" : e.hit === true ? ` · <span class="ex-hit-flag yes">hit</span>` : e.hit === false ? ` · <span class="ex-hit-flag no">short</span>` : "";
    return `<div class="ex-last">Last${where ? ` (${where})` : ""}: <strong>${SL.lastText(e, spec)}</strong>${flag}</div>`;
  };

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
      (hasW ? `<span>lb${spec.bw ? " added" : ""}</span>` : "") + `</div>`;
    const rows = log.sets.map((x, i) => `
      <div class="sl-row${i >= (spec.minSets || spec.sets || 0) && i < (spec.sets || 0) ? " sl-opt" : ""}">
        <span class="sl-n">${i + 1}</span>
        ${hasR ? `<input type="number" class="sl-r" inputmode="numeric" pattern="[0-9]*" min="0" step="1" data-i="${i}" placeholder="${spec.repTop != null ? spec.repTop : "–"}" value="${x.r == null ? "" : x.r}">` : ""}
        ${hasW ? `<input type="number" class="sl-w" inputmode="decimal" min="0" step="0.5" data-i="${i}" placeholder="${spec.bw ? "+lb" : "lb"}" value="${x.w == null ? "" : x.w}">` : ""}
      </div>`).join("");
    const fw = sugg && sugg.weight != null && hasW ? sugg.weight : null;
    let fill = "";
    const req = spec.minSets || spec.sets;   // fill the required sets; an optional extra set is typed
    if (hasR && spec.repTop != null) fill = `= ${req} × ${spec.repTop}${unit === "s" ? " s" : ""}${fw != null ? " @ " + SL.fmtWeight(fw) : ""}`;
    else if (!hasR && fw != null) fill = `= ${req} rounds @ ${SL.fmtWeight(fw)}`;
    return `
    <div class="sl-grid sl-c${cols}">
      ${head}${rows}
      <div class="sl-tools">
        ${fill ? `<button type="button" class="btn sl-fill">${fill}</button>` : ""}
        <button type="button" class="btn sl-clear">Clear</button>
      </div>
    </div>`;
  };
  /* cfg: { spec, sugg, getLog() → the stored, normalized log (created on demand),
            save(), rerender(), onPromote() } */
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
    const clearBtn = root.querySelector(".sl-clear");
    if (clearBtn) clearBtn.onclick = () => { cfg.getLog().sets.forEach(x => { x.r = null; x.w = null; }); cfg.save(); cfg.rerender(); };
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
     SYNC. Local storage stays the source of truth. Every save also PUTs the
     program's state to the workout-sync Worker so Karl can read it; a failed
     post retries on the next save. One device token covers the whole library
     (programs share an origin, so they share localStorage). The first program
     to run adopts Father & Son's existing token, so nothing new is read off
     the phone.
     cfg: { slug, storageKey, payload() → { state, entries, ...extras }, hasData() }
     --------------------------------------------------------------------------- */
  const SYNC_BASE = "https://workout-sync.ryanrothe.workers.dev/v1/";
  const LIB_TOKEN_KEY = "workout_sync_token";
  const OLD_TOKEN_KEYS = ["father_son_v1_sync_token"];
  const TOKEN_RE = /^[a-f0-9]{24}$/;
  const sync = { cfg: null, timer: null, status: { at: null, ok: null, msg: "not yet" } };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
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
  sync.init = function (cfg) {
    sync.cfg = cfg;
    sync.token();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && sync.timer) sync.push(); });
    // Push once on open: the first run of an upgraded program backs up the untouched data.
    if (!cfg.hasData || cfg.hasData()) setTimeout(() => sync.push(), 800);
  };
  sync.schedule = function () { if (!sync.cfg) return; clearTimeout(sync.timer); sync.timer = setTimeout(sync.push, 1500); };
  sync.push = async function () {
    if (!sync.cfg) return;
    clearTimeout(sync.timer); sync.timer = null;
    if (lsGet("workout_sync_off") === "1") { sync.status = { at: Date.now(), ok: null, msg: "off on this device (testing)" }; sync.paint(); return; }
    let payload;
    try {
      payload = Object.assign({ program: sync.cfg.slug, schema: 2, savedAt: new Date().toISOString(), ua: navigator.userAgent }, sync.cfg.payload());
    } catch (e) { sync.status = { at: Date.now(), ok: false, msg: "could not build the payload: " + e.message }; sync.paint(); return; }
    try {
      const r = await fetch(`${SYNC_BASE}${sync.cfg.slug}/${sync.token()}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), keepalive: true });
      sync.status = { at: Date.now(), ok: r.ok, msg: r.ok ? "synced" : `server said ${r.status}` };
    } catch (e) {
      sync.status = { at: Date.now(), ok: false, msg: "offline, will retry on the next save" };
    }
    sync.paint();
  };
  sync.pull = async function (token) {
    const r = await fetch(`${SYNC_BASE}${sync.cfg.slug}/${token}`);
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
    <h3>Sync to Karl</h3>
    <p>Every save also posts this program's data to a private sync endpoint so Karl can read it and coach from it. The phone stays the source of truth; if the post fails it retries on the next save. One device token covers every program in the library.</p>
    <p><strong>Device token:</strong> <code id="sync-token" style="user-select:all;font-size:13px">${sync.token()}</code><br><span id="sync-status" style="font-size:12px;color:var(--muted)">Sync: not yet</span></p>
    <div class="ex-actions" style="margin-top:6px">
      <button class="btn" id="sync-now">↑ Sync now</button>
      <button class="btn" id="sync-restore">↓ Restore from a token</button>
    </div>`;
  };
  /* Call after notesHtml() is in the DOM. */
  sync.wireNotes = function () {
    const now = document.getElementById("sync-now");
    if (now) now.onclick = () => { sync.status = { at: null, ok: null, msg: "sending…" }; sync.paint(); sync.push(); };
    const rest = document.getElementById("sync-restore");
    if (rest) rest.onclick = async () => {
      const t = prompt("Paste the device token from the other phone (24 characters). This REPLACES this program's data on this phone with that phone's.");
      if (!t || !TOKEN_RE.test(t.trim())) { if (t) alert("That is not a 24-character token."); return; }
      try {
        const payload = await sync.pull(t.trim());
        if (!payload.state || !confirm(`Found data saved ${payload.savedAt}. Replace this phone's data with it?`)) return;
        lsSet(LIB_TOKEN_KEY, t.trim());
        lsSet(sync.cfg.storageKey, JSON.stringify(payload.state));
        location.reload();
      } catch (e) { alert("Restore failed: " + e.message); }
    };
    sync.paint();
  };
  SL.sync = sync;

  window.SetLog = SL;
})();
