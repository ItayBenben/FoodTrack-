/** In-process event bus feeding the SSE stream (03 §11). One process per box at this scale. */
import { EventEmitter } from 'node:events';
export interface AppEvent { user_id: string; type: string; data: unknown }
export class EventBus extends EventEmitter {
  publish(e: AppEvent) { this.emit('event', e); }
}
