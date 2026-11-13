/** The worker process (06 §2): drains the job queue; relays events to the API via NOTIFY. */
import { boot } from '../boot.js';
import { startWorker } from './jobs.js';
import './register.js';

const deps = await boot({}, { migrate: false });
const w = startWorker(deps, { intervalMs: 1500 });
console.log('worker started');
const stop = async () => { w.stop(); await deps.db.end(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
