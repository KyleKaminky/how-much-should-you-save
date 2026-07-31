import {
  AIME_MONTHS,
  AIME_YEARS,
  FULL_RETIREMENT_AGE,
  MAX_CLAIM_AGE,
  MIN_CLAIM_AGE,
  PIA_BEND_POINTS,
  PIA_FACTORS,
  TAXABLE_MAXIMUM,
} from './constants';

/** Age we assume a full-time earnings record begins, for the AIME projection. */
export const ASSUMED_CAREER_START_AGE = 22;

export function clampClaimAge(age: number): number {
  return Math.min(MAX_CLAIM_AGE, Math.max(MIN_CLAIM_AGE, age));
}

/**
 * Average Indexed Monthly Earnings.
 *
 * Everything here is in today's dollars, which is what makes this tractable: SSA
 * indexes both the wage base and the bend points to the national Average Wage
 * Index, so in real terms they hold still. Under the default assumption that
 * wage growth equals inflation, real earnings are simply flat across the career.
 *
 * Earnings before today are projected backward from current income at the real
 * wage-growth rate — an approximation, since we have no actual earnings record.
 */
export function computeAIME(params: {
  currentAge: number;
  retirementAge: number;
  income: number;
  realWageGrowth: number;
  careerStartAge?: number;
}): number {
  const {
    currentAge,
    retirementAge,
    income,
    realWageGrowth,
    careerStartAge = ASSUMED_CAREER_START_AGE,
  } = params;

  const startAge = Math.min(careerStartAge, currentAge);
  const earnings: number[] = [];

  for (let age = startAge; age < retirementAge; age++) {
    const real = income * Math.pow(1 + realWageGrowth, age - currentAge);
    earnings.push(Math.min(Math.max(0, real), TAXABLE_MAXIMUM));
  }

  // Highest 35 years; a shorter career is padded with zeros, which is how SSA
  // actually treats it.
  const top = earnings.sort((a, b) => b - a).slice(0, AIME_YEARS);
  const total = top.reduce((sum, e) => sum + e, 0);

  return total / AIME_MONTHS;
}

/** Primary Insurance Amount: the monthly benefit at full retirement age. */
export function computePIA(aime: number): number {
  const [bend1, bend2] = PIA_BEND_POINTS;
  const [f1, f2, f3] = PIA_FACTORS;

  const tier1 = Math.min(aime, bend1);
  const tier2 = Math.max(0, Math.min(aime, bend2) - bend1);
  const tier3 = Math.max(0, aime - bend2);

  return f1 * tier1 + f2 * tier2 + f3 * tier3;
}

/**
 * Multiplier applied to the PIA for claiming before or after full retirement age.
 *
 * Early: 5/9 of 1% per month for the first 36 months, then 5/12 of 1% per month.
 * Late: delayed retirement credits of 8%/yr (2/3 of 1% per month) up to age 70.
 *
 * Claiming at 62 gives 70%; claiming at 70 gives 124%.
 */
export function claimingAdjustment(claimAge: number): number {
  const age = clampClaimAge(claimAge);
  const months = Math.round((age - FULL_RETIREMENT_AGE) * 12);

  if (months === 0) return 1;

  if (months < 0) {
    const early = -months;
    const first = Math.min(early, 36);
    const rest = Math.max(0, early - 36);
    return 1 - (first * 5) / 900 - (rest * 5) / 1200;
  }

  return 1 + (months * 2) / 300;
}

export interface SocialSecurityEstimate {
  /** Monthly AIME in today's dollars. Zero when a PIA override is supplied. */
  aime: number;
  /** Monthly benefit at full retirement age, before claiming adjustment. */
  pia: number;
  /** Monthly benefit at the chosen claim age, before the haircut. */
  monthlyAtClaim: number;
  /** Annual benefit at the chosen claim age, after the haircut. Today's dollars. */
  annual: number;
  claimAge: number;
}

/**
 * Full projected benefit: estimate (or accept) the PIA, adjust for claim age,
 * then apply the assumed benefit cut.
 */
export function estimateSocialSecurity(params: {
  currentAge: number;
  retirementAge: number;
  income: number;
  realWageGrowth: number;
  claimAge: number;
  haircut: number;
  piaOverride: number | null;
}): SocialSecurityEstimate {
  const claimAge = clampClaimAge(params.claimAge);

  const useOverride = params.piaOverride !== null && params.piaOverride >= 0;
  const aime = useOverride
    ? 0
    : computeAIME({
        currentAge: params.currentAge,
        retirementAge: params.retirementAge,
        income: params.income,
        realWageGrowth: params.realWageGrowth,
      });

  const pia = useOverride ? (params.piaOverride as number) : computePIA(aime);
  const monthlyAtClaim = pia * claimingAdjustment(claimAge);
  const annual = monthlyAtClaim * 12 * (1 - params.haircut);

  return { aime, pia, monthlyAtClaim, annual, claimAge };
}
