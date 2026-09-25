/* Library state (library_v1): program roles, the ratified program rule, Cloudflare sync, restore.
   Rule (Ryan, 2026-09-25): Family (kid programs) up to 2, outside the cap. Mine: 1 while any real
   family program runs, 2 when none. Pool: everything else, single sessions anytime. Finished: done.
   Requires shared/programs.js; sync requires shared/setlog.js; summaries come from shared/shell.js. */
(function () {
  "use strict";
  const KEY = "library_v1";
  const SYNC_BASE = "https://workout-sync.ryanrothe.workers.dev/v1/";
  const ROLES = ["family", "mine", "pool", "finished"];
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const progs = () => window.PROGRAMS || [];
  const bySlug = (slug) => progs().find((p) => p.slug === slug) || null;

  function fresh() {
    const roles = {};
    progs().forEach((p) => { roles[p.slug] = p.role || "pool"; });
    return { v: 1, roles, focus: null, watch: ["Achilles"], updated: new Date().toISOString() };
  }
  function load() {
    let s = null;
    try { s = JSON.parse(lsGet(KEY) || "null"); } catch (e) { s = null; }
    const f = fresh();
    if (!s || typeof s !== "object") return f;
    s.roles = Object.assign({}, f.roles, s.roles || {});
    Object.keys(s.roles).forEach((k) => { if (!bySlug(k) || ROLES.indexOf(s.roles[k]) < 0) delete s.roles[k]; });
    if (!Array.isArray(s.watch)) s.watch = f.watch;
    if (s.focus === undefined) s.focus = null;
    return s;
  }
  function save(s) {
    s.updated = new Date().toISOString();
    lsSet(KEY, JSON.stringify(s));
    if (window.SetLog && SetLog.sync && SetLog.sync.cfg && SetLog.sync.cfg.slug === "library") SetLog.sync.schedule();
  }

  const role = (s, slug) => s.roles[slug] || (bySlug(slug) || {}).role || "pool";
  const holders = (s, r) => progs().filter((p) => role(s, p.slug) === r);
  const realFamily = (s) => holders(s, "family").filter((p) => !p.placeholder);
  function caps(s) { return { family: 2, mine: realFamily(s).length > 0 ? 1 : 2 }; }

  /* Try to give `slug` the role `r`. Returns { ok: true } or { ok: false, full: r, holders: [...] }
     naming who would have to move to the pool first. `bump` moves that program to the pool. */
  function setRole(s, slug, r, bump) {
    const p = bySlug(slug); if (!p || ROLES.indexOf(r) < 0) return { ok: false, error: "unknown" };
    if (r === "family" && !p.family) return { ok: false, error: "not a family program" };
    // Try the change on a copy; commit only if the rule still holds.
    const trial = { roles: Object.assign({}, s.roles) };
    if (bump) trial.roles[bump] = "pool";
    trial.roles[slug] = r;
    const c = caps(trial);
    for (const full of ["family", "mine"]) {
      if (holders(trial, full).length > c[full]) {
        return { ok: false, full, holders: holders(trial, full).filter((h) => h.slug !== slug).map((h) => h.slug) };
      }
    }
    s.roles = trial.roles;
    save(s);
    return { ok: true };
  }

  /* ------------------------------------------------------------ sync + restore */
  function initSync(s) {
    if (!window.SetLog || !SetLog.sync) return;
    SetLog.sync.init({
      slug: "library",
      storageKey: KEY,
      payload: () => ({ state: load(), summaries: window.HS ? HS.readSummaries() : {} }),
      hasData: () => true
    });
  }
  const stores = () => progs().filter((p) => p.sync && p.storageKey).map((p) => ({ sync: p.sync, storageKey: p.storageKey, name: p.name }))
    .concat(window.EXTRA_STORES || []);

  /* Pull every store for `token` from Cloudflare. Returns [{ name, sync, found, savedAt, bytes }].
     Writes nothing; call apply() with the result to replace this phone's data. */
  async function fetchAll(token) {
    const out = [];
    for (const st of stores()) {
      try {
        const r = await fetch(`${SYNC_BASE}${st.sync}/${token}`, { cache: "no-store" });
        if (!r.ok) { out.push({ name: st.name, sync: st.sync, storageKey: st.storageKey, found: false }); continue; }
        const j = await r.json();
        out.push({ name: st.name, sync: st.sync, storageKey: st.storageKey, found: !!j.state, savedAt: j.savedAt || null, payload: j });
      } catch (e) { out.push({ name: st.name, sync: st.sync, storageKey: st.storageKey, found: false, error: e.message }); }
    }
    return out;
  }
  function apply(token, pulled) {
    let n = 0;
    pulled.forEach((x) => {
      if (!x.found || !x.payload || !x.payload.state) return;
      lsSet(x.storageKey, JSON.stringify(x.payload.state));
      if (x.sync === "library" && x.payload.summaries) {
        Object.entries(x.payload.summaries).forEach(([slug, sm]) => lsSet("summary." + slug, JSON.stringify(sm)));
      }
      n++;
    });
    lsSet("workout_sync_token", token);
    return n;
  }

  window.Lib = { KEY, ROLES, load, save, role, holders, caps, setRole, bySlug, initSync, stores, fetchAll, apply };
})();
