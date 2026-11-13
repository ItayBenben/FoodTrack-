import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTrackerDir, loadPackDir } from '../src/loader';
import { contentHash, listOutcomes, parseTrackerDefinition, TrackerDefinitionError, validateValues, aggregateTrackerDay } from '../src/index';

const CONFIG = join(__dirname, '../../../config');

describe('shipped config', () => {
  it('loads all 13 tracker definitions and 3 packs', () => {
    const t = loadTrackerDir(join(CONFIG, 'trackers'));
    expect(t.map((x) => x.def.key).sort()).toEqual(['body', 'checkin', 'event_marker', 'exercise', 'hydration', 'meal', 'medication', 'note', 'stool', 'supplement', 'symptom', 'transit_marker', 'weight']);
    expect(loadPackDir(join(CONFIG, 'packs'), new Set(t.map((x) => x.def.key)))).toHaveLength(3);
  });
  it('declares the outcome catalogue of 04 §3 from data alone', () => {
    const refs = listOutcomes(loadTrackerDir(join(CONFIG, 'trackers')).map((t) => t.def)).map((o) => o.ref);
    for (const r of ['stool.any_abnormal', 'stool.loose', 'stool.hard', 'stool.deviation', 'symptom.bloating', 'symptom.pain', 'symptom.load', 'symptom.bloating_notable']) expect(refs).toContain(r);
  });
});

describe('invalid definitions fail startup with a precise error', () => {
  const dir = () => { const d = mkdtempSync(join(tmpdir(), 'trk-')); return d; };
  it('names the file and the path of the problem', () => {
    const d = dir();
    const stool = JSON.parse(readFileSync(join(CONFIG, 'trackers/stool.json'), 'utf8'));
    stool.fields[0].type = 'slider';
    writeFileSync(join(d, 'stool.json'), JSON.stringify(stool));
    try { loadTrackerDir(d); expect.fail('should throw'); } catch (e) {
      expect(e).toBeInstanceOf(TrackerDefinitionError);
      expect((e as Error).message).toContain('stool.json');
      expect((e as Error).message).toMatch(/fields\.0\.type/);
    }
  });
  it('rejects aggregations over unknown fields', () => {
    expect(() => parseTrackerDefinition({ key: 'x', version: 1, category: 'custom', icon: 'x', cardinality: 'occasional',
      labels: { en: { name: 'X', short: 'X' }, he: { name: 'X', short: 'X' } },
      fields: [{ key: 'a', type: 'boolean', labels: { en: 'a', he: 'a' } }],
      aggregation: { daily: [{ key: 'm', op: 'mean', field: 'nope' }] } })).toThrow(/unknown field 'nope'/);
  });
  it('rejects a filename that disagrees with the key', () => {
    const d = dir();
    writeFileSync(join(d, 'other.json'), readFileSync(join(CONFIG, 'trackers/stool.json')));
    expect(() => loadTrackerDir(d)).toThrow(/does not match filename/);
  });
});

describe('content hash', () => {
  it('ignores formatting and key order but not content', () => {
    const def = JSON.parse(readFileSync(join(CONFIG, 'trackers/stool.json'), 'utf8'));
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(def).reverse())));
    expect(contentHash(def)).toBe(contentHash(reordered));
    def.fields[1].max = 10;
    expect(contentHash(def)).not.toBe(contentHash(reordered));
  });
});

describe('definition-driven validation and aggregation', () => {
  const stool = parseTrackerDefinition(JSON.parse(readFileSync(join(CONFIG, 'trackers/stool.json'), 'utf8')));
  it('requires bristol and rejects unknown fields', () => {
    expect(validateValues(stool, {}).map((i) => i.code)).toContain('required');
    expect(validateValues(stool, { bristol: 4, nope: 1 }).map((i) => i.code)).toContain('unknown_field');
    expect(validateValues(stool, { bristol: 9 }).map((i) => i.code)).toContain('option');
    expect(validateValues(stool, { bristol: 4, urgency: 2 })).toEqual([]);
  });
  it('aggregates a day', () => {
    const agg = aggregateTrackerDay(stool, [{ values: { bristol: 4 } }, { values: { bristol: 7 } }]);
    expect(agg.count).toBe(2); expect(agg.any_abnormal).toBe(true); expect(agg.loose).toBe(true); expect(agg.hard).toBe(false);
    expect(agg.deviation).toBe(1.5);
  });
  it('a removed field disappears from validation with no code change', () => {
    const def = JSON.parse(readFileSync(join(CONFIG, 'trackers/stool.json'), 'utf8'));
    def.fields = def.fields.filter((f: { key: string }) => f.key !== 'urgency');
    def.aggregation.daily = def.aggregation.daily.filter((a: { field?: string }) => a.field !== 'urgency');
    const d = parseTrackerDefinition(def);
    expect(validateValues(d, { bristol: 4, urgency: 1 }).map((i) => i.code)).toContain('unknown_field');
  });
  void mkdirSync; void readdirSync;
});
