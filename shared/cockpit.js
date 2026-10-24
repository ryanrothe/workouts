/* ===========================================================================
   Cockpit: the Exercise Library's shared iPad board. Built for Full Body
   Aesthetics on 2026-10-24 (design register: full-body-aesthetics/
   DESIGN-BRIEF-2026-10-24.md, "iPad layout register"), lifted here the same
   day so the other single-lifter SetLog programs draw the same board.

   At (min-width: 740px) and (min-height: 600px) a session renders as a board:
   the lane on the left is the page as the phone draws it, in its own scroller;
   the rail on the right stacks the dark session-clock card with the planned-time
   timeline and playhead, the rest ring (SetLog's rest drawn as a ring; at zero
   it arms the next undone set's reps field) and the workout tracker (one dot per
   prescribed set, the closer's score to beat pinned at the bottom). Portrait
   folds the rail into a band across the top with a More drawer. Below the
   breakpoint nothing here runs: the phone layout is the page's own.

   Rendering only. State, payloads and the phone layout belong to the page. The
   page fills in an ADAPTER and calls Cockpit.render(day, container) instead of
   its own day renderer while Cockpit.active():

     Cockpit.init({
       id(day)            → string; the day's container is #container-<id>
       kind(day)          → "strength" | "conditioning"
       eyebrow(day)       → "Week 2 · Monday · 10/24" (the rail's top line)
       title(day)         → the session title in the clock card
       slots(day)         → [{ idx, name, label, slotName, secs, closer, beat }], in order.
                            idx: the row index the page uses; label: short (timeline, strip);
                            slotName: long (tracker line); secs: planned seconds from the
                            page's own static model; beat: the closer's "beat 185 lb" text
       warmupSecs(day)?   → seconds of warm-up before the first slot (0 or missing: no segment)
       condSecs(day)?     → a conditioning day's fixed length in seconds, else null
       nowIndex(day)      → the row the Now card shows, or -1
       setStates(day, idx)→ ["done" | "part" | ""] per prescribed set
       lastText(day, idx) → the one-line last-time reference ("last wk · 12, 12, 12 @ 104 lb"), or ""
       restKey(day, idx)  → the rest key SetLog uses for that row ("<name>|<data-key>"), or an array of
                            keys when a row holds several exercises (a superset)
       clock(day)         → { start, stop } in ms (either null), or null
       toggleClock(day)   → start → stop → reset, saved by the page
       isComplete(day)    → the day is done
       renderLane(day, laneEl, railEl) → draw the phone content into laneEl (a conditioning
                            page may put its clock card into railEl instead of the tracker)
       jump(day, target)  → target is a row idx or "wu": select it and re-render the day; null = re-render only
       sessions()?        → [{ start, rows: [{ name, t: [ms, ...] }] }], every logged session in
                            row order, each set's check timestamp (SetLog stamps `t`). The
                            timeline learns a slot's minutes from the median of three or more.
       rest()?            → { key, end, total, goUntil }: a page with its own rest timer hands
                            the ring its state; default is SetLog.rest's page channel
       stopRest()?        → a tap on the ring; default SetLog.rest.stop()
       armSet(day, idx, setNo)? → focus that set's input; default finds the SetLog grid by rest key
       topbar?            → selector of the sticky top bar the board sits under (default ".appbar"); a page with
                            a second sticky bar names both ("header.appbar, .kbs-topbar") and their heights add up
       rowEl(laneEl, idx)? → the lane element of a row; default .hs-row[data-idx], else the nth .hs-row
       onModeChange()     → the breakpoint flipped: re-render the open day
     })

   Also exported: active(), scrollIntoView(containerOrId), revealNow(el) (true when the
   element lives in a lane and was scrolled there), lastBlock(ctx, text, flag) and
   lastSeed(k, v) (the prominent last-time block), learnedSecs(name).
   =========================================================================== */
(function () {
  const SL = window.SetLog;
  const MQ = "(min-width: 740px) and (min-height: 600px)";
  const mq = window.matchMedia(MQ);
  const CK = {};
  let A = null;
  const laneScroll = {};     // id → the lane's scrollTop, kept across re-renders
  let jumpIdx = null;        // set by a timeline / tracker tap: the next render scrolls the lane there
  let moreOpen = false;      // portrait: the tracker drawer
  let ringArmed = null;      // the rest key whose zero already armed a set
  const clocks = {};         // id → the rail clock's interval
  let learnedCache = { at: 0, map: null };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtClock = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), sec = s % 60; return `${m}:${String(sec).padStart(2, "0")}`; };
  const fmtMins = secs => `${Math.round(secs / 60)} min`;
  const idOf = day => "container-" + A.id(day);
  const barH = () => { let h = 0; document.querySelectorAll((A && A.topbar) || ".appbar").forEach(b => { h += b.getBoundingClientRect().height; }); return h || 60; };

  CK.active = () => mq.matches;
  CK.init = function (adapter) {
    A = adapter;
    document.body.classList.toggle("ck-wide", mq.matches);
  };

  /* ---------------------------------------------------------------------------
     LEARNED DURATIONS. A row's time in a session is the gap from the previous
     row's last set check (else the session clock's start) to its own last set
     check; a first row with no clock extrapolates from its own checks. Three or
     more samples for an exercise name give the median; the timeline prefers it
     over the page's static sets × rest model. Cached for two seconds because a
     week render asks for every day.
     --------------------------------------------------------------------------- */
  function learned() {
    if (!A || !A.sessions) return {};
    if (learnedCache.map && Date.now() - learnedCache.at < 2000) return learnedCache.map;
    const samples = {};
    let sessions = [];
    try { sessions = A.sessions() || []; } catch (e) { sessions = []; }
    sessions.forEach(s => {
      let prev = s.start || null;
      (s.rows || []).forEach(r => {
        const ts = (r.t || []).filter(x => typeof x === "number" && x > 0).sort((a, b) => a - b);
        if (!ts.length) return;
        const last = ts[ts.length - 1];
        let d = null;
        if (prev != null && last > prev) d = (last - prev) / 1000;
        else if (ts.length >= 2) d = ((last - ts[0]) / 1000) * ts.length / (ts.length - 1);
        if (d != null && d >= 30 && d <= 45 * 60) { const k = SL.normName(r.name); (samples[k] = samples[k] || []).push(d); }
        prev = last;
      });
    });
    const map = {};
    Object.keys(samples).forEach(k => {
      const a = samples[k].sort((x, y) => x - y);
      if (a.length < 3) return;
      const mid = Math.floor(a.length / 2);
      map[k] = { secs: a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2, n: a.length };
    });
    learnedCache = { at: Date.now(), map };
    return map;
  }
  CK.learnedSecs = function (name) { const l = learned()[SL.normName(name)]; return l ? Math.round(l.secs) : null; };

  /* The plan the rail draws: segments in order with seconds, each row's offset, the total. */
  function plan(day) {
    const L = learned();
    const segs = [], offsets = [];
    let at = 0;
    const wu = A.warmupSecs ? (A.warmupSecs(day) || 0) : 0;
    if (wu > 0) { segs.push({ kind: "wu", label: "WU", name: "Warm-up", secs: wu }); at = wu; }
    if (A.kind(day) === "strength") {
      A.slots(day).forEach(s => {
        const l = L[SL.normName(s.name)];
        const secs = l ? Math.round(l.secs) : s.secs;
        offsets[s.idx] = at;
        segs.push({ kind: "ex", idx: s.idx, label: s.label || s.name, name: s.name, secs, learned: l ? l.n : 0 });
        at += secs;
      });
      return { segs, offsets, total: at };
    }
    const d = A.condSecs ? A.condSecs(day) : null;
    const t = A.title(day) || "Work";
    segs.push({ kind: "cond", label: t, name: t, secs: d || 20 * 60 });
    return { segs, offsets, total: d ? at + d : null };
  }
  function finished(day, idx) { const st = A.setStates(day, idx); return st.length > 0 && st.every(s => s === "done"); }
  const dotsHtml = states => `<span class="ck-dots">${states.map(s => `<i class="ck-dot ${s}"></i>`).join("")}</span>`;

  /* Ahead or behind: elapsed against the planned offset of the first unfinished row, plus the share of its sets done. */
  function paceText(day, elapsed, c, P) {
    if (A.isComplete(day)) return `done in ${fmtClock(elapsed)}`;
    if (c.stop) return "clock stopped";
    if (P.total == null) return "";
    const target = `planned ${fmtMins(P.total)}`;
    if (A.kind(day) !== "strength") return `${Math.round(elapsed / 60)} of ${fmtMins(P.total)} in`;
    const ex = P.segs.filter(s => s.kind === "ex");
    const next = ex.find(s => !finished(day, s.idx));
    if (!next) return target;
    const st = A.setStates(day, next.idx);
    const frac = st.length ? st.filter(s => s === "done").length / st.length : 0;
    if (next === ex[0] && frac === 0) return target;
    const delta = Math.round((P.offsets[next.idx] + frac * next.secs - elapsed) / 60);
    return `${delta >= 1 ? `${delta} min ahead` : delta <= -1 ? `${-delta} min behind` : "on pace"} · ${target}`;
  }

  /* ---------------------------------------------------------------------------
     BOARD
     --------------------------------------------------------------------------- */
  function setTop() { document.documentElement.style.setProperty("--ck-top", `${barH()}px`); }
  CK.scrollIntoView = function (x) {
    if (!mq.matches) return;
    const el = typeof x === "string" ? document.getElementById(x) : x;
    if (!el || !el.offsetParent || !el.classList.contains("ck-wide-board")) return;
    setTop();
    const top = el.getBoundingClientRect().top + window.scrollY - barH();
    window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    fitLabels(el);
  };
  /* The Now card into view inside its lane. True when the element lives in a lane (the page then skips its window scroll). */
  CK.revealNow = function (el) {
    const sc = el && el.closest && el.closest(".ck-lane-scroll");
    if (!sc) return false;
    const y = el.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    if (y < 0 || y > sc.clientHeight * 0.6) sc.scrollTo({ top: Math.max(0, sc.scrollTop + y - 6), behavior: "smooth" });
    return true;
  };

  CK.render = function (day, container) {
    const id = A.id(day);
    const was = container.querySelector(".ck-lane-scroll");
    if (was) laneScroll[id] = was.scrollTop;
    container.innerHTML = "";
    container.className = "ck-board ck-wide-board";
    setTop();
    const kind = A.kind(day);
    const cols = document.createElement("div"); cols.className = "ck-cols";
    const lane = document.createElement("section"); lane.className = "ck-lane";
    const sc = document.createElement("div"); sc.className = "ck-lane-scroll";
    lane.appendChild(sc);
    const rail = document.createElement("aside");
    rail.className = "ck-rail" + (moreOpen ? " more-open" : "") + (kind !== "strength" ? " ck-cond" : "");
    const main = document.createElement("div"); main.className = "ck-rail-main";
    const more = document.createElement("div"); more.className = "ck-rail-more";
    rail.appendChild(main); rail.appendChild(more);
    cols.appendChild(lane); cols.appendChild(rail);
    container.appendChild(cols);

    const P = plan(day);
    main.appendChild(clockCard(day, P));
    A.renderLane(day, sc, main);
    if (kind === "strength") {
      main.appendChild(restCard(day));
      main.appendChild(tracker(day));
      main.appendChild(strip(day));
      if (moreOpen) more.appendChild(tracker(day));
    }
    wireRailClock(day, main, P);

    // Scroll: a timeline or tracker tap wins, else where the lane was.
    const prev = laneScroll[id];
    if (prev != null) sc.scrollTop = prev;
    if (jumpIdx != null) {
      const target = jumpIdx === "wu" ? sc.querySelector(".prep") : rowEl(sc, jumpIdx);
      if (target) sc.scrollTop = Math.max(0, target.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 6);
      jumpIdx = null;
    }
    laneScroll[id] = sc.scrollTop;
    fitLabels(container);
    paintRestRing();
  };
  function rowEl(lane, idx) {
    if (A.rowEl) return A.rowEl(lane, idx);
    return lane.querySelector(`.hs-row[data-idx="${idx}"]`) || lane.querySelectorAll(".hs-row")[idx] || null;
  }
  function jumpTo(day, target) {
    jumpIdx = target;
    A.jump(day, target);
  }

  /* The dark clock card: session clock, planned total and pace, the timeline (one segment per slot, sized by
     planned minutes, playhead at elapsed, tap to jump). */
  function clockCard(day, P) {
    const el = document.createElement("div");
    el.className = "ck-clock-card";
    el.innerHTML = `
      <button type="button" class="ck-rail-top" aria-label="Show the week and tabs">${esc(A.eyebrow(day))} ↑</button>
      <div class="ck-clock-title">${esc(A.title(day))}</div>
      <button type="button" class="ck-rail-clock" data-ck="rail"><span class="hs-clock-t">Start</span></button>
      <span class="ck-rail-pace"></span>
      <div class="ck-tl" role="group" aria-label="Planned session timeline">
        ${P.segs.map(s => `<button type="button" class="ck-seg${s.kind === "wu" ? " wu" : ""}${P.total && s.secs / P.total < 0.14 ? " tight" : ""}" data-seg="${s.kind === "ex" ? s.idx : s.kind}" data-label="${esc(s.label)}" style="flex-grow:${s.secs}" title="${esc(s.name)} · ${Math.round(s.secs / 60)} min${s.learned ? ` · from ${s.learned} logged sessions` : ""}"><b>${esc(s.label)}</b>${s.kind === "wu" ? "" : `<span>${Math.round(s.secs / 60)} min</span>`}</button>`).join("")}
        <i class="ck-head" hidden></i>
      </div>
      <div class="ck-axis"><span>0:00</span><span class="ck-axis-mid"></span><span>${P.total != null ? fmtClock(P.total) : "open"}</span></div>`;
    el.querySelector(".ck-rail-top").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    el.querySelectorAll(".ck-seg").forEach(b => b.onclick = () => {
      const seg = b.dataset.seg;
      if (seg === "wu") return jumpTo(day, "wu");
      const i = parseInt(seg, 10);
      if (!isNaN(i)) jumpTo(day, i);
    });
    return el;
  }
  /* A segment label that does not fit its width shortens until it does (the playhead no longer hides it:
     labels paint above the head). Runs only once the board is laid out; a hidden pane fits on its tab click. */
  function fitLabels(root) {
    root.querySelectorAll(".ck-seg").forEach(btn => {
      const b = btn.querySelector("b");
      if (!b || !btn.clientWidth) return;
      const full = btn.dataset.label || b.textContent;
      b.textContent = full;
      if (b.scrollWidth <= b.clientWidth) return;
      for (const n of [4, 3, 2, 1]) { b.textContent = full.slice(0, n); if (b.scrollWidth <= b.clientWidth) return; }
    });
  }
  function paintTimeline(day, P, elapsed) {
    const root = document.getElementById(idOf(day));
    const tl = root && root.querySelector(".ck-tl");
    if (!tl) return;
    const head = tl.querySelector(".ck-head");
    if (elapsed == null || P.total == null) head.hidden = true;
    else { head.hidden = false; head.style.left = `${Math.min(100, 100 * elapsed / P.total).toFixed(2)}%`; }
    const mid = root.querySelector(".ck-axis-mid");
    if (mid) mid.textContent = elapsed == null ? "" : `${fmtClock(elapsed)} now`;
    if (A.kind(day) !== "strength") return;
    const nowIdx = A.nowIndex(day);
    tl.querySelectorAll(".ck-seg[data-seg]").forEach(b => {
      const i = parseInt(b.dataset.seg, 10);
      if (isNaN(i)) return;
      b.classList.toggle("done", finished(day, i));
      b.classList.toggle("now", i === nowIdx);
    });
  }
  /* The rail clock paints from the page's clock state every second and toggles it through the adapter. */
  function wireRailClock(day, root, P) {
    const btn = root.querySelector(".ck-rail-clock"), stat = root.querySelector(".ck-rail-pace");
    if (!btn) return;
    const txt = btn.querySelector(".hs-clock-t");
    const id = A.id(day);
    function paint() {
      if (!btn.isConnected) { if (clocks[id]) { clearInterval(clocks[id]); delete clocks[id]; } return; }
      const c = A.clock(day) || {};
      if (!c.start) {
        txt.textContent = "Start"; btn.classList.remove("running", "stopped");
        btn.setAttribute("aria-label", "Start the session clock");
        if (stat) stat.textContent = P.total != null ? `planned ${fmtMins(P.total)} · tap the clock to start` : "";
        paintTimeline(day, P, null);
        return;
      }
      const elapsed = Math.round(((c.stop || Date.now()) - c.start) / 1000);
      txt.textContent = fmtClock(elapsed);
      btn.classList.toggle("running", !c.stop);
      btn.classList.toggle("stopped", !!c.stop);
      btn.setAttribute("aria-label", c.stop ? `Session clock stopped at ${fmtClock(elapsed)}, tap to reset` : `Session clock ${fmtClock(elapsed)}, tap to stop`);
      if (stat) stat.textContent = paceText(day, elapsed, c, P);
      paintTimeline(day, P, elapsed);
    }
    function sync() {
      if (clocks[id]) { clearInterval(clocks[id]); delete clocks[id]; }
      const c = A.clock(day) || {};
      if (c.start && !c.stop) clocks[id] = setInterval(paint, 1000);
    }
    btn.onclick = () => { A.toggleClock(day); sync(); paint(); };
    sync(); paint();
  }

  /* ---------------------------------------------------------------------------
     REST RING. The page's rest (SetLog's by default) drawn as a ring. At zero it focuses the next
     undone set's reps input in the resting row's grid and does nothing else; the timer beeps.
     --------------------------------------------------------------------------- */
  function restCard(day) {
    const el = document.createElement("button");
    el.type = "button"; el.className = "ck-rest-card"; el._ckDay = day;
    el.setAttribute("aria-label", "Rest: tap to skip");
    const C = (2 * Math.PI * 26).toFixed(1);
    el.innerHTML = `
      <svg class="ck-ring" viewBox="0 0 60 60" aria-hidden="true"><circle class="bg" cx="30" cy="30" r="26" fill="none" stroke-width="6"/><circle class="fg" cx="30" cy="30" r="26" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 30 30)"/></svg>
      <span class="ck-rc-body"><span class="ck-rc-k">Rest</span><span class="ck-rc-t">Ready</span><span class="ck-rc-n"></span></span>`;
    el.onclick = () => { if (A.stopRest) A.stopRest(); else SL.rest.stop(); };
    return el;
  }
  /* The resting row and its next undone set, from the rest key. */
  function restTarget(day, key) {
    if (!key || A.kind(day) !== "strength") return null;
    const hits = A.slots(day).filter(x => { const k = A.restKey(day, x.idx); return Array.isArray(k) ? k.includes(key) : k === key; });
    if (!hits.length) return null;
    // A key that names several rows (Athletic AF runs one lift twice under two protocols, keyed by name):
    // the Now row wins, else the first row with a set still open, else the first.
    const nowIdx = A.nowIndex(day);
    const open = s => A.setStates(day, s.idx).some(x => x !== "done");
    const s = hits.find(x => x.idx === nowIdx && open(x)) || hits.find(open) || hits[0];
    const st = A.setStates(day, s.idx);
    const n = st.findIndex(x => x !== "done");
    return { idx: s.idx, name: s.name, set: n >= 0 ? n + 1 : null };
  }
  function armSet(day, key, info) {
    if (A.armSet) return A.armSet(day, info.idx, info.set);
    const root = document.getElementById(idOf(day));
    const grid = root && root.querySelector(`.sl-grid[data-sl-key="${CSS.escape(key)}"]`);
    const row = grid && grid.querySelectorAll(".sl-row")[info.set - 1];
    const inp = row && (row.querySelector(".sl-r") || row.querySelector(".sl-w"));
    if (inp) inp.focus();
  }
  function restChan() { const c = A && A.rest ? A.rest() : null; return c || SL.rest.chan(); }
  function paintRestRing() {
    if (!A) return;
    document.querySelectorAll(".ck-rest-card").forEach(el => {
      const day = el._ckDay;
      if (!day) return;
      const c = restChan();
      const fg = el.querySelector(".fg"), t = el.querySelector(".ck-rc-t"), n = el.querySelector(".ck-rc-n");
      const C = parseFloat(fg.getAttribute("stroke-dasharray"));
      const resting = !!(c.key && c.end);
      const go = !resting && !!c.key && !!c.goUntil;
      el.classList.toggle("resting", resting);
      el.classList.toggle("go", go);
      const info = restTarget(day, c.key);
      if (resting) {
        ringArmed = null;
        const left = Math.max(0, Math.ceil((c.end - Date.now()) / 1000));
        t.textContent = SL.rest.fmt(left);
        fg.setAttribute("stroke-dashoffset", (C * (1 - left / c.total)).toFixed(1));
        n.textContent = info ? (info.set != null ? `set ${info.set} arms at zero · ${info.name}` : `${info.name} · all sets checked`) : "tap to skip";
      } else if (go) {
        t.textContent = "Go";
        fg.setAttribute("stroke-dashoffset", "0");
        n.textContent = info && info.set != null ? `set ${info.set} · ${info.name}` : "Rest done";
        if (info && info.set != null && ringArmed !== c.key) { ringArmed = c.key; armSet(day, c.key, info); }   // only the card of the day the rest belongs to arms
      } else {
        ringArmed = null;
        t.textContent = "Ready";
        fg.setAttribute("stroke-dashoffset", C.toFixed(1));
        const i = A.nowIndex(day);
        const s = i >= 0 ? A.slots(day).find(x => x.idx === i) : null;
        n.textContent = s ? (s.rest ? `${fmtClock(s.rest)} after each set · ${s.name}` : s.name) : "";
      }
    });
  }
  CK.paintRest = paintRestRing;
  if (SL && SL.rest) SL.rest.onPaint(paintRestRing);

  /* ---------------------------------------------------------------------------
     WORKOUT TRACKER: every slot in order, a dot per prescribed set, the last-time line, the closer
     pinned at the bottom with its score to beat. Tap a row to bring it into the lane.
     --------------------------------------------------------------------------- */
  function tracker(day) {
    const nowIdx = A.nowIndex(day);
    const slots = A.slots(day);
    let totalSets = 0, doneSets = 0, fin = 0;
    const items = slots.map(s => {
      const st = A.setStates(day, s.idx);
      totalSets += st.length; doneSets += st.filter(x => x === "done").length;
      const f = st.length > 0 && st.every(x => x === "done");
      if (f) fin++;
      const lt = A.lastText(day, s.idx) || "";
      return `<button type="button" class="ck-trow${s.idx === nowIdx ? " now" : ""}${f ? " done" : ""}${s.closer ? " ck-trow-closer" : ""}" data-idx="${s.idx}">
        <span class="n">${esc(s.name)}</span>${s.beat ? `<span class="ck-beat">${esc(s.beat)}</span>` : dotsHtml(st)}
        <span class="l">${esc(s.slotName || "")}${s.closer ? ` · ${dotsHtml(st)}` : ""}${lt ? `${s.slotName || s.closer ? " · " : ""}<b>${esc(lt)}</b>` : ""}</span>
      </button>`;
    });
    const el = document.createElement("div");
    el.className = "ck-track";
    el.innerHTML = `<div class="ck-track-head"><span class="ck-rc-k">Workout</span><span>${fin} of ${slots.length} · ${doneSets} of ${totalSets} sets</span></div><div class="ck-track-rows">${items.join("")}</div>`;
    el.querySelectorAll(".ck-trow").forEach(b => b.onclick = () => jumpTo(day, parseInt(b.dataset.idx, 10)));
    return el;
  }
  /* Portrait: the tracker as a strip of segments with a More drawer. Hidden in landscape by CSS. */
  function strip(day) {
    const nowIdx = A.nowIndex(day);
    const el = document.createElement("div");
    el.className = "ck-strip";
    el.innerHTML = A.slots(day).map(s => {
      const st = A.setStates(day, s.idx);
      const f = st.length > 0 && st.every(x => x === "done");
      return `<button type="button" class="ck-sseg${s.idx === nowIdx ? " now" : ""}${f ? " done" : ""}" data-idx="${s.idx}" title="${esc(s.name)}"><b>${esc(s.closer ? "Closer" : s.label || s.name)}</b>${dotsHtml(st)}</button>`;
    }).join("") + `<button type="button" class="ck-more-btn">${moreOpen ? "Hide" : "More"}</button>`;
    el.querySelectorAll(".ck-sseg").forEach(b => b.onclick = () => jumpTo(day, parseInt(b.dataset.idx, 10)));
    el.querySelector(".ck-more-btn").onclick = () => { moreOpen = !moreOpen; A.jump(day, null); };
    return el;
  }

  /* ---------------------------------------------------------------------------
     LAST-TIME BLOCK: the prominent reference in the Now card (every layout on FBA; board only elsewhere).
     --------------------------------------------------------------------------- */
  CK.lastBlock = (ctx, text, flagHtml) => `<div class="ck-last"><span class="k">Last time · ${esc(ctx)}</span><span class="v">${esc(text)}${flagHtml || ""}</span></div>`;
  CK.lastSeed = (k, v) => `<div class="ck-last seed"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;
  /* The block for a SetLog history entry: a newer stack set still wins through SL.lastHtml, as everywhere in the library. */
  CK.lastHtml = function (e, spec, ctx) {
    if (spec && spec.name && SL.stackNewer(spec.name, e && e.date)) return SL.lastHtml(e, spec, "");
    const flag = spec.isMax ? "" : e.hit === true ? ` <span class="ex-hit-flag yes">hit</span>` : e.hit === false ? ` <span class="ex-hit-flag no">short</span>` : "";
    return CK.lastBlock(ctx, SL.lastText(e, spec), flag);
  };
  /* When a logged date was, against today: "last week · Oct 17" (within 7 days), else "Oct 3". short: "last wk" / "Oct 3". */
  CK.when = function (iso, short) {
    if (!iso) return "";
    const md = new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const diff = Math.round((Date.now() - Date.parse(iso + "T12:00:00")) / 864e5);
    if (diff >= 0 && diff <= 7) return short ? "last wk" : `last week · ${md}`;
    return md;
  };

  mq.addEventListener("change", () => {
    document.body.classList.toggle("ck-wide", mq.matches);
    if (A && A.onModeChange) A.onModeChange();
  });
  window.addEventListener("resize", () => { if (mq.matches) { setTop(); document.querySelectorAll(".ck-board").forEach(fitLabels); } });

  window.Cockpit = CK;
})();
