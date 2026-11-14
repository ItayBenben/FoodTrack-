# The three-week pilot

**Why bother, when the app is fully specified?** Because two questions decide whether the build is worth twenty days, and no specification can answer either:

1. **Will you actually log every day?** If the habit doesn't survive three weeks on paper, no amount of one-tap UI fixes that — the app would just be a faster way to stop after a fortnight.
2. **Is there a signal in your data at all?** Three weeks won't find a subtle effect (see `docs/04-analysis-engine.md` §15 — that takes months). But it will show whether your bad days cluster at all, whether your diet varies enough to compare anything, and roughly what your baseline rate is. Those three numbers make every later estimate real instead of assumed.

Three weeks of typing into your Notes app costs about 90 seconds a day. If both answers come back yes, you build with confidence. If the logging doesn't stick, you've learned that for the price of a fortnight rather than a month of development.

---

## What to log

**Every day, one line per thing.** Format is deliberately loose — I'll parse it, that's the whole point.

```
21/8 08:15 meal קפה עם חלב, טוסט
21/8 09:40 stool 4
21/8 13:05 meal פיתה עם חומוס, סלט, קפה קר
21/8 19:20 sym bloating 7
21/8 22:00 day energy 2 sleep 5.5 stress 4
22/8 07:30 weight 78.4
22/8 21:50 day ok
```

Five kinds of line, that's all:

| Prefix | What follows | Example |
|---|---|---|
| `meal` | whatever you ate, in your own words, any language | `meal סביח עם ביצה` |
| `stool` | the Bristol number 1–7, plus `urgent` or `blood` if relevant | `stool 6 urgent` |
| `sym` | symptom name and 0–10 | `sym pain 5` |
| `day` | the evening line: `energy N sleep H stress N` — **or just `ok`** | `day ok` |
| `weight` | the number | `weight 78.4` |

**`day ok` matters more than it looks.** It's the paper version of "Nothing to report", and it roughly doubles what I can get out of your three weeks. A day with no line at all is ambiguous — did nothing happen, or did you forget? `day ok` removes the ambiguity in four characters.

### The Bristol scale, for reference

```
1  separate hard lumps          ← constipated end
2  lumpy sausage
3  cracked sausage              ┐
4  smooth sausage               ├ normal
5  soft blobs                   ┘
6  mushy, ragged edges
7  entirely liquid              ← diarrhoea end
```

---

## Rules that make the data usable

1. **Log the meal, not the nutrition.** "שווארמה בלאפה" is a perfect entry. Don't estimate grams.
2. **Late-night counts as the previous day.** Anything before 04:00 belongs to yesterday — write yesterday's date.
3. **Miss a day, skip it.** Don't backfill from memory; invented data is worse than missing data. Just carry on.
4. **Don't change how you eat.** This is a baseline. Cutting out dairy "to see" during the pilot destroys the comparison.
5. **Note the confounders** when they happen, in the meal line or a `day` line — antibiotics, a bad night, travel, a stomach bug. Those are what make the food findings trustworthy or not.

---

## What I'll do with it

Send it back as text — paste, screenshot, file, whatever's easiest — and I'll report:

- **Adherence**: how many of the 21 days have a meal line and an outcome line. This is the number that decides whether to build.
- **Baseline rate**: what fraction of your days are abnormal. Everything in `04` §15 assumed 20%; your real number changes every timeline estimate in the spec.
- **Dietary variety**: how many distinct foods and how often each appears. If everything you eat appears on 90% of days, the engine has no contrast to work with and the design needs rethinking before it's built, not after.
- **Any early clustering**: whether bad days group after particular foods. Not a finding — three weeks cannot produce one — but it tells us where to point the first trial.
- **A revised, honest timeline** for your actual data, replacing the generic table in the spec.

If the pilot says "you logged 6 days out of 21", that's not a failure. That's twenty days of development saved, and a much better conversation about what would actually fit your life.
