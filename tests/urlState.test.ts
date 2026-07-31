import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../src/lib/defaults';
import { computeResults } from '../src/lib/model';
import { decodeInputs, encodeInputs } from '../src/lib/urlState';
import type { Inputs } from '../src/lib/types';

const round = (inputs: Inputs) => decodeInputs(encodeInputs(inputs));

describe('URL round-trip', () => {
  it('writes nothing for the default scenario', () => {
    expect(encodeInputs(DEFAULT_INPUTS)).toBe('');
  });

  it('returns the defaults for an empty query', () => {
    expect(decodeInputs('')).toEqual(DEFAULT_INPUTS);
    expect(decodeInputs('?')).toEqual(DEFAULT_INPUTS);
  });

  it('preserves a fully customised scenario exactly', () => {
    const custom: Inputs = {
      currentAge: 32,
      retirementAge: 58,
      planToAge: 97,
      income: 210_000,
      currentSavings: 185_000,
      employerMatch: 0.045,
      replacementRatio: 0.65,
      inflation: 0.025,
      wageGrowth: 0.035,
      returnModel: 'glidePath',
      constantReturn: 0.072,
      glidePath: {
        anchorAge: 25,
        startReturn: 0.095,
        declinePerYear: 0.0015,
        floorReturn: 0.045,
      },
      withdrawalRateOverride: 0.037,
      savingsRateOverride: 0.185,
      contributionTiming: 'annualEnd',
      socialSecurity: {
        enabled: true,
        claimAge: 70,
        haircut: 0.35,
        piaOverride: 3125,
      },
    };

    expect(round(custom)).toEqual(custom);
  });

  it('keeps a typical link short and readable', () => {
    const qs = encodeInputs({
      ...DEFAULT_INPUTS,
      currentAge: 32,
      income: 210_000,
      replacementRatio: 0.65,
    });
    expect(qs).toBe('age=32&inc=210000&repl=0.65');
  });

  it('round-trips each field on its own', () => {
    const cases: Array<Partial<Inputs>> = [
      { currentAge: 41 },
      { retirementAge: 67 },
      { planToAge: 100 },
      { income: 87_500 },
      { currentSavings: 12_345 },
      { employerMatch: 0.06 },
      { replacementRatio: 0.55 },
      { inflation: 0.021 },
      { wageGrowth: 0.045 },
      { returnModel: 'constant' },
      { returnModel: 'glidePath' },
      { constantReturn: 0.065 },
      { withdrawalRateOverride: 0.032 },
      { savingsRateOverride: 0 },
      { savingsRateOverride: 0.25 },
      { contributionTiming: 'annualBegin' },
      { contributionTiming: 'annualEnd' },
    ];
    for (const patch of cases) {
      const cfg = { ...DEFAULT_INPUTS, ...patch };
      expect(round(cfg), JSON.stringify(patch)).toEqual(cfg);
    }
  });

  it('round-trips the nested glide path and Social Security objects', () => {
    const cfg: Inputs = {
      ...DEFAULT_INPUTS,
      glidePath: { anchorAge: 30, startReturn: 0.08, declinePerYear: 0.002, floorReturn: 0.04 },
      socialSecurity: { enabled: true, claimAge: 62, haircut: 0, piaOverride: null },
    };
    expect(round(cfg)).toEqual(cfg);
  });

  it('distinguishes an explicit null override from a zero one', () => {
    const none = { ...DEFAULT_INPUTS, withdrawalRateOverride: null, savingsRateOverride: null };
    const zero = { ...DEFAULT_INPUTS, withdrawalRateOverride: null, savingsRateOverride: 0 };

    expect(round(none).savingsRateOverride).toBeNull();
    expect(round(zero).savingsRateOverride).toBe(0);
    // A 0% savings rate is a real scenario and must survive the link.
    expect(encodeInputs(zero)).toContain('sr=0');
  });

  it('keeps Social Security off explicitly when the default is off', () => {
    // Turning it on then off again must not silently inherit a future default flip.
    const on = { ...DEFAULT_INPUTS, socialSecurity: { ...DEFAULT_INPUTS.socialSecurity, enabled: true } };
    expect(round(on).socialSecurity.enabled).toBe(true);
    expect(round(DEFAULT_INPUTS).socialSecurity.enabled).toBe(false);
  });

  it('does not leak float noise into the URL', () => {
    const cfg = { ...DEFAULT_INPUTS, employerMatch: 0.1 + 0.2 };
    expect(encodeInputs(cfg)).toBe('match=0.3');
  });

  it('degrades to defaults on a malformed link rather than breaking', () => {
    const bad = decodeInputs('?age=abc&ret=&inc=NaN&rm=bogus&ct=nonsense&ss=maybe&repl=');
    expect(bad.currentAge).toBe(DEFAULT_INPUTS.currentAge);
    expect(bad.retirementAge).toBe(DEFAULT_INPUTS.retirementAge);
    expect(bad.income).toBe(DEFAULT_INPUTS.income);
    expect(bad.returnModel).toBe(DEFAULT_INPUTS.returnModel);
    expect(bad.contributionTiming).toBe(DEFAULT_INPUTS.contributionTiming);
    expect(bad.replacementRatio).toBe(DEFAULT_INPUTS.replacementRatio);
    // 'maybe' is not '1', so it reads as off.
    expect(bad.socialSecurity.enabled).toBe(false);
  });

  it('ignores unknown parameters', () => {
    const cfg = decodeInputs('?age=45&utm_source=twitter&fbclid=xyz');
    expect(cfg.currentAge).toBe(45);
    expect(cfg.income).toBe(DEFAULT_INPUTS.income);
  });

  it('produces the same results after a round-trip', () => {
    const cfg: Inputs = {
      ...DEFAULT_INPUTS,
      currentAge: 32,
      income: 210_000,
      replacementRatio: 0.65,
      returnModel: 'glidePath',
      savingsRateOverride: 0.15,
      socialSecurity: { enabled: true, claimAge: 67, haircut: 0.25, piaOverride: null },
    };
    const a = computeResults(cfg);
    const b = computeResults(round(cfg));

    expect(b.requiredSavingsRate).toBeCloseTo(a.requiredSavingsRate, 12);
    expect(b.targetNestEgg).toBeCloseTo(a.targetNestEgg, 6);
    expect(b.yours!.balanceAtRetirement).toBeCloseTo(a.yours!.balanceAtRetirement, 6);
  });
});
