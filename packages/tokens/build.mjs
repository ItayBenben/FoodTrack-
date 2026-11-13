// Generates CSS custom properties + Tailwind v4 @theme from tokens.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(here, 'tokens.json'), 'utf8'));
const vars = (obj) => Object.entries(obj).map(([k, v]) => `  --${k}: ${v};`).join('\n');
const flat = (prefix, obj) => Object.entries(obj).map(([k, v]) => `  --${prefix}-${k}: ${v};`).join('\n');
const css = `/* GENERATED from packages/tokens/tokens.json by build.mjs — do not edit. */
:root, :root[data-theme="light"] {
${vars(t.color.light)}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${vars(t.color.dark)}
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
${vars(t.color.dark)}
  color-scheme: dark;
}
:root {
  --font-sans: ${t.font.sans};
${flat('text-size', t.font.size)}
${flat('radius', t.radius)}
${flat('space', t.space)}
  --shadow-soft: ${t.shadow.soft};
  --motion-state: ${t.motion.state};
  --motion-sheet: ${t.motion.sheet};
  --ease: ${t.motion.ease};
  --touch-min: ${t.touch.min};
}
`;
const theme = `/* GENERATED from packages/tokens/tokens.json by build.mjs — do not edit. */
@theme inline {
${Object.keys(t.color.light).map((k) => `  --color-${k}: var(--${k});`).join('\n')}
  --font-sans: var(--font-sans);
${Object.entries(t.radius).map(([k, v]) => `  --radius-${k}: ${v};`).join('\n')}
${Object.entries(t.font.size).map(([k, v]) => `  --text-${k}: ${v};`).join('\n')}
  --shadow-soft: ${t.shadow.soft};
}
`;
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'tokens.css'), css);
writeFileSync(join(here, 'dist', 'theme.css'), theme);
console.log('tokens: wrote dist/tokens.css, dist/theme.css');
