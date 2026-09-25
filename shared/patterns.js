/* Movement patterns for Gaps (Phase 2, 2026-09-25).
   One tagger shared by the catalog build (automation/exercise-library/build_catalog.mjs) and the
   app at runtime. Tags come from name rules plus OVERRIDES (checked by hand; Ryan ratifies the
   unsure list). A row's `kind` also matters: warm-ups, cool-downs, notes and tests never count.
   Targets are hard sets per week (engine and mobility in minutes), from the ratified build brief. */
(function () {
  "use strict";

  const PATTERNS = [
    { key: "push",     label: "Push",                lo: 10, hi: 16, unit: "sets" },
    { key: "pull",     label: "Pull",                lo: 10, hi: 16, unit: "sets" },
    { key: "squat",    label: "Squat",               lo: 6,  hi: 12, unit: "sets" },
    { key: "hinge",    label: "Hinge",               lo: 6,  hi: 12, unit: "sets" },
    { key: "single",   label: "Single leg",          lo: 4,  hi: 8,  unit: "sets" },
    { key: "core",     label: "Core",                lo: 4,  hi: 10, unit: "sets" },
    { key: "calves",   label: "Calves and Achilles", lo: 2,  hi: 4,  unit: "sets" },
    { key: "engine",   label: "Engine",              lo: 60, hi: 90, unit: "min" },
    { key: "mobility", label: "Mobility",            lo: 30, hi: 60, unit: "min" }
  ];
  // Tagged for context, never targeted: arms (curls, extensions) and power (jumps, throws).
  const UNTARGETED = ["arms", "power"];

  const norm = (n) => String(n || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const key = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");   // same as SetLog.normName

  /* Rules run on the normalized name; every match adds its patterns (union), then EXCLUDE trims. */
  const RULES = [
    [/\b(calf|heel) raises?\b|\bpogos?\b|\bsoleus\b|\btib(ialis)? raises?\b|\bachilles\b|\bisometric heel\b|\bankle (inversion|eversion)\b|\bsingle leg balance\b|\bperturbation\b/, ["calves"]],
    [/\bnordics?\b|\b(hamstring|leg) curls?\b|\bglute ham\b/, ["hinge"]],
    [/\brdls?\b|\bromanian\b|\bdead ?lifts?\b|\bgood ?mornings?\b|\bhip thrusts?\b|\bglut(e)? bridges?\b|\bfire hydrants?\b|\bback extensions?\b|\bhyperextensions?\b|\bpull throughs?\b|\bswings?\b/, ["hinge"]],
    [/\bcleans?\b|\bsnatch(es)?\b/, ["hinge", "pull"]],
    [/\bspl(it|it) squats?\b|\bspilt squats?\b|\bbulgarian\b|\blunges?\b|\bstep ?ups?\b|\bpistols?\b|\bsingle leg (squat|deadlift|rdl|press)\b|\bskaters?\b|\bcossack\b|\bcurtsy\b/, ["single"]],
    [/\bsquats?\b|\bleg press\b|\bleg extensions?\b|\bwall sits?\b|\bthrusters?\b|\bgoblet\b|\bhack squat\b/, ["squat"]],
    [/\bbench\b|\bpush ?ups?\b|\bpress ?ups?\b|\bfloor press\b|\boverhead press\b|\bohp\b|\bmilitary press\b|\bshoulder press\b|\bpush press\b|\blandmine press\b|\bdips?\b|\bchest press\b|\bincline press\b|\bfl(y|ies|yes)\b|\bthrusters?\b|\bpike push\b|\bhandstand\b/, ["push"]],
    [/\b(db|dumbbell|kb|kettlebell|barbell|arnold|z|half kneeling|seated|standing|single arm|alternating|bent|bridge|waiters?|close grip|pullover)\b.*\bpress(es)?\b/, ["push"]],
    [/\b(lateral|lat|front|side|latereal)\b.*\braises?\b|\bcleavage cutters?\b|\bcable cross ?overs?\b/, ["push"]],
    [/\brear (lateral|delt) raises?\b|\bpull ?overs?\b|\bpullovers?\b/, ["pull"]],
    [/\brows?\b|\bpull ?ups?\b|\bchin ?ups?\b|\bpull ?downs?\b|\bface pulls?\b|\bpull ?aparts?\b|\brear delt\b|\breverse fl(y|ies|yes)\b|\bshrugs?\b|\bhigh pulls?\b|\bdead hangs?\b|\bflexed arm hang\b|\brenegade\b/, ["pull"]],
    [/\bcurls?\b|\btricep(s|t)?\b|\bbiceps?\b|\b(?<!back |leg |hip )extensions?\b|\bskull ?crushers?\b|\bpush ?downs?\b|\bkick ?backs?\b|\bhammer\b/, ["arms"]],
    [/\bplanks?\b|\bhollow\b|\bv ?ups?\b|\bcrunch(es)?\b|\bsit ?ups?\b|\bdead ?bugs?\b|\bpallof\b|\bab wheel\b|\brollouts?\b|\b(leg|knee) raises?\b|\brussian twists?\b|\btuck (hold|ups?)\b|\bl ?sits?\b|\bbird ?dogs?\b|\bside (bridge|plank)\b|\bcopenhagen\b|\bwood ?chops?\b|\bturkish get ?ups?\b|\bget ?ups?\b|\bwindmills?\b|\bhalos?\b|\bmarch(es)?\b|\bcarr(y|ies)\b|\bfarmers?\b|\bsuitcase carr/, ["core"]],
    [/\bruns?\b|\brunning\b|\bsprints?\b|\bbike\b|\bassault\b|\bairdyne\b|\bski ?erg\b|\brower\b|\browing\b|\berg\b|\bburpees?\b|\bjump rope\b|\bskips?\b|\bsleds?\b|\bwall ?balls?\b|\bmountain climbers?\b|\bjumping jacks?\b|\bshuttles?\b|\bmetcon\b|\bamrap\b|\bemom\b|\btabata\b|\bintervals?\b|\bstairs?\b|\bincline walk\b|\brucks?\b|\bhyrox\b|\bengine\b|\bcomplex\b/, ["engine"]],
    [/\bstretch(es)?\b|\bmobility\b|\bpigeon\b|\bhip flexor\b|\bcat ?cow\b|\bdown ?dog\b|\bthread the needle\b|\b90 ?90\b|\bcouch\b|\bfoam roll\b|\byoga\b|\bband pass\b|\bdislocates?\b|\bworld s greatest\b|\bspider lunge\b|\bcircles\b/, ["mobility"]],
    [/\bdepth drops?\b|\bvertical jumps?\b|\bbounding\b|\bshuffle\b|\bcuts?\b|\bbox jumps?\b|\bbroad jumps?\b|\bjump squats?\b|\bbounds?\b|\bhops?\b|\bdepth jumps?\b|\bplyo\b|\bmed(icine)? ?ball\b|\bslams?\b|\bthrows?\b|\bchest pass\b/, ["power"]]
  ];
  /* Trims after the union: a lunge or split squat is single-leg, not squat; a rowing erg is engine,
     not pull; a jump squat is power; a spider lunge is mobility. */
  const EXCLUDE = [
    [["single"], ["squat"]],
    [["power"], ["squat"]],
    [["mobility"], ["single"]],
    [["hinge"], ["arms"]]           // a Nordic or hamstring curl is hinge, not arms
  ];
  const ENGINE_ROW = /\b(rower|rowing|erg|row machine|calories? row|\d+ ?m row|row \d+ ?m)\b/;

  /* Hand-checked tags by exact name key (SetLog.normName). Wins over the rules. */
  // Ratified by Ryan 2026-09-25 (the 8 unsure FBA rows). [] = deliberately uncounted: a finisher tied
  // to the exercise before it.
  const OVERRIDES = {
    "banded30swithpalmup": ["arms"],   // Banded 30's with palm up
    "dbwristrotations": ["arms"],   // DB Wrist Rotations
    "bulletproofshouldercomplexesrest90secaftereachsetrepeatfor3totalsets": ["pull"],   // Bulletproof Shoulder Complexes
    "maxunbrokenrepswithbodyweight": [],   // Max unbroken reps with bodyweight
    "1minofmaxreps": [],   // 1 min of Max Reps
    "putyourbodyweightonabarbellandtryandgetasmanyrepsaspossiblein5mingoodsolidrepsdontgotoofastandrestwheneverneededbuttrytokeepthebreaksshortitsashorttimewindowbutitsapainfulonetoo": [],   // Bodyweight barbell AMRAP (5 min)
    "10secofholdingthelastrepatthetop": [],   // 10 sec hold at the top of the last rep
    "10secholdatthetop": [],   // 10 sec hold at the top
  };

  function tag(name, kind) {
    if (kind === "warmup" || kind === "cooldown" || kind === "note" || kind === "test") return [];
    const k = key(name);
    if (OVERRIDES[k]) return OVERRIDES[k].slice();
    const n = norm(name);
    const out = new Set();
    RULES.forEach(([re, pats]) => { if (re.test(n)) pats.forEach((p) => out.add(p)); });
    if (ENGINE_ROW.test(n)) { out.delete("pull"); out.add("engine"); }
    if (/\brear (lateral|delt)\b/.test(n)) out.delete("push");            // rear-delt raises are pull
    if (/\b(back|leg|hip) extensions?\b/.test(n)) out.delete("arms");
    // "Bench" alone is equipment, not a press: a bench-supported row or a bench step-up isn't push.
    if (out.has("push") && (out.has("pull") || out.has("single")) && !/\bpress(es)?\b|\bpush\b|\bdips?\b|\bfl(y|ies|yes)\b|\bthrusters?\b|\braises?\b|\bcutters?\b/.test(n)) out.delete("push");
    if (/\bhip extensions?\b/.test(n)) out.add("hinge");
    EXCLUDE.forEach(([when, drop]) => { if (when.some((w) => out.has(w))) drop.forEach((d) => out.delete(d)); });
    if (kind === "mobility") { out.clear(); out.add("mobility"); }
    if (!out.size && kind === "conditioning") out.add("engine");
    if (!out.size && kind === "core") out.add("core");
    return Array.from(out);
  }

  const api = { PATTERNS, UNTARGETED, OVERRIDES, tag, norm, key };
  if (typeof window !== "undefined") window.Patterns = api;
  if (typeof module !== "undefined") module.exports = api;
})();
