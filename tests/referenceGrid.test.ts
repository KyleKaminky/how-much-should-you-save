import { describe, expect, it } from 'vitest';
import { REFERENCE_TARGET_AGES } from '../src/lib/constants';
import { buildReferenceGrid, referenceInputs } from '../src/lib/referenceGrid';
import { solveRequiredSavingsRate } from '../src/lib/model';
import { DEFAULT_INPUTS } from '../src/lib/defaults';

/**
 * A structural regression guard on the engine.
 *
 * These are our own computed values, frozen at a known-good state — not
 * anyone else's published figures. If a change to the model moves a cell,
 * this fails and the diff has to be justified. Update the numbers deliberately,
 * never to make the suite go green.
 */
const GOLDEN: Record<number, Partial<Record<number, number>>> = {
  20: { 45: 30.5, 50: 20.6, 55: 14.2, 60: 9.9, 65: 7.0 },
  25: { 45: 49.5, 50: 32.8, 55: 22.5, 60: 15.8, 65: 11.2 },
  30: { 45: 82.3, 50: 52.3, 55: 35.3, 60: 24.7, 65: 17.6 },
  35: { 50: 85.8, 55: 55.4, 60: 38.0, 65: 27.0 },
  40: { 60: 58.6, 65: 40.8 },
};

describe('reference grid', () => {
  const cells = buildReferenceGrid();
  const lookup = new Map(cells.map((c) => [`${c.currentAge}:${c.retirementAge}`, c.rate]));

  it('matches the frozen golden values', () => {
    for (const [ageKey, row] of Object.entries(GOLDEN)) {
      for (const [targetKey, expected] of Object.entries(row)) {
        const actual = lookup.get(`${ageKey}:${targetKey}`);
        expect(actual, `age ${ageKey} retiring at ${targetKey}`).toBeCloseTo(expected!, 1);
      }
    }
  });

  it('omits cells where retirement is not in the future', () => {
    for (const c of cells) {
      expect(c.retirementAge).toBeGreaterThan(c.currentAge);
    }
    expect(lookup.has('50:45')).toBe(false);
    expect(lookup.has('45:45')).toBe(false);
  });

  it('rises down each column and falls across each row', () => {
    for (const target of REFERENCE_TARGET_AGES) {
      const col = cells
        .filter((c) => c.retirementAge === target)
        .sort((a, b) => a.currentAge - b.currentAge);
      for (let i = 1; i < col.length; i++) {
        expect(col[i].rate).toBeGreaterThan(col[i - 1].rate);
      }
    }

    const byAge = new Map<number, typeof cells>();
    for (const c of cells) byAge.set(c.currentAge, [...(byAge.get(c.currentAge) ?? []), c]);
    for (const row of byAge.values()) {
      const sorted = row.sort((a, b) => a.retirementAge - b.retirementAge);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].rate).toBeLessThan(sorted[i - 1].rate);
      }
    }
  });

  it('is insulated from the app defaults', () => {
    // The grid pins its own assumptions so a default change cannot move it.
    const r = referenceInputs(30, 60);
    expect(r.contributionTiming).toBe('annualBegin');
    expect(r.withdrawalRateOverride).toBe(0.04);
    expect(r.replacementRatio).toBe(0.8);
    expect(r.currentSavings).toBe(0);
    expect(r.employerMatch).toBe(0);
    expect(r.socialSecurity.enabled).toBe(false);
    expect(r.savingsRateOverride).toBeNull();
    // The app itself defaults differently; the grid must not follow it.
    expect(DEFAULT_INPUTS.contributionTiming).toBe('monthly');
    expect(DEFAULT_INPUTS.withdrawalRateOverride).toBeNull();
  });

  it('is independent of the income used to compute it', () => {
    // A pure ratio: with no starting balance and no Social Security, income
    // cancels out entirely.
    const at100k = solveRequiredSavingsRate(referenceInputs(30, 60));
    const at500k = solveRequiredSavingsRate({ ...referenceInputs(30, 60), income: 500_000 });
    expect(at500k).toBeCloseTo(at100k, 12);
  });

  it('covers the full age range without gaps', () => {
    const ages = [...new Set(cells.map((c) => c.currentAge))];
    expect(Math.min(...ages)).toBe(20);
    expect(Math.max(...ages)).toBe(40);
    expect(ages).toHaveLength(21);
  });
});
