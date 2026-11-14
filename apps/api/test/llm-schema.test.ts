import { describe, expect, it } from 'vitest';
import { MEAL_JSON_SCHEMA, NARRATE_JSON_SCHEMA } from '../src/llm/types.js';

/** The Anthropic structured-output validator rejects `enum` on a node whose `type` is a union (400 invalid_request_error),
 *  which made every remote meal parse fall back to the deterministic provider in production. */
function violations(node: unknown, path = '$'): string[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as Record<string, unknown>;
  const out: string[] = [];
  if (Array.isArray(n.type) && 'enum' in n) out.push(`${path}: enum on a type union`);
  if (n.type === 'object' && n.additionalProperties !== false) out.push(`${path}: object without additionalProperties:false`);
  for (const [k, v] of Object.entries(n)) {
    if (Array.isArray(v)) v.forEach((x, i) => out.push(...violations(x, `${path}.${k}[${i}]`)));
    else if (v && typeof v === 'object') out.push(...violations(v, `${path}.${k}`));
  }
  return out;
}

describe('LLM JSON schemas are accepted by the structured-output validator', () => {
  it('meal parse schema', () => expect(violations(MEAL_JSON_SCHEMA)).toEqual([]));
  it('narrative schema', () => expect(violations(NARRATE_JSON_SCHEMA)).toEqual([]));
});
