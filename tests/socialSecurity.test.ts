import { describe, expect, it } from 'vitest';
import { PIA_BEND_POINTS, TAXABLE_MAXIMUM } from '../src/lib/constants';
import {
  claimingAdjustment,
  computeAIME,
  computePIA,
  estimateSocialSecurity,
} from '../src/lib/socialSecurity';

const [BEND1, BEND2] = PIA_BEND_POINTS;

describe('PIA bend-point formula', () => {
  it('applies 90% below the first bend point', () => {
    expect(computePIA(1000)).toBeCloseTo(900, 6);
  });

  it('is exact at the first bend point', () => {
    expect(computePIA(BEND1)).toBeCloseTo(0.9 * BEND1, 6);
  });

  it('applies 32% in the middle tier', () => {
    const aime = 4000;
    expect(computePIA(aime)).toBeCloseTo(0.9 * BEND1 + 0.32 * (aime - BEND1), 6);
  });

  it('applies 15% above the second bend point', () => {
    const aime = 10_000;
    const expected = 0.9 * BEND1 + 0.32 * (BEND2 - BEND1) + 0.15 * (aime - BEND2);
    expect(computePIA(aime)).toBeCloseTo(expected, 6);
  });

  it('is continuous and monotonic across the bends', () => {
    let prev = -1;
    for (let aime = 0; aime <= 15_000; aime += 25) {
      const pia = computePIA(aime);
      expect(pia).toBeGreaterThanOrEqual(prev);
      prev = pia;
    }
    expect(computePIA(BEND1 + 1e-9)).toBeCloseTo(computePIA(BEND1), 6);
    expect(computePIA(BEND2 + 1e-9)).toBeCloseTo(computePIA(BEND2), 6);
  });

  it('pays zero on zero earnings', () => {
    expect(computePIA(0)).toBe(0);
  });
});

describe('claiming adjustment', () => {
  it('is 100% at full retirement age', () => {
    expect(claimingAdjustment(67)).toBe(1);
  });

  it('is 70% at 62', () => {
    // 36 months at 5/9 of 1% (20%) plus 24 months at 5/12 of 1% (10%).
    expect(claimingAdjustment(62)).toBeCloseTo(0.7, 10);
  });

  it('is 124% at 70', () => {
    expect(claimingAdjustment(70)).toBeCloseTo(1.24, 10);
  });

  it('is 80% at 64', () => {
    expect(claimingAdjustment(64)).toBeCloseTo(0.8, 10);
  });

  it('is 108% at 68', () => {
    expect(claimingAdjustment(68)).toBeCloseTo(1.08, 10);
  });

  it('clamps outside the legal claiming window', () => {
    expect(claimingAdjustment(55)).toBeCloseTo(claimingAdjustment(62), 10);
    expect(claimingAdjustment(75)).toBeCloseTo(claimingAdjustment(70), 10);
  });

  it('increases monotonically with claim age', () => {
    let prev = 0;
    for (let age = 62; age <= 70; age += 0.25) {
      const adj = claimingAdjustment(age);
      expect(adj).toBeGreaterThan(prev);
      prev = adj;
    }
  });
});

describe('AIME projection', () => {
  it('equals monthly income when real wages are flat and the career is 35+ years', () => {
    // Working 22 to 65 at a flat $60k real: every one of the top 35 years is
    // $60k, so AIME is simply 60000/12.
    const aime = computeAIME({
      currentAge: 40,
      retirementAge: 65,
      income: 60_000,
      realWageGrowth: 0,
    });
    expect(aime).toBeCloseTo(5000, 6);
  });

  it('caps earnings at the taxable maximum', () => {
    const aime = computeAIME({
      currentAge: 40,
      retirementAge: 65,
      income: 10_000_000,
      realWageGrowth: 0,
    });
    expect(aime).toBeCloseTo(TAXABLE_MAXIMUM / 12, 6);
  });

  it('pads a short career with zeros', () => {
    // Working 22 to 42 is 20 years, but AIME still divides by 35 years.
    const aime = computeAIME({
      currentAge: 30,
      retirementAge: 42,
      income: 60_000,
      realWageGrowth: 0,
    });
    expect(aime).toBeCloseTo((60_000 * 20) / 35 / 12, 6);
  });

  it('keeps only the highest 35 years when real wages grow', () => {
    const grown = computeAIME({
      currentAge: 40,
      retirementAge: 65,
      income: 60_000,
      realWageGrowth: 0.01,
    });
    const flat = computeAIME({
      currentAge: 40,
      retirementAge: 65,
      income: 60_000,
      realWageGrowth: 0,
    });
    // Rising real wages means the best 35 years all sit at or above today's
    // income, so AIME must exceed the flat case.
    expect(grown).toBeGreaterThan(flat);
  });
});

describe('end-to-end benefit estimate', () => {
  const base = {
    currentAge: 35,
    retirementAge: 67,
    income: 80_000,
    realWageGrowth: 0,
    claimAge: 67,
    haircut: 0,
    piaOverride: null,
  };

  it('produces a benefit in a plausible range for a median earner', () => {
    const est = estimateSocialSecurity(base);
    // A steady $80k earner should land somewhere around $2.3–2.9K/month at FRA.
    expect(est.monthlyAtClaim).toBeGreaterThan(2000);
    expect(est.monthlyAtClaim).toBeLessThan(3200);
    expect(est.annual).toBeCloseTo(est.monthlyAtClaim * 12, 6);
  });

  it('applies the haircut multiplicatively', () => {
    const full = estimateSocialSecurity({ ...base, haircut: 0 });
    const cut = estimateSocialSecurity({ ...base, haircut: 0.25 });
    expect(cut.annual).toBeCloseTo(full.annual * 0.75, 6);
  });

  it('uses the override and skips the AIME estimate entirely', () => {
    const est = estimateSocialSecurity({ ...base, piaOverride: 3000 });
    expect(est.pia).toBe(3000);
    expect(est.aime).toBe(0);
    expect(est.monthlyAtClaim).toBeCloseTo(3000, 6);
  });

  it('scales the override by claim age', () => {
    const at62 = estimateSocialSecurity({ ...base, piaOverride: 3000, claimAge: 62 });
    expect(at62.monthlyAtClaim).toBeCloseTo(2100, 6);
  });

  it('caps a very high earner below the plausible maximum benefit', () => {
    const est = estimateSocialSecurity({ ...base, income: 1_000_000, claimAge: 70 });
    // Even a max earner claiming at 70 should not clear ~$6.5K/month in 2026 terms.
    expect(est.monthlyAtClaim).toBeLessThan(6500);
    expect(est.monthlyAtClaim).toBeGreaterThan(3500);
  });
});
