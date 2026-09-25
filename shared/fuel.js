/* Fuel math, shared by the Fuel page (nutrition/), Today, and the Fuel chip on program pages.
   Pure functions over the nutrition_v1 state, lifted unchanged from nutrition/index.html
   (2026-09-25) so every surface computes the same numbers. The Fuel page is the only
   writer of nutrition_v1; everything here only reads. */
(function () {
  "use strict";
  const KEY = "nutrition_v1";
  const pad = (n) => String(n).padStart(2, "0");
  const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dstr(new Date());
  const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
  const mondayOf = (s) => { const d = parseD(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return dstr(d); };
  const r0 = (n) => Math.round(n || 0);
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

  function read() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- macros */
  function foodMacros(S, food, qty) {
    const f = S.foods && S.foods[food]; if (!f) return { k: 0, p: 0, f: 0, c: 0 };
    const m = f.unit === "each" ? qty : qty / 100;
    return { k: f.per.k * m, p: f.per.p * m, f: f.per.f * m, c: f.per.c * m };
  }
  function sumMacros(S, items) {
    return (items || []).reduce((a, it) => { const m = foodMacros(S, it.food, num(it.g)); a.k += m.k; a.p += m.p; a.f += m.f; a.c += m.c; return a; }, { k: 0, p: 0, f: 0, c: 0 });
  }
  const mealMacros = (S, meal) => sumMacros(S, meal.items);

  /* ---------------------------------------------------------------- targets */
  function weightOn(S, date) {
    // 7-day trailing average of weigh-ins ending on `date`; else the latest weigh-in before it.
    const W = S.weights || {};
    const keys = Object.keys(W).filter((d) => d <= date).sort();
    if (!keys.length) return null;
    const from = addDays(date, -6);
    const win = keys.filter((d) => d >= from).map((d) => W[d]);
    if (win.length) return { w: win.reduce((a, b) => a + b, 0) / win.length, n: win.length, latest: W[keys[keys.length - 1]] };
    return { w: W[keys[keys.length - 1]], n: 0, latest: W[keys[keys.length - 1]], stale: keys[keys.length - 1] };
  }
  function targets(S, date) {
    const p = S.profile; if (!p) return null;
    if (p.mode === "manual") {
      const kcal = r0(p.manual.kcal), P = r0(p.manual.p), F = r0(p.manual.f);
      return { mode: "manual", kcal, p: P, f: F, c: Math.max(0, r0((kcal - P * 4 - F * 9) / 4)) };
    }
    const wo = weightOn(S, date); if (!wo) return null;
    const w = wo.w, kg = w * 0.45359237, cm = p.heightIn * 2.54;
    const bmr = 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === "f" ? -161 : 5);
    const tdee = bmr * p.activity;
    let deficit = 0;
    if (p.goal === "cut") deficit = Math.min(tdee * p.deficitPct / 100, p.deficitCap);
    if (p.goal === "build") deficit = -p.surplus;
    const kcal = r0(tdee - deficit), P = r0(w * p.proteinPerLb), F = r0(w * p.fatPerLb);
    return { mode: "auto", w, wn: wo.n, stale: wo.stale, bmr, tdee, deficit, kcal, p: P, f: F, c: Math.max(0, r0((kcal - P * 4 - F * 9) / 4)) };
  }
  const pct = (t) => { const tot = t.p * 4 + t.f * 9 + t.c * 4 || 1; return { p: r0(t.p * 4 / tot * 100), f: r0(t.f * 9 / tot * 100), c: r0(t.c * 4 / tot * 100) }; };

  /* ---------------------------------------------------------------- day + plan */
  const dayLog = (S, date) => (S.days && S.days[date] ? S.days[date].log : []);
  const dayTotals = (S, date) => dayLog(S, date).reduce((a, e) => { a.k += e.k; a.p += e.p; a.f += e.f; a.c += e.c; return a; }, { k: 0, p: 0, f: 0, c: 0 });
  function planFor(S, date) { const wk = S.plan && S.plan.weeks ? S.plan.weeks[mondayOf(date)] : null; return wk ? wk.days[date] || null : null; }

  /* Planned for `date` and not yet logged, in eating order: the fixed breakfast, then the plan's
     lunch, dinner and salad. `slot` is the meal slot the entry fills. */
  function plannedOpen(S, date) {
    const logged = new Set(dayLog(S, date).map((e) => e.meal));
    const out = [];
    const add = (id, slot) => { const m = S.meals && S.meals[id]; if (m && !m.archived && !logged.has(id)) out.push({ id, slot, name: m.name, m: mealMacros(S, m) }); };
    add("b1", "breakfast");
    const p = planFor(S, date);
    if (p) { if (p.lunch) add(p.lunch, "lunch"); if (p.dinner) add(p.dinner, "dinner"); if (p.salad) add("v1", "side"); }
    return out;
  }

  /* Everything a surface needs for one day. `next` is the first open planned meal that is
     not a side, so "Log dinner" shows once lunch is in. */
  function status(S, date) {
    date = date || today();
    const t = targets(S, date), eaten = dayTotals(S, date);
    const left = t ? { k: t.kcal - eaten.k, p: t.p - eaten.p, f: t.f - eaten.f, c: t.c - eaten.c } : null;
    const open = plannedOpen(S, date);
    const next = open.find((o) => o.slot !== "side") || open[0] || null;
    return { date, target: t, eaten, left, weighIn: S.weights ? S.weights[date] : null, avg: weightOn(S, date), open, next, logged: dayLog(S, date).length };
  }

  window.Fuel = { KEY, read, today, dstr, parseD, addDays, mondayOf, r0, num, foodMacros, sumMacros, mealMacros, weightOn, targets, pct, dayLog, dayTotals, planFor, plannedOpen, status };
})();
