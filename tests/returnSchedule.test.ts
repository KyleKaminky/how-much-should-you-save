import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../src/lib/defaults';
import { buildReturnSchedule } from '../src/lib/returnSchedule';
import { effectiveWithdrawalRate } from '../src/lib/model';
import { glidePathFor, toReal } from '../src/lib/returns';
import type { Inputs } from '../src/lib/types';

const inputs = (o: Partial<Inputs> = {}): Inputs => ({ ...DEFAULT_INPUTS, ...o });

describe('return schedule', () => {
  it('spans exactly from today to the plan horizon', () => {
    const cfg = inputs({ currentAge: 37, retirementAge: 55, planToAge: 95 });
    const rows = buildReturnSchedule(cfg);
    expect(rows[0].age).toBe(37);
    expect(rows.at(-1)!.age).toBe(95);
    for (const r of rows) {
      expect(r.age).toBeGreaterThanOrEqual(37);
      expect(r.age).toBeLessThanOrEqual(95);
    }
  });

  it('is sorted and free of duplicates', () => {
    const rows = buildReturnSchedule(inputs({ currentAge: 37, retirementAge: 55 }));
    const ages = rows.map((r) => r.age);
    expect([...ages].sort((a, b) => a - b)).toEqual(ages);
    expect(new Set(ages).size).toBe(ages.length);
  });

  it('always includes the ages that carry meaning', () => {
    const cfg = inputs({ currentAge: 37, retirementAge: 58, planToAge: 96 });
    const ages = buildReturnSchedule(cfg).map((r) => r.age);
    // 58 and 96 are not on a five-year stride from 37, so they must be added.
    expect(ages).toContain(37);
    expect(ages).toContain(58);
    expect(ages).toContain(96);
  });

  it('marks now, retirement and the plan end', () => {
    const cfg = inputs({ currentAge: 37, retirementAge: 55, planToAge: 95 });
    const rows = buildReturnSchedule(cfg);
    expect(rows.find((r) => r.age === 37)!.markers).toContain('now');
    expect(rows.find((r) => r.age === 55)!.markers).toContain('retire');
    expect(rows.find((r) => r.age === 95)!.markers).toContain('plan ends');
  });

  it('marks the floor age on a glide path', () => {
    const cfg = inputs({ currentAge: 37, retirementAge: 55, returnModel: 'glidePath' });
    const rows = buildReturnSchedule(cfg);
    const floorAge = glidePathFor(cfg).floorAge;
    expect(rows.find((r) => r.age === floorAge)!.markers).toContain('floor');
  });

  it('does not mark a floor for the flat or custom models', () => {
    for (const returnModel of ['flat', 'constant'] as const) {
      const rows = buildReturnSchedule(inputs({ returnModel }));
      expect(rows.some((r) => r.markers.includes('floor'))).toBe(false);
    }
  });

  it('shows an identical rate on every row under the flat model', () => {
    const rows = buildReturnSchedule(inputs({ returnModel: 'flat' }));
    const first = rows[0].nominal;
    for (const r of rows) expect(r.nominal).toBeCloseTo(first, 12);
  });

  it('declines monotonically under the glide path, then holds at the floor', () => {
    const cfg = inputs({ currentAge: 30, retirementAge: 65, returnModel: 'glidePath' });
    const rows = buildReturnSchedule(cfg);
    const floor = glidePathFor(cfg).floorReturn;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].nominal).toBeLessThanOrEqual(rows[i - 1].nominal + 1e-12);
    }
    expect(rows.at(-1)!.nominal).toBeCloseTo(floor, 10);
  });

  it('converts to real with Fisher, not subtraction', () => {
    const cfg = inputs({ inflation: 0.03 });
    for (const r of buildReturnSchedule(cfg)) {
      expect(r.real).toBeCloseTo(toReal(r.nominal, 0.03), 12);
      // The naive version would be nominal - inflation.
      if (r.nominal > 0.03) expect(r.real).toBeLessThan(r.nominal - 0.03 + 1e-9);
    }
  });

  it('reports a margin only once retired', () => {
    const cfg = inputs({ currentAge: 37, retirementAge: 55 });
    const wr = effectiveWithdrawalRate(cfg);
    for (const r of buildReturnSchedule(cfg)) {
      if (r.age < 55) {
        expect(r.margin).toBeNull();
        expect(r.phase).toBe('accumulation');
      } else {
        expect(r.phase).toBe('retirement');
        expect(r.margin).toBeCloseTo(r.real - wr, 12);
      }
    }
  });

  it('shows a negative margin for the case that confused us', () => {
    // 8% anchor, glide path, 3.5% withdrawal: the floor is 2.43% real.
    const cfg = inputs({
      currentAge: 37,
      retirementAge: 55,
      returnModel: 'glidePath',
      withdrawalRateOverride: 0.035,
      glidePath: { ...DEFAULT_INPUTS.glidePath, anchorAge: 37, startReturn: 0.08 },
    });
    const rows = buildReturnSchedule(cfg);
    const atRetirement = rows.find((r) => r.age === 55)!;
    expect(atRetirement.real).toBeCloseTo(0.0243, 3);
    expect(atRetirement.margin!).toBeLessThan(0);
    expect(rows.at(-1)!.margin!).toBeLessThan(0);
  });

  it('survives a one-year horizon', () => {
    const rows = buildReturnSchedule(inputs({ currentAge: 60, retirementAge: 61, planToAge: 62 }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].age).toBe(60);
    expect(rows.at(-1)!.age).toBe(62);
  });
});
