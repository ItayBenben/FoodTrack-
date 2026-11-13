import { loadEnv } from '../config.js';
import { migrate } from '../db/migrate.js';
const env = loadEnv();
const dir = (process.argv[2] ?? 'up') as 'up' | 'down';
migrate(env.DATABASE_OWNER_URL, dir).then((a) => { console.log(a.length ? `applied ${a.length}` : 'nothing to do'); }).catch((e) => { console.error(e.message); process.exit(1); });
