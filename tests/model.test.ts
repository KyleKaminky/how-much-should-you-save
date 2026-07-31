import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../src/lib/defaults';
import {
  computeResults,
  computeTarget,
  effectiveWithdrawalRate,
  realWageGrowth,
  simulate,
  solveRequiredSavingsRate,
} from '../src/lib/model';
import { resolveGlidePath, returnForAge, toReal } from '../src/lib/returns';
import type { Inputs } from '../src/lib/types';

function inputs(overrides: Partial<Inputs> = {}): Inputs {
  return { ...DEFAULT_INPUTS, ...overrides };
}

describe('accumulation matches the closed-form growing annuity', () => {
  // With a constant rate and begin-of-year contributions, the balance at
  // retirement has an exact algebraic form. If the loop disagrees, the loop is
  // wrong.
  const check = (r: number, g: number, n: number, p: number) => {
    const inflation = 0;
    const cfg = inputs({
      currentAge: 30,
      retirementAge: 30 + n,
      planToAge: 30 + n,
      income: 100_000,
      currentSavings: 0,
      inflation,
      wageGrowth: g,
      returnModel: 'constant',
      constantReturn: r,
      contributionTiming: 'annualBegin',
    });

    const actual = simulate(cfg, p).balanceAtRetirement;

    // Contribution in year t is p * I * (1+g)^t, deposited at the start of the
    // year, so it compounds for (n - t) years.
    const expected =
      Math.abs(r - g) < 1e-12
        ? p * 100_000 * n * Math.pow(1 + r, n) // singular case: r == g
        : p *
          100_000 *
          ((1 + r) * (Math.pow(1 + r, n) - Math.pow(1 + g, n))) /
          (r - g);

    expect(actual).toBeCloseTo(expected, 4);
  };

  it('handles the general case', () => check(0.08, 0.03, 30, 0.15));
  it('handles a short horizon', () => check(0.06, 0.02, 5, 0.25));
  it('handles zero wage growth', () => check(0.07, 0, 40, 0.1));
  it('handles the singular r == g case', () => check(0.04, 0.04, 25, 0.2));
});

describe('contribution timing', () => {
  const base = inputs({
    currentAge: 30,
    retirementAge: 60,
    returnModel: 'constant',
    constantReturn: 0.08,
  });

  it('orders begin > monthly > end', () => {
    const begin = simulate({ ...base, contributionTiming: 'annualBegin' }, 0.15)
      .balanceAtRetirement;
    const monthly = simulate({ ...base, contributionTiming: 'monthly' }, 0.15)
      .balanceAtRetirement;
    const end = simulate({ ...base, contributionTiming: 'annualEnd' }, 0.15)
      .balanceAtRetirement;

    expect(begin).toBeGreaterThan(monthly);
    expect(monthly).toBeGreaterThan(end);
  });

  it('compounds monthly contributions to exactly the annual rate', () => {
    // One year, no contributions: every timing must land on start * (1 + r).
    const oneYear = inputs({
      currentAge: 30,
      retirementAge: 31,
      planToAge: 31,
      currentSavings: 1000,
      inflation: 0,
      returnModel: 'constant',
      constantReturn: 0.08,
      contributionTiming: 'monthly',
    });
    expect(simulate(oneYear, 0).balanceAtRetirement).toBeCloseTo(1080, 6);
  });
});

describe('real vs nominal framing', () => {
  it('gives identical real balances whether inflation is priced in or out', () => {
    // Run A: no inflation, 5% real return, 1% real wage growth.
    const a = inputs({
      currentAge: 30,
      retirementAge: 60,
      planToAge: 60,
      inflation: 0,
      wageGrowth: 0.01,
      returnModel: 'constant',
      constantReturn: 0.05,
      currentSavings: 50_000,
    });

    // Run B: same real economics, expressed nominally with 3% inflation.
    const infl = 0.03;
    const b = inputs({
      ...a,
      inflation: infl,
      wageGrowth: (1 + 0.01) * (1 + infl) - 1,
      constantReturn: (1 + 0.05) * (1 + infl) - 1,
    });

    expect(simulate(b, 0.15).balanceAtRetirement).toBeCloseTo(
      simulate(a, 0.15).balanceAtRetirement,
      4,
    );
    expect(solveRequiredSavingsRate(b)).toBeCloseTo(solveRequiredSavingsRate(a), 8);
  });

  it('uses Fisher rather than naive subtraction', () => {
    // 8% nominal against 3% inflation is 4.854% real, not 5%.
    expect(toReal(0.08, 0.03)).toBeCloseTo(0.0485436893, 9);
    expect(toReal(0.08, 0.03)).not.toBeCloseTo(0.05, 4);
  });
});

describe('the solve', () => {
  it('lands exactly on the target', () => {
    const cfg = inputs({ currentAge: 32, retirementAge: 62, currentSavings: 75_000 });
    const rate = solveRequiredSavingsRate(cfg);
    const { target } = computeTarget(cfg);
    expect(simulate(cfg, rate).balanceAtRetirement).toBeCloseTo(target, 4);
  });

  it('returns exactly 0 when current savings already fund the goal', () => {
    const cfg = inputs({ currentAge: 50, retirementAge: 65, currentSavings: 5_000_000 });
    expect(solveRequiredSavingsRate(cfg)).toBe(0);
    expect(computeResults(cfg).alreadyFunded).toBe(true);
  });

  it('reports an unreachable goal when there are no years left to contribute', () => {
    const cfg = inputs({ currentAge: 65, retirementAge: 65, currentSavings: 1000 });
    expect(solveRequiredSavingsRate(cfg)).toBe(Infinity);
  });

  it('credits the employer match against the personal rate', () => {
    const without = solveRequiredSavingsRate(inputs({ employerMatch: 0 }));
    const withMatch = solveRequiredSavingsRate(inputs({ employerMatch: 0.04 }));
    expect(withMatch).toBeCloseTo(without - 0.04, 6);
  });
});

describe('monotonicity', () => {
  const rate = (o: Partial<Inputs>) => solveRequiredSavingsRate(inputs(o));

  it('rises with current age', () => {
    expect(rate({ currentAge: 40, retirementAge: 65 })).toBeGreaterThan(
      rate({ currentAge: 25, retirementAge: 65 }),
    );
  });

  it('falls as retirement is pushed out', () => {
    expect(rate({ retirementAge: 65 })).toBeLessThan(rate({ retirementAge: 55 }));
  });

  it('falls with more current savings', () => {
    expect(rate({ currentSavings: 300_000 })).toBeLessThan(rate({ currentSavings: 0 }));
  });

  it('falls with a higher assumed return', () => {
    expect(rate({ returnModel: 'constant', constantReturn: 0.1 })).toBeLessThan(
      rate({ returnModel: 'constant', constantReturn: 0.05 }),
    );
  });

  it('falls with a lower replacement ratio', () => {
    expect(rate({ replacementRatio: 0.6 })).toBeLessThan(rate({ replacementRatio: 0.9 }));
  });

  it('is independent of income when there are no fixed dollar amounts', () => {
    // With zero starting savings and Social Security off, the answer is a pure
    // ratio — doubling income must not move it.
    const a = rate({ income: 50_000, currentSavings: 0 });
    const b = rate({ income: 500_000, currentSavings: 0 });
    expect(a).toBeCloseTo(b, 10);
  });
});

describe('return models', () => {
  it('makes the glide path strictly more demanding than the flat rate', () => {
    // The flat model locks in today's (highest) rate for life; the glide path
    // lets it decay as you age, so it needs more savings.
    const flat = solveRequiredSavingsRate(inputs({ returnModel: 'flat' }));
    const glide = solveRequiredSavingsRate(inputs({ returnModel: 'glidePath' }));
    expect(glide).toBeGreaterThan(flat);
  });

  it('agrees with the flat model for a one-year horizon', () => {
    const cfg = { currentAge: 40, retirementAge: 41, planToAge: 41 };
    expect(solveRequiredSavingsRate(inputs({ ...cfg, returnModel: 'glidePath' }))).toBeCloseTo(
      solveRequiredSavingsRate(inputs({ ...cfg, returnModel: 'flat' })),
      10,
    );
  });
});

describe('withdrawal rate table', () => {
  it('follows the age bands', () => {
    expect(effectiveWithdrawalRate(inputs({ retirementAge: 40 }))).toBe(0.03);
    expect(effectiveWithdrawalRate(inputs({ retirementAge: 50 }))).toBe(0.035);
    expect(effectiveWithdrawalRate(inputs({ retirementAge: 55 }))).toBe(0.035);
    expect(effectiveWithdrawalRate(inputs({ retirementAge: 56 }))).toBe(0.04);
    expect(effectiveWithdrawalRate(inputs({ retirementAge: 65 }))).toBe(0.04);
    expect(effectiveWithdrawalRate(inputs({ retirementAge: 68 }))).toBe(0.045);
    expect(effectiveWithdrawalRate(inputs({ retirementAge: 73 }))).toBe(0.05);
    expect(effectiveWithdrawalRate(inputs({ retirementAge: 80 }))).toBe(0.055);
  });

  it('honours an explicit override', () => {
    expect(effectiveWithdrawalRate(inputs({ retirementAge: 40, withdrawalRateOverride: 0.05 })))
      .toBe(0.05);
  });
});

describe('Social Security in the target', () => {
  const withSS = (over: Partial<Inputs['socialSecurity']>, o: Partial<Inputs> = {}) =>
    inputs({
      ...o,
      socialSecurity: { ...DEFAULT_INPUTS.socialSecurity, enabled: true, ...over },
    });

  it('reduces the required rate', () => {
    const off = solveRequiredSavingsRate(inputs({ currentAge: 35, retirementAge: 67 }));
    const on = solveRequiredSavingsRate(withSS({}, { currentAge: 35, retirementAge: 67 }));
    expect(on).toBeLessThan(off);
  });

  it('charges a bridge when benefits start after retirement', () => {
    // Retire at 55, claim at 67: twelve years the portfolio must cover alone.
    const t = computeTarget(withSS({ claimAge: 67 }, { retirementAge: 55 }));

    expect(t.bridgeCost).toBeGreaterThan(0);
    // The bridge is a genuine add-on, not absorbed into the withdrawal-rate term.
    expect(t.target).toBeGreaterThan(t.portfolioSpend / t.withdrawalRate);
    expect(t.target).toBeCloseTo(t.portfolioSpend / t.withdrawalRate + t.bridgeCost, 6);
  });

  it('prices the bridge as the present value of the missing benefit years', () => {
    const cfg = withSS({ claimAge: 67, piaOverride: 3000 }, { retirementAge: 60 });
    const t = computeTarget(cfg);

    // Seven years, discounted at the real return prevailing at retirement.
    // Derived rather than hardcoded: the default decline now depends on the
    // retirement age, since the floor lands there.
    const g = resolveGlidePath(cfg.glidePath, cfg.retirementAge);
    const realReturn = toReal(returnForAge(cfg.currentAge, g), cfg.inflation);
    let expected = 0;
    for (let i = 0; i < 7; i++) expected += t.ssAnnual / Math.pow(1 + realReturn, i);

    expect(t.bridgeCost).toBeCloseTo(expected, 4);
  });

  it('grows the bridge the longer benefits are deferred past retirement', () => {
    const at62 = computeTarget(withSS({ claimAge: 62 }, { retirementAge: 55 }));
    const at67 = computeTarget(withSS({ claimAge: 67 }, { retirementAge: 55 }));
    expect(at67.bridgeCost).toBeGreaterThan(at62.bridgeCost);
  });

  it('still favours delaying the claim, bridge and all', () => {
    // Worth pinning because it is the counterintuitive result: claiming at 67
    // pays 100% of PIA against 70% at 62, and that larger lifetime benefit more
    // than pays for the twelve years the portfolio has to bridge.
    const at62 = computeTarget(withSS({ claimAge: 62 }, { retirementAge: 55 }));
    const at67 = computeTarget(withSS({ claimAge: 67 }, { retirementAge: 55 }));

    expect(at67.ssAnnual).toBeGreaterThan(at62.ssAnnual);
    expect(at67.target).toBeLessThan(at62.target);
  });

  it('charges no bridge when benefits start at retirement', () => {
    const t = computeTarget(withSS({ claimAge: 67 }, { retirementAge: 67 }));
    expect(t.bridgeCost).toBe(0);
  });

  it('raises the required rate as the assumed benefit cut deepens', () => {
    const light = solveRequiredSavingsRate(withSS({ haircut: 0 }, { retirementAge: 67 }));
    const heavy = solveRequiredSavingsRate(withSS({ haircut: 0.5 }, { retirementAge: 67 }));
    expect(heavy).toBeGreaterThan(light);
  });

  it('never lets benefits exceeding the need produce a negative target', () => {
    const t = computeTarget(
      withSS({ piaOverride: 20_000, haircut: 0 }, { income: 30_000, retirementAge: 67 }),
    );
    expect(t.portfolioSpend).toBe(0);
    expect(t.target).toBeGreaterThanOrEqual(0);
  });
});

describe('decumulation and depletion', () => {
  it('runs the portfolio down and reports survival to plan age', () => {
    const cfg = inputs({ currentAge: 30, retirementAge: 60, planToAge: 95 });
    const res = computeResults(cfg);
    const retired = res.simulation.rows.filter((r) => r.phase === 'retirement');

    expect(retired).toHaveLength(35);
    // A 3.5% withdrawal rate against a real return well above it should survive.
    expect(res.simulation.depletionAge).toBeNull();
  });

  it('flags depletion when the withdrawal rate is reckless', () => {
    const cfg = inputs({
      currentAge: 30,
      retirementAge: 60,
      planToAge: 95,
      withdrawalRateOverride: 0.12,
    });
    const res = computeResults(cfg);
    expect(res.simulation.depletionAge).not.toBeNull();
    expect(res.simulation.depletionAge!).toBeLessThan(95);
  });

  it('never reports a negative balance', () => {
    const cfg = inputs({ retirementAge: 55, planToAge: 100, withdrawalRateOverride: 0.15 });
    for (const row of computeResults(cfg).simulation.rows) {
      expect(row.endBalance).toBeGreaterThanOrEqual(0);
      expect(row.startBalance).toBeGreaterThanOrEqual(0);
    }
  });

  it('holds retirement spending flat in real terms', () => {
    const cfg = inputs({ currentAge: 30, retirementAge: 60, planToAge: 80 });
    const res = computeResults(cfg);
    const retired = res.simulation.rows.filter((r) => r.phase === 'retirement');
    const first = retired[0].spending;
    for (const row of retired.slice(0, 10)) {
      expect(row.spending).toBeCloseTo(first, 6);
    }
  });
});

describe('real wage growth', () => {
  it('is zero when wages track inflation exactly', () => {
    expect(realWageGrowth(inputs({ wageGrowth: 0.03, inflation: 0.03 }))).toBeCloseTo(0, 12);
  });
});

describe('the glide path affects returns and nothing else', () => {
  // Answering a direct question: switching return models must not move the
  // withdrawal rate, and must not move the target either — except through the
  // Social Security bridge, which is a present value and so legitimately
  // depends on the discount rate.
  const both = (o: Partial<Inputs> = {}) => ({
    flat: inputs({ ...o, returnModel: 'flat' }),
    glide: inputs({ ...o, returnModel: 'glidePath' }),
  });

  it('leaves the withdrawal rate untouched', () => {
    for (const retirementAge of [45, 55, 60, 67, 72]) {
      const { flat, glide } = both({ retirementAge });
      expect(effectiveWithdrawalRate(glide)).toBe(effectiveWithdrawalRate(flat));
    }
  });

  it('leaves the target untouched when there is no bridge', () => {
    const { flat, glide } = both();
    expect(computeTarget(glide).target).toBeCloseTo(computeTarget(flat).target, 6);
    expect(computeTarget(glide).portfolioSpend).toBeCloseTo(
      computeTarget(flat).portfolioSpend,
      6,
    );
  });

  it('moves the target only via the bridge discount when one exists', () => {
    const ss = { ...DEFAULT_INPUTS.socialSecurity, enabled: true, claimAge: 67 };
    const { flat, glide } = both({ retirementAge: 55, socialSecurity: ss });
    const tf = computeTarget(flat);
    const tg = computeTarget(glide);

    // Same spend to fund, same divisor — the whole difference is the bridge.
    expect(tg.portfolioSpend).toBeCloseTo(tf.portfolioSpend, 6);
    expect(tg.withdrawalRate).toBe(tf.withdrawalRate);
    expect(tg.target - tf.target).toBeCloseTo(tg.bridgeCost - tf.bridgeCost, 6);
    // Lower return at 55 discounts future benefits less, so the bridge costs more.
    expect(tg.bridgeCost).toBeGreaterThan(tf.bridgeCost);
  });

  it('does change the required rate and the drawdown', () => {
    const { flat, glide } = both();
    expect(solveRequiredSavingsRate(glide)).toBeGreaterThan(solveRequiredSavingsRate(flat));
  });
});

describe('the return curve is configurable', () => {
  const curve = (o: Partial<Inputs['glidePath']>, extra: Partial<Inputs> = {}) =>
    inputs({ ...extra, glidePath: { ...DEFAULT_INPUTS.glidePath, ...o } });
  const resolved = (cfg: Inputs) => resolveGlidePath(cfg.glidePath, cfg.retirementAge);

  it('reproduces the familiar curve when the floor is pinned at 65', () => {
    const g = resolveGlidePath({ ...DEFAULT_INPUTS.glidePath, floorAge: 65 }, 60);
    expect(g.declinePerYear).toBeCloseTo(0.001, 10);
    expect(returnForAge(20, g)).toBeCloseTo(0.1, 10);
    expect(returnForAge(30, g)).toBeCloseTo(0.09, 10);
    expect(returnForAge(65, g)).toBeCloseTo(0.055, 10);
  });

  it('lands the floor exactly on retirement by default', () => {
    for (const retirementAge of [55, 60, 65, 70]) {
      const g = resolveGlidePath(DEFAULT_INPUTS.glidePath, retirementAge);
      expect(g.floorAge).toBe(retirementAge);
      expect(returnForAge(retirementAge, g)).toBeCloseTo(0.055, 10);
      // And not before it.
      expect(returnForAge(retirementAge - 1, g)).toBeGreaterThan(0.055);
    }
  });

  it('derives a steeper decline for an earlier retirement', () => {
    const early = resolveGlidePath(DEFAULT_INPUTS.glidePath, 50);
    const late = resolveGlidePath(DEFAULT_INPUTS.glidePath, 70);
    expect(early.declinePerYear).toBeGreaterThan(late.declinePerYear);
    // Less time to de-risk means it has to happen faster.
    expect(early.declinePerYear).toBeCloseTo(0.045 / 30, 10);
    expect(late.declinePerYear).toBeCloseTo(0.045 / 50, 10);
  });

  it('honours a pinned floor age', () => {
    const g = resolved(curve({ floorAge: 80 }, { retirementAge: 60 }));
    expect(g.floorAge).toBe(80);
    expect(returnForAge(60, g)).toBeGreaterThan(0.055);
    expect(returnForAge(80, g)).toBeCloseTo(0.055, 10);
  });

  it('honours a different starting return', () => {
    const cfg = curve({ startReturn: 0.08 });
    expect(returnForAge(20, resolved(cfg))).toBeCloseTo(0.08, 10);
    expect(solveRequiredSavingsRate(cfg)).toBeGreaterThan(solveRequiredSavingsRate(inputs()));
  });

  it('honours a different floor', () => {
    const cfg = curve({ floorReturn: 0.07 });
    expect(returnForAge(90, resolved(cfg))).toBeCloseTo(0.07, 10);
  });

  it('honours a different anchor age', () => {
    const g = resolved(curve({ anchorAge: 30 }, { retirementAge: 60 }));
    expect(returnForAge(30, g)).toBeCloseTo(0.1, 10);
    expect(returnForAge(60, g)).toBeCloseTo(0.055, 10);
    expect(returnForAge(45, g)).toBeCloseTo((0.1 + 0.055) / 2, 10);
  });

  it('never exceeds the starting return below the anchor age', () => {
    const g = resolved(inputs());
    expect(returnForAge(5, g)).toBeCloseTo(0.1, 10);
    expect(returnForAge(-50, g)).toBeCloseTo(0.1, 10);
  });

  it('survives an inverted configuration where the floor exceeds the start', () => {
    const g = resolveGlidePath(
      { anchorAge: 20, startReturn: 0.05, floorAge: 65, floorReturn: 0.09 },
      60,
    );
    for (const age of [10, 20, 40, 70]) {
      const r = returnForAge(age, g);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeCloseTo(0.05, 10);
    }
  });

  it('survives a floor age at or before the anchor age', () => {
    const g = resolveGlidePath({ ...DEFAULT_INPUTS.glidePath, floorAge: 20 }, 60);
    expect(returnForAge(20, g)).toBeCloseTo(0.1, 10);
    expect(returnForAge(21, g)).toBeCloseTo(0.055, 10);
    expect(Number.isFinite(returnForAge(50, g))).toBe(true);
  });

  it('is flat when the floor equals the starting return', () => {
    const cfg = curve({ floorReturn: 0.1 });
    const g = resolved(cfg);
    expect(returnForAge(20, g)).toBeCloseTo(0.1, 10);
    expect(returnForAge(80, g)).toBeCloseTo(0.1, 10);
    expect(solveRequiredSavingsRate({ ...cfg, returnModel: 'glidePath' })).toBeCloseTo(
      solveRequiredSavingsRate({ ...cfg, returnModel: 'flat' }),
      10,
    );
  });

  it('leaves the custom-rate model unaffected by the curve', () => {
    const a = inputs({ returnModel: 'constant', constantReturn: 0.07 });
    const c = {
      ...curve({ startReturn: 0.02, floorReturn: 0.01 }),
      returnModel: 'constant' as const,
      constantReturn: 0.07,
    };
    expect(solveRequiredSavingsRate(c)).toBeCloseTo(solveRequiredSavingsRate(a), 10);
  });
});

describe('projecting your own savings rate', () => {
  const at = (rate: number | null, o: Partial<Inputs> = {}) =>
    computeResults(inputs({ ...o, savingsRateOverride: rate }));

  it('is absent until you supply a rate', () => {
    expect(at(null).yours).toBeNull();
  });

  it('never changes the required rate or the target', () => {
    const solved = at(null);
    for (const r of [0, 0.05, 0.25, 0.9]) {
      const mine = at(r);
      expect(mine.requiredSavingsRate).toBeCloseTo(solved.requiredSavingsRate, 12);
      expect(mine.targetNestEgg).toBeCloseTo(solved.targetNestEgg, 6);
      expect(mine.simulation.balanceAtRetirement).toBeCloseTo(
        solved.simulation.balanceAtRetirement,
        6,
      );
    }
  });

  it('lands exactly on the target when your rate is the required one', () => {
    const solved = at(null);
    const mine = at(solved.requiredSavingsRate);
    expect(mine.yours!.balanceAtRetirement).toBeCloseTo(mine.targetNestEgg, 4);
    expect(mine.yours!.surplus).toBeCloseTo(0, 4);
    expect(mine.yours!.shortfallInRate).toBeCloseTo(0, 10);
    expect(mine.yours!.onTrack).toBe(true);
  });

  it('reports a shortfall when you save too little', () => {
    const solved = at(null);
    const mine = at(solved.requiredSavingsRate / 2);
    expect(mine.yours!.onTrack).toBe(false);
    expect(mine.yours!.surplus).toBeLessThan(0);
    expect(mine.yours!.shortfallInRate).toBeCloseTo(solved.requiredSavingsRate / 2, 8);
  });

  it('reports a surplus when you save more than enough', () => {
    const solved = at(null);
    const mine = at(solved.requiredSavingsRate * 1.5);
    expect(mine.yours!.onTrack).toBe(true);
    expect(mine.yours!.surplus).toBeGreaterThan(0);
    expect(mine.yours!.shortfallInRate).toBe(0);
  });

  it('round-trips the sustainable spending back to the goal at the required rate', () => {
    // Inverting the target formula must return exactly the spending the target
    // was sized for — including through the Social Security bridge.
    const ss = { ...DEFAULT_INPUTS.socialSecurity, enabled: true, claimAge: 67 };
    for (const o of [{}, { retirementAge: 67, socialSecurity: ss }, { retirementAge: 55, socialSecurity: ss }]) {
      const solved = computeResults(inputs(o));
      const mine = computeResults(inputs({ ...o, savingsRateOverride: solved.requiredSavingsRate }));
      expect(mine.yours!.sustainableSpending).toBeCloseTo(mine.firstYearSpending, 3);
      expect(mine.yours!.sustainableReplacement).toBeCloseTo(inputs(o).replacementRatio, 6);
    }
  });

  it('shows a lower rate depleting the portfolio earlier', () => {
    const solved = at(null);
    const half = at(solved.requiredSavingsRate * 0.5);
    expect(half.yours!.simulation.depletionAge).not.toBeNull();
    // The required path survives; yours does not.
    expect(solved.simulation.depletionAge).toBeNull();
  });

  it('grows the balance monotonically with your rate', () => {
    let prev = -1;
    for (const r of [0, 0.05, 0.1, 0.2, 0.4]) {
      const b = at(r).yours!.balanceAtRetirement;
      expect(b).toBeGreaterThan(prev);
      prev = b;
    }
  });

  it('counts the employer match on your path too', () => {
    const withMatch = at(0.1, { employerMatch: 0.05 }).yours!;
    const without = at(0.15, { employerMatch: 0 }).yours!;
    // 10% personal + 5% match invests the same as 15% personal.
    expect(withMatch.balanceAtRetirement).toBeCloseTo(without.balanceAtRetirement, 6);
    expect(withMatch.totalRate).toBeCloseTo(0.15, 10);
    // But the monthly figure is what *you* put in, not the total.
    expect(withMatch.monthly).toBeCloseTo((0.1 * DEFAULT_INPUTS.income) / 12, 6);
  });

  it('treats a zero rate as a real projection, not an absent one', () => {
    const mine = at(0);
    expect(mine.yours).not.toBeNull();
    expect(mine.yours!.rate).toBe(0);
    expect(mine.yours!.balanceAtRetirement).toBeCloseTo(0, 6);
  });

  it('clamps a negative rate to zero rather than inventing withdrawals', () => {
    expect(at(-0.2).yours!.rate).toBe(0);
  });
});

describe('sustainability check', () => {
  const at = (o: Partial<Inputs> = {}) => computeResults(inputs(o)).sustainability;

  it('compares the terminal real return against the withdrawal rate', () => {
    const s = at({ retirementAge: 60, withdrawalRateOverride: 0.04 });
    expect(s.withdrawalRate).toBe(0.04);
    expect(s.marginTerminal).toBeCloseTo(s.realTerminal - 0.04, 12);
    expect(s.sustainable).toBe(s.realTerminal >= 0.04);
  });

  it('prices the break-even balance as spending x (1+r)/r', () => {
    const cfg = inputs({ withdrawalRateOverride: 0.04 });
    const r = computeResults(cfg);
    const s = r.sustainability;
    const expected = (r.firstYearSpending * (1 + s.realTerminal)) / s.realTerminal;
    expect(s.breakEvenTerminal).toBeCloseTo(expected, 4);
  });

  it('inverts Fisher to state the nominal return a withdrawal rate needs', () => {
    const s = at({ withdrawalRateOverride: 0.035, inflation: 0.03 });
    // 3.5% real against 3% inflation needs 6.605% nominal, not 6.5%.
    expect(s.requiredNominalReturn).toBeCloseTo(1.035 * 1.03 - 1, 12);
    expect(s.requiredNominalReturn).toBeCloseTo(0.06605, 5);
  });

  it('uses the floor as the terminal rate on a glide path', () => {
    const s = at({ returnModel: 'glidePath', retirementAge: 60 });
    expect(s.nominalTerminal).toBeCloseTo(DEFAULT_INPUTS.glidePath.floorReturn, 10);
    // The rate at retirement is the floor too, since the floor lands there.
    expect(s.nominalAtRetirement).toBeCloseTo(s.nominalTerminal, 10);
  });

  it('keeps the terminal rate above the floor when the floor is pinned later', () => {
    const s = at({
      returnModel: 'glidePath',
      retirementAge: 55,
      glidePath: { ...DEFAULT_INPUTS.glidePath, floorAge: 85 },
    });
    expect(s.nominalAtRetirement).toBeGreaterThan(s.nominalTerminal);
    expect(s.marginAtRetirement).toBeGreaterThan(s.marginTerminal);
  });

  it('flags a 3.5% withdrawal against a 5.5% floor as unsustainable', () => {
    // The case that confused us: 5.5% nominal is 2.43% real, well under 3.5%.
    const s = at({
      returnModel: 'glidePath',
      retirementAge: 55,
      withdrawalRateOverride: 0.035,
    });
    expect(s.realTerminal).toBeCloseTo(0.0243, 3);
    expect(s.sustainable).toBe(false);
    expect(s.marginTerminal).toBeLessThan(0);
    // And it names the fix: you would need a 6.6% nominal floor.
    expect(s.requiredNominalReturn).toBeCloseTo(0.06605, 4);
  });

  it('clears the check once the floor is raised enough', () => {
    const s = at({
      returnModel: 'glidePath',
      retirementAge: 55,
      withdrawalRateOverride: 0.035,
      glidePath: { ...DEFAULT_INPUTS.glidePath, floorReturn: 0.07 },
    });
    expect(s.sustainable).toBe(true);
    expect(s.marginTerminal).toBeGreaterThan(0);
  });

  it('treats a zero or negative real return as needing an infinite balance', () => {
    const s = at({ returnModel: 'constant', constantReturn: 0.01, inflation: 0.03 });
    expect(s.realTerminal).toBeLessThan(0);
    expect(s.breakEvenTerminal).toBe(Infinity);
    expect(s.sustainable).toBe(false);
  });
});
