/* Gaps engine (Phase 2, 2026-09-25). Reads, never writes.
   Inputs: shared/catalog.json (every program's sessions, tagged by pattern), each program's logged
   entries on this phone (localStorage "entries.<slug>", written by SetLog on save), summaries
   (shared/shell.js), and Library settings (library_v1: roles, focus, watch, target overrides).
   Rules (ratified 2026-09-25): only Ryan's sets count; sets with the kids count at the load logged,
   split out as "with Porter" / "with her"; the week is Mon..Sun; a focus pattern adds 2 sets
   (15 min for engine and mobility) to both ends of its range; never suggest a pattern the day
   before a family session that hits it.
   Requires shared/patterns.js; optional window.SetLog (parseSets). */
(function () {
  "use strict";
  const P = window.Patterns;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const readJSON = (k, d) => { try { const v = JSON.parse(lsGet(k) || "null"); return v == null ? d : v; } catch (e) { return d; } };
  const pad = (n) => String(n).padStart(2, "0");
  const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
  const mondayOf = (s) => { const d = parseD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dstr(d); };
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SET_KEYS = P.PATTERNS.filter((p) => p.unit === "sets").map((p) => p.key);
  const MIN_KEYS = P.PATTERNS.filter((p) => p.unit === "min").map((p) => p.key);
  const MIN_PER_SET = 5;   // engine/mobility minutes that count as one "set" when ranking

  let CATALOG = null, INDEX = null;
  async function loadCatalog(base) {
    if (CATALOG) return CATALOG;
    try { const r = await fetch((base || "") + "shared/catalog.json", { cache: "no-cache" }); CATALOG = await r.json(); }
    catch (e) { CATALOG = { programs: {} }; }
    INDEX = null;
    return CATALOG;
  }
  /* name key -> { p: patterns, sets, min, kind } from the first catalog row that has patterns */
  function index() {
    if (INDEX) return INDEX;
    INDEX = {};
    Object.values((CATALOG && CATALOG.programs) || {}).forEach((prog) => (prog.sessions || []).forEach((s) => (s.x || []).forEach((x) => {
      const k = P.key(x.n);
      if (!INDEX[k] || (!INDEX[k].p && x.p)) INDEX[k] = { p: x.p || [], sets: x.sets || null, min: x.min || null, kind: x.k };
    })));
    return INDEX;
  }
  function patternsOf(name, kind) { const hit = index()[P.key(name)]; return hit && hit.p && hit.p.length ? hit.p : P.tag(name, kind || "strength"); }
  function perSetMinutes(name) { const hit = index()[P.key(name)]; return hit && hit.min && hit.sets ? hit.min / hit.sets : 1.5; }

  /* ------------------------------------------------------------ targets */
  function targets(lib) {
    const focus = new Set((lib && lib.focus) || []);
    const over = (lib && lib.targets) || {};
    const out = {};
    P.PATTERNS.forEach((p) => {
      const bump = focus.has(p.key) ? (p.unit === "min" ? 15 : 2) : 0;
      const o = over[p.key] || {};
      out[p.key] = { key: p.key, label: p.label, unit: p.unit, lo: (o.lo != null ? o.lo : p.lo) + bump, hi: (o.hi != null ? o.hi : p.hi) + bump, focus: focus.has(p.key) };
    });
    return out;
  }

  /* ------------------------------------------------------------ coverage */
  function hardSets(e) {
    if (e.lifter && String(e.lifter).toLowerCase() !== "ryan") return 0;       // Porter's sets are his, not Ryan's
    const sets = e.sets;
    if (Array.isArray(sets)) {
      const withReps = sets.filter((s) => s && (s.r != null || s.d)).length;   // d: the per-set check
      if (withReps) return withReps;
      const done = sets.filter((s) => s && s.done).length;
      if (done) return done;
      if (e.hit === true || e.done === true) {                                // legacy "weight + hit" logs: the prescription was done
        if (sets.length) return sets.length;
        const hit = index()[P.key(e.exercise)];
        if (hit && hit.sets) return hit.sets;
        const ps = window.SetLog && e.rx ? SetLog.parseSets(String(e.rx), 3) : null;
        return ps && ps.sets ? ps.sets : 3;
      }
      return sets.filter((s) => s && s.w != null).length;
    }
    if (e.done === true || e.hit === true) {                                    // prescription string (Achilles, Hyrox)
      const m = String(sets || e.rx || "").match(/(\d+)\s*[x×]/);
      return m ? +m[1] : 1;
    }
    return 0;
  }
  function whoFor(slug, roles) {
    if (slug === "father-son") return "porter";
    const prog = (window.PROGRAMS || []).find((p) => p.slug === slug);
    if (prog && prog.family && roles && roles[slug] === "family") return "her";
    return "solo";
  }
  /* Coverage for the week containing `date`: { byPattern: { key: { solo, porter, her, total } }, entries: n, days: Set } */
  function coverage(date, lib) {
    const mon = mondayOf(date), sun = addDays(mon, 6);
    const roles = (lib && lib.roles) || {};
    const by = {};
    P.PATTERNS.forEach((p) => { by[p.key] = { solo: 0, porter: 0, her: 0, total: 0 }; });
    const days = new Set();
    let n = 0;
    const slugs = (window.PROGRAMS || []).filter((p) => !p.placeholder).map((p) => p.slug).concat(["stack"]);
    slugs.forEach((slug) => {
      const entries = readJSON("entries." + slug, []);
      const who = whoFor(slug, roles);
      entries.forEach((e) => {
        if (!e || !e.date || e.date < mon || e.date > sun) return;
        const sets = hardSets(e);
        if (!sets) return;
        n++; days.add(e.date);
        const pats = patternsOf(e.exercise, e.kind);
        pats.forEach((pk) => {
          if (!by[pk]) return;
          const amt = MIN_KEYS.includes(pk) ? sets * perSetMinutes(e.exercise) : sets;
          by[pk][who] += amt; by[pk].total += amt;
        });
      });
    });
    return { mon, sun, byPattern: by, entries: n, days };
  }

  /* Gaps: short patterns, biggest shortfall first (focus weighs 1.5×). */
  function gaps(cov, tg) {
    return P.PATTERNS.map((p) => {
      const t = tg[p.key], have = cov.byPattern[p.key].total;
      const short = Math.max(0, t.lo - have);
      const weight = (t.unit === "min" ? short / MIN_PER_SET : short) * (t.focus ? 1.5 : 1);
      return { key: p.key, label: p.label, unit: p.unit, have: Math.round(have), lo: t.lo, hi: t.hi, short: Math.round(short), weight, focus: t.focus };
    }).filter((g) => g.short > 0).sort((a, b) => b.weight - a.weight);
  }

  /* ------------------------------------------------------------ recovery guard */
  /* Patterns a family session hits tomorrow (from its summary's next session in the catalog). */
  function tomorrowFamilyPatterns(date, lib) {
    const tomorrow = addDays(date, 1), dow = DOW[parseD(tomorrow).getDay()];
    const out = new Set();
    (window.PROGRAMS || []).filter((p) => p.family && !p.placeholder && lib && lib.roles && lib.roles[p.slug] === "family").forEach((p) => {
      const sm = window.HS ? HS.readSummary(p.slug) : null;
      if (!sm || !sm.days || sm.days.indexOf(dow) < 0) return;
      const sess = findSession(p.slug, sm.next && sm.next.date === tomorrow ? sm.next.id : null);
      if (!sess) return;
      sess.x.forEach((x) => (x.p || []).forEach((q) => { if (SET_KEYS.includes(q)) out.add(q); }));
    });
    // A family lower day loads squat, hinge and single leg together; guard all three.
    if (["squat", "hinge", "single"].some((q) => out.has(q))) ["squat", "hinge", "single"].forEach((q) => out.add(q));
    return out;
  }
  function findSession(slug, id) {
    const prog = CATALOG && CATALOG.programs[slug];
    if (!prog || !id) return null;
    return prog.sessions.find((s) => s.id === id) || null;
  }

  /* ------------------------------------------------------------ suggestions */
  function sessionLoad(s) {
    const load = {};
    s.x.forEach((x) => {
      if (!x.p || ["warmup", "cooldown", "note", "test"].includes(x.k)) return;
      x.p.forEach((q) => {
        if (SET_KEYS.includes(q)) load[q] = (load[q] || 0) + (x.sets || 1);
        if (MIN_KEYS.includes(q)) load[q] = (load[q] || 0) + (x.min || (x.sets || 1) * 1.5);
      });
    });
    return load;
  }
  function scoreLoad(load, gapList) {
    let score = 0; const fills = [];
    gapList.forEach((g) => {
      const got = load[g.key] || 0; if (!got) return;
      const useful = Math.min(got, g.short);
      const pts = (g.unit === "min" ? useful / MIN_PER_SET : useful) * (g.focus ? 1.5 : 1);
      if (pts > 0) { score += pts; fills.push({ key: g.key, label: g.label, amount: Math.round(useful), unit: g.unit, pts, g }); }
    });
    fills.sort((a, b) => b.pts - a.pts);
    return { score, fills };
  }
  function reasonFor(fills) {
    if (!fills.length) return "Keeps the week moving.";
    const f = fills.slice(0, 2).map((x) => `${x.label.toLowerCase()} (${x.g.have} of ${x.g.lo}${x.unit === "min" ? " min" : "+ sets"})`);
    return `Fills ${f.join(" and ")}.`;
  }
  /* Candidate sessions: each Mine program's next session, then pool programs' sessions near where
     they are (open programs: every workout; phased: their current week). */
  function candidates(lib) {
    const out = [];
    const roles = (lib && lib.roles) || {};
    (window.PROGRAMS || []).filter((p) => !p.placeholder && CATALOG && CATALOG.programs[p.slug]).forEach((p) => {
      const role = roles[p.slug] || p.role;
      if (role === "finished" || role === "family") return;
      const prog = CATALOG.programs[p.slug], sm = window.HS ? HS.readSummary(p.slug) : null;
      let list;
      if (role === "mine") list = [findSession(p.slug, sm && sm.next && sm.next.id) || prog.sessions[0]];
      else if (prog.kind === "open") list = prog.sessions;
      else { const wk = (sm && sm.week) || 1; list = prog.sessions.filter((s) => s.w === wk && !s.o); if (!list.length) list = prog.sessions.slice(0, 6); }
      list.filter(Boolean).forEach((s) => out.push({ slug: p.slug, prog: p, role, session: s }));
    });
    return out;
  }
  /* Ranked options for today (B). opts: { date, minutes, lib } */
  function menu(opts) {
    const lib = opts.lib, date = opts.date;
    const tg = targets(lib), cov = coverage(date, lib), gl = gaps(cov, tg);
    const guard = tomorrowFamilyPatterns(date, lib);
    const ranked = candidates(lib).map((c) => {
      const load = sessionLoad(c.session);
      const { score, fills } = scoreLoad(load, gl);
      const guarded = Object.keys(load).filter((q) => guard.has(q) && load[q] >= 3);
      const mins = c.session.m || null;
      const tooLong = opts.minutes && mins && mins > opts.minutes * 1.15;
      let s = score + (c.role === "mine" ? 1.5 : 0);
      if (guarded.length) s -= 100;
      if (tooLong) s -= 50;
      return { ...c, load, score: s, fills, guarded, tooLong, minutes: mins, reason: guarded.length ? `Held back: ${guarded.join(", ")} the day before a family session.` : reasonFor(fills) };
    }).sort((a, b) => b.score - a.score);
    return { coverage: cov, targets: tg, gaps: gl, guard: [...guard], options: ranked };
  }
  /* Blocks (single exercises) that fill the gaps within `minutes` (C, and the Gaps fill cards). */
  function blocks(opts) {
    const lib = opts.lib, date = opts.date, budget = opts.minutes || 20;
    const tg = targets(lib), cov = coverage(date, lib), gl = gaps(cov, tg);
    const guard = opts.ignoreGuard ? new Set() : tomorrowFamilyPatterns(date, lib);
    const roles = (lib && lib.roles) || {};
    const seen = new Set(), pool = [];
    (window.PROGRAMS || []).filter((p) => !p.placeholder && CATALOG && CATALOG.programs[p.slug]).forEach((p) => {
      const role = roles[p.slug] || p.role;
      if (role === "family") return;
      CATALOG.programs[p.slug].sessions.forEach((s) => s.x.forEach((x) => {
        if (!x.p || !["strength", "core", "conditioning"].includes(x.k)) return;
        const k = P.key(x.n); if (seen.has(k)) return; seen.add(k);
        const load = {}; x.p.forEach((q) => { if (SET_KEYS.includes(q)) load[q] = x.sets || 1; if (MIN_KEYS.includes(q)) load[q] = x.min || (x.sets || 1) * 1.5; });
        const { score, fills } = scoreLoad(load, gl);
        if (score <= 0) return;
        if (Object.keys(load).some((q) => guard.has(q))) return;
        const mins = Math.max(3, Math.round(x.min || (x.sets || 1) * (((x.rest || 60) + 40) / 60)));
        pool.push({ slug: p.slug, prog: p, role, session: s, row: x, key: k, minutes: mins, score: score + (role === "mine" ? 0.5 : 0), fills });
      }));
    });
    pool.sort((a, b) => b.score / b.minutes - a.score / a.minutes);
    // One plain, best-fit block per gap (biggest gap first), then the runner-up per gap; the time
    // budget is filled greedily in that order. Multi-movement complexes only win when nothing
    // simpler fills the gap.
    const ranked = [], used2 = new Set();
    for (let round = 0; round < 2; round++) gl.forEach((g) => {
      const b = bestBlock(pool.filter((x) => !used2.has(x.key)), g.key);
      if (b) { used2.add(b.key); ranked.push(Object.assign({}, b, { forGap: g })); }
    });
    const chosen = [];
    let used = 0;
    ranked.forEach((b, i) => { if (i < gl.length && used + b.minutes <= budget) { chosen.push(b); used += b.minutes; } });
    return { coverage: cov, targets: tg, gaps: gl, guard: [...guard], chosen, pool: ranked.concat(pool.filter((x) => !used2.has(x.key))), used };
  }
  /* Best single fix for one gap: the block (or session) that fills that gap most per minute,
     preferring plain exercises (fewer patterns) and Ryan's own program. */
  const gapPts = (x, key) => { const f = (x.fills || []).find((y) => y.key === key); return f ? f.pts : 0; };
  function bestBlock(pool, key) {
    let best = null, bs = 0;
    pool.forEach((b) => { const pts = gapPts(b, key); if (!pts) return; const sc = pts / Math.max(6, b.minutes) * (1 + 0.5 / (b.row.p || [1]).length) + (b.role === "mine" ? 0.4 : 0); if (sc > bs) { bs = sc; best = b; } });
    return best;
  }
  function bestSession(options, key) {
    let best = null, bs = 0;
    options.forEach((o) => { if (o.guarded && o.guarded.length) return; const pts = gapPts(o, key); if (!pts) return; const sc = pts * 10 + o.score * 0.1 + (o.role === "mine" ? 2 : 0); if (sc > bs) { bs = sc; best = o; } });
    return best;
  }

  window.Gaps = { bestBlock, bestSession, loadCatalog, targets, coverage, gaps, menu, blocks, patternsOf, hardSets, mondayOf, addDays, findSession, sessionLoad, get catalog() { return CATALOG; } };
})();
