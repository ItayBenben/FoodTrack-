#!/usr/bin/env node
// Copy lint (06 §7, CLAUDE.md rule 3 & 9): banned causal/diagnostic phrases in every locale file,
// locale key parity, and the mandatory open-label string. Never disable this.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const LOCALES = join(ROOT, 'apps/web/locales');
// Patterns mirror packages/shared/src/copy-rules.ts (kept in sync by test).
const src = readFileSync(join(ROOT, 'packages/shared/src/copy-rules.ts'), 'utf8');
const patterns = [...src.matchAll(/\{ code: '([a-z_]+)', re: (\/.*\/[a-z]*) \}/g)].map(([, code, re]) => {
  const m = re.match(/^\/(.*)\/([a-z]*)$/); return { code, re: new RegExp(m[1], m[2]) };
});
const allow = new Set([...src.matchAll(/'([a-z_.]+)',?\n/g)].map((m) => m[1]).filter((k) => k.includes('.')));

const flatten = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' && v !== null ? flatten(v, `${p}${k}.`) : [[`${p}${k}`, String(v)]]);
let failures = 0;
const fail = (msg) => { console.error(`copy-lint: ${msg}`); failures++; };

if (!existsSync(LOCALES)) { console.log('copy-lint: no locales yet'); process.exit(0); }
const files = readdirSync(LOCALES).filter((f) => f.endsWith('.json'));
const maps = Object.fromEntries(files.map((f) => [f, new Map(flatten(JSON.parse(readFileSync(join(LOCALES, f), 'utf8'))))]));
for (const [file, map] of Object.entries(maps)) {
  for (const [key, text] of map) {
    if (allow.has(key)) continue;
    for (const { code, re } of patterns) if (re.test(text)) fail(`${file} ${key}: banned phrase [${code}] in "${text}"`);
  }
}
const [a, b] = Object.values(maps);
if (a && b) {
  for (const k of a.keys()) if (!b.has(k)) fail(`key ${k} missing from ${files[1]}`);
  for (const k of b.keys()) if (!a.has(k)) fail(`key ${k} missing from ${files[0]}`);
}
for (const [file, map] of Object.entries(maps)) {
  const ol = map.get('trial.open_label');
  if (!ol) fail(`${file}: trial.open_label is mandatory (rule 9)`);
  else if (file.startsWith('en') && !/open-label — hypothesis-generating, not confirmatory/.test(ol)) fail(`${file}: trial.open_label must say "open-label — hypothesis-generating, not confirmatory"`);
}
if (failures) { console.error(`copy-lint: ${failures} problem(s)`); process.exit(1); }
console.log(`copy-lint: ${files.length} locale files, ${a?.size ?? 0} keys each, clean`);
