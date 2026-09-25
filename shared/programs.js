/* Program registry for the health system shell (Today, Library, restore).
   One entry per program folder. Adding a program = one entry here + its folder.
   `sync` is the workout-sync slug the program posts under; `storageKey` is its localStorage key.
   `family: true` marks a kid program (it may take a Family slot, outside the cap).
   `role` is the default role on first run; the user's choice lives in library_v1. */
window.PROGRAMS = [
  { slug: "father-son", name: "Father & Son Strength", short: "Father & Son", mono: "F&S", color: "#4338CA",
    by: "With Porter", meta: "12 weeks · Mon upper · Wed lower", family: true, role: "family",
    storageKey: "father_son_v1", sync: "father-son", cat: "strength" },
  { slug: "daughter", name: "Her program", short: "Her program", mono: "HER", color: "#A21CAF",
    by: "Daughter", meta: "Not built yet", family: true, role: "family", placeholder: true, cat: "strength" },
  { slug: "tfm-1", name: "The Functional Method 1.0", short: "TFM 1.0", mono: "TF1", color: "#0E7490",
    by: "JTM Fit · John Madsen", meta: "8 weeks · 4 to 6 days · 60 to 75 min", role: "mine",
    storageKey: "tfm1_v1", sync: "tfm-1", cat: "strength" },
  { slug: "tfm-2", name: "The Functional Method 2.0", short: "TFM 2.0", mono: "TF2", color: "#B91C1C",
    by: "JTM Fit · John Madsen", meta: "8 weeks · 6 days", role: "pool",
    storageKey: "tfm2_v1", sync: "tfm-2", cat: "strength" },
  { slug: "ppl", name: "6-Day PPL", short: "PPL", mono: "PPL", color: "#BE185D",
    by: "Anyman Fitness · Jason Helmes", meta: "Open-ended · 6 days · 45 min", role: "pool",
    storageKey: "ppl_v1", sync: "ppl", cat: "strength" },
  { slug: "athletic-af", name: "Athletic AF", short: "Athletic AF", mono: "AAF", color: "#C2410C",
    by: "Strength and conditioning", meta: "5 phases + week 17 · PR tracking", role: "pool",
    storageKey: "athleticAF.v1", sync: "athletic-af", cat: "strength" },
  { slug: "kb-shred", name: "KB Shred", short: "KB Shred", mono: "KB", color: "#047857",
    by: "Adam Gooch", meta: "8 weeks · 4 days · kettlebell", role: "pool",
    storageKey: "kb_shred_v1", sync: "kb-shred", cat: "conditioning" },
  { slug: "hyrox", name: "Hyrox Home Engine", short: "Hyrox", mono: "HYX", color: "#A16207",
    by: "Home gym Hyrox build", meta: "12 weeks · 4 days", role: "pool",
    storageKey: "hyrox_home_v1", sync: "hyrox", cat: "conditioning" },
  { slug: "full-body-aesthetics", name: "Full Body Aesthetics", short: "FBA", mono: "FBA", color: "#6D28D9",
    by: "Ryan Fischer", meta: "64 weeks · 6 days · DB and bodyweight", role: "pool",
    storageKey: "fba_v1", sync: "full-body-aesthetics", cat: "strength" },
  { slug: "hotel", name: "Hotel Workouts", short: "Hotel", mono: "HTL", color: "#1D4ED8",
    by: "Madsen upper and lower splits", meta: "Travel swap · DB and bodyweight", role: "pool", travel: true,
    storageKey: "madsen_split_v1", sync: "hotel", cat: "strength" },
  { slug: "achilles", name: "Achilles Rebuild", short: "Achilles", mono: "ACH", color: "#9A3412",
    by: "Tendon rehab", meta: "12 weeks · 3 days", role: "finished",
    storageKey: "achilles_program_v1", sync: "achilles", cat: "rehab" }
];

/* Stores that are not programs but sync and restore the same way. */
window.EXTRA_STORES = [
  { sync: "nutrition", storageKey: "nutrition_v1", name: "Fuel" },
  { sync: "library", storageKey: "library_v1", name: "Library settings" }
];
