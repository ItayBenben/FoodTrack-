import { buildApp } from './app.js';
import { boot } from './boot.js';
import { KeyError } from './crypto/envelope.js';
import { TrackerDefinitionError } from '@foodtrack/tracker-schema';

async function main() {
  let deps;
  try {
    deps = await boot();
  } catch (e) {
    if (e instanceof KeyError) console.error(`FATAL [${e.reason}] ${e.message}`);
    else if (e instanceof TrackerDefinitionError) console.error(`FATAL [tracker_definition] ${e.message}`);
    else console.error(`FATAL ${(e as Error).message}`);
    process.exit(1);
  }
  const app = await buildApp(deps);
  await app.listen({ port: deps.env.PORT, host: deps.env.HOST });
  const stop = async () => { await app.close(); await deps.db.end(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main();
