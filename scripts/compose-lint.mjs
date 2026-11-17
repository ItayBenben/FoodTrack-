#!/usr/bin/env node
// 06 §5.5: only Caddy publishes ports; everything else stays on the internal network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url)); // .pathname breaks on Windows (/C:/…)
let bad = 0;
for (const file of ['docker-compose.yml']) {
  const text = readFileSync(ROOT + file, 'utf8');
  let service = null; let inPorts = false;
  for (const line of text.split('\n')) {
    const svc = line.match(/^  ([a-z0-9_-]+):\s*$/); if (svc) { service = svc[1]; inPorts = false; continue; }
    if (/^\s{4}ports:/.test(line)) { inPorts = true; if (service !== 'caddy') { console.error(`compose-lint: ${file} service '${service}' publishes ports`); bad++; } continue; }
    if (inPorts && !/^\s{6}-/.test(line)) inPorts = false;
  }
  if (/0\.0\.0\.0:/.test(text)) { console.error(`compose-lint: ${file} binds 0.0.0.0 explicitly`); bad++; }
}
if (bad) process.exit(1);
console.log('compose-lint: only caddy publishes ports');
