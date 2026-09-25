/* Health system shell (Phase 1, 2026-09-25).
   Include on every page, after ../shared/setlog.js and before the page's own script:
     <script src="../shared/shell.js"></script>
   - Main pages (<body data-shell="today|library|fuel">) get the bottom tab bar: Today / Library / Fuel.
   - Program pages (<body data-program="...">, no data-shell) get "‹ Today" on the back link and a
     Fuel chip (kcal left today) at the right of the sticky appbar. Nothing else on the page changes.
   - HS.summary(slug, obj) is the contract every program writes after load and after each save.
     Today and Library read these summaries; they never read a program's own storage.

   Summary shape (all fields optional except where noted):
     kind:     "phased" | "open" | "setdays"                                   (required)
     week:     current program week, by completion for phased programs, else null
     weeks:    total weeks, or null when open-ended
     phase:    optional label, e.g. "Build" or "Phase 2"
     next:     { label, sub, date, minutes, listed } the session the page opens to, null when complete
               date only for set-day programs (the calendar date of the next session)
     today:    { label, minutes, done } for set-day programs when today is a scheduled day, else null
     thisWeek: { done, planned } sessions done and planned in the current program week
     days:     ["Mon","Wed"] fixed weekdays for set-day programs, else null
     sessions: ["YYYY-MM-DD", ...] every local date with logged work (trimmed to the last 180)
     lastDate: most recent date in sessions, or null */
(function () {
  "use strict";
  const HS = (window.HS = window.HS || {});
  const me = document.currentScript;
  const BASE = me && me.src ? me.src.replace(/shared\/shell\.js(\?.*)?$/, "") : "../";
  HS.base = BASE;

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const pad = (n) => String(n).padStart(2, "0");
  HS.dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  HS.today = () => HS.dstr(new Date());
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  /* ------------------------------------------------------------ summary contract */
  HS.summary = function (slug, s) {
    const out = Object.assign({ v: 1, slug, updated: new Date().toISOString() }, s || {});
    if (Array.isArray(out.sessions)) {
      out.sessions = Array.from(new Set(out.sessions.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort().slice(-180);
      if (out.lastDate == null) out.lastDate = out.sessions.length ? out.sessions[out.sessions.length - 1] : null;
    }
    lsSet("summary." + slug, JSON.stringify(out));
    return out;
  };
  HS.readSummary = (slug) => { try { return JSON.parse(lsGet("summary." + slug) || "null"); } catch (e) { return null; } };
  HS.readSummaries = function () {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("summary.") === 0) { try { out[k.slice(8)] = JSON.parse(localStorage.getItem(k)); } catch (e) {} }
      }
    } catch (e) {}
    return out;
  };

  /* ------------------------------------------------------------ styles */
  const css = `
@font-face { font-family: "Archivo"; src: url("${BASE}shared/fonts/archivo-latin.woff2") format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; font-display: swap; }
@font-face { font-family: "Figtree"; src: url("${BASE}shared/fonts/figtree-latin.woff2") format("woff2"); font-weight: 300 900; font-display: swap; }
.hs-fuel { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; height: 36px; padding: 0 11px 0 4px; border-radius: 18px;
  border: 1px solid #E4E0D6; background: #FFFFFF; color: #16171B; text-decoration: none; font-family: Figtree, -apple-system, system-ui, sans-serif; }
.hs-fuel svg { flex-shrink: 0; }
.hs-fuel .hs-fuel-t { display: flex; flex-direction: column; line-height: 1.05; }
.hs-fuel b { font-size: 13.5px; font-weight: 800; }
.hs-fuel small { font-size: 10px; font-weight: 600; color: #5C5F66; }
.hs-tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 80; display: flex; justify-content: center;
  background: rgba(255, 255, 255, 0.94); -webkit-backdrop-filter: saturate(180%) blur(18px); backdrop-filter: saturate(180%) blur(18px);
  border-top: 1px solid #E4E0D6; padding: 0 6px env(safe-area-inset-bottom); font-family: Figtree, -apple-system, system-ui, sans-serif; }
.hs-tabbar-in { display: flex; width: 100%; max-width: 560px; }
.hs-tab { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 3px; min-height: 56px; padding-top: 7px; box-sizing: border-box;
  color: #5C5F66; text-decoration: none; font-size: 11px; font-weight: 600; }
.hs-tab[aria-current="page"] { color: #16171B; font-weight: 800; }
.hs-tab .hs-ico { height: 28px; display: flex; align-items: center; justify-content: center; }
body.hs-has-tabbar { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
`;
  function injectCss() {
    if (document.getElementById("hs-css")) return;
    const st = document.createElement("style");
    st.id = "hs-css";
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ------------------------------------------------------------ drawing helpers */
  HS.ring = function (size, sw, frac, color, track, inner) {
    const r = (size - sw) / 2, c = 2 * Math.PI * r, h = size / 2, f = Math.max(0, Math.min(1, frac || 0));
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${track}" stroke-width="${sw}"/>` +
      (f > 0 ? `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${h} ${h})"/>` : "") +
      (inner || "") + `</svg>`;
  };
  const ICON = {
    today: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><rect x="7.5" y="13" width="4" height="4" rx="1"/>',
    library: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    fuel: '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z"/><path d="M9.5 3.5c-1 1.2-1 2.3 0 3.5M14 3.5c-1 1.2-1 2.3 0 3.5"/>'
  };
  HS.icon = (name, size, sw, color) =>
    `<svg width="${size || 22}" height="${size || 22}" viewBox="0 0 24 24" fill="none" stroke="${color || "currentColor"}" stroke-width="${sw || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ""}</svg>`;

  /* ------------------------------------------------------------ fuel numbers */
  HS.fuel = function () {
    if (!window.Fuel) return null;
    try { const S = window.Fuel.read(); return S ? window.Fuel.status(S, HS.today()) : null; } catch (e) { return null; }
  };
  function fuelMiniRing(st, size, color) {
    const frac = st && st.target ? st.eaten.k / st.target.kcal : 0;
    const inner = `<g transform="translate(${size / 2 - 6} ${size / 2 - 6}) scale(0.5)" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${ICON.fuel}</g>`;
    return HS.ring(size, 3, frac, "#4D7C0F", "#EAE6DC", inner);
  }

  /* ------------------------------------------------------------ program pages */
  function mountProgramChrome() {
    const back = document.querySelector(".appbar-back");
    if (back) {
      back.setAttribute("aria-label", "Back to Today");
      back.childNodes.forEach((n) => { if (n.nodeType === 3 && /Library/.test(n.textContent)) n.textContent = n.textContent.replace("Library", "Today"); });
    }
    const inner = document.querySelector(".appbar-inner");
    if (!inner || inner.querySelector(".hs-fuel")) return;
    const a = document.createElement("a");
    a.className = "hs-fuel";
    a.href = BASE + "nutrition/";
    inner.appendChild(a);
    const paint = () => {
      const st = HS.fuel();
      if (st && st.target) {
        const left = st.left.k;
        a.innerHTML = fuelMiniRing(st, 28, "#5C5F66") + `<span class="hs-fuel-t"><b>${fmt(Math.abs(left))}</b><small>${left >= 0 ? "kcal left" : "kcal over"}</small></span>`;
        a.setAttribute("aria-label", `Fuel: ${fmt(Math.abs(left))} kcal ${left >= 0 ? "left" : "over"} today. Open Fuel.`);
      } else {
        a.innerHTML = fuelMiniRing(null, 28, "#5C5F66") + `<span class="hs-fuel-t"><b>Fuel</b><small>log today</small></span>`;
        a.setAttribute("aria-label", "Open Fuel");
      }
    };
    paint();
    HS.repaint = paint;
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") paint(); });
    window.addEventListener("storage", (e) => { if (e.key === "nutrition_v1") paint(); });
  }

  /* ------------------------------------------------------------ main pages: tab bar */
  function mountTabbar(active) {
    if (document.querySelector(".hs-tabbar")) return;
    const nav = document.createElement("nav");
    nav.className = "hs-tabbar";
    nav.setAttribute("aria-label", "Main");
    document.body.appendChild(nav);
    document.body.classList.add("hs-has-tabbar");
    const paint = () => {
      const st = HS.fuel();
      const fuelLabel = st && st.target ? `${fmt(Math.abs(st.left.k))} ${st.left.k >= 0 ? "left" : "over"}` : "Fuel";
      const items = [
        ["today", "Today", BASE + "index.html", `<span class="hs-ico">${HS.icon("today", 23, 1.8)}</span>`],
        ["library", "Library", BASE + "library.html", `<span class="hs-ico">${HS.icon("library", 23, 1.8)}</span>`],
        ["fuel", fuelLabel, BASE + "nutrition/", `<span class="hs-ico">${fuelMiniRing(st, 28, active === "fuel" ? "#16171B" : "#5C5F66")}</span>`]
      ];
      nav.innerHTML = `<div class="hs-tabbar-in">${items.map(([k, label, href, ico]) =>
        `<a class="hs-tab" href="${href}"${k === active ? ' aria-current="page"' : ""}>${ico}<span>${label}</span></a>`).join("")}</div>`;
    };
    paint();
    HS.repaint = paint;
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") paint(); });
  }

  /* ------------------------------------------------------------ boot */
  function ensureFuel(cb) {
    if (window.Fuel) return cb();
    const s = document.createElement("script");
    s.src = BASE + "shared/fuel.js";
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }
  function boot() {
    injectCss();
    const which = document.body.dataset.shell;
    ensureFuel(() => {
      if (which) mountTabbar(which);
      else if (document.body.dataset.program) mountProgramChrome();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
