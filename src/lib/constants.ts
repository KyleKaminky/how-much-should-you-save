/**
 * Published figures this calculator depends on. Everything here has a source and
 * a date so it can be re-checked; the SSA values change every year.
 */

// ---------------------------------------------------------------------------
// Social Security — 2026 figures
// Source: SSA, https://www.ssa.gov/oact/cola/bendpoints.html and /cbb.html
// Verified 2026-07-31.
// ---------------------------------------------------------------------------

export const SSA_YEAR = 2026;

/** Monthly AIME thresholds where the PIA replacement rate steps down. */
export const PIA_BEND_POINTS = [1286, 7749] as const;

/** Replacement factors applied to each AIME bracket. Fixed in law. */
export const PIA_FACTORS = [0.9, 0.32, 0.15] as const;

/** Annual earnings above this are neither taxed for SS nor counted toward benefits. */
export const TAXABLE_MAXIMUM = 184_500;

/** Full retirement age for anyone born 1960 or later. */
export const FULL_RETIREMENT_AGE = 67;

export const MIN_CLAIM_AGE = 62;
export const MAX_CLAIM_AGE = 70;

/** AIME averages the highest 35 years of indexed earnings, hence 420 months. */
export const AIME_MONTHS = 420;
export const AIME_YEARS = 35;

/**
 * Default assumed benefit cut. The trust fund is projected to deplete in 2035;
 * absent legislation, benefits fall to what incoming payroll tax revenue supports,
 * roughly a 25% reduction.
 */
export const DEFAULT_SS_HAIRCUT = 0.25;

// ---------------------------------------------------------------------------
// Planning guidelines
//
// These are widely-used retirement-planning heuristics, not proprietary
// formulas: an age-banded safe withdrawal rate, a declining assumed return, and
// an 80% income replacement target. They are the app's starting point and every
// one of them is editable in the UI.
// ---------------------------------------------------------------------------

/**
 * Safe withdrawal rate by retirement age. Retire earlier and the money has to
 * last longer, so a smaller share of it is safe to draw each year.
 */
export const WITHDRAWAL_RATE_TABLE: ReadonlyArray<{
  maxAge: number;
  rate: number;
  label: string;
}> = [
  { maxAge: 44, rate: 0.03, label: 'Under 45' },
  { maxAge: 55, rate: 0.035, label: '45\u201355' },
  { maxAge: 65, rate: 0.04, label: '56\u201365' },
  { maxAge: 70, rate: 0.045, label: '66\u201370' },
  { maxAge: 75, rate: 0.05, label: '71\u201375' },
  { maxAge: Infinity, rate: 0.055, label: 'Over 75' },
];

/** Safe withdrawal rate for a given retirement age, per the table above. */
export function withdrawalRateForAge(retirementAge: number): number {
  const band = WITHDRAWAL_RATE_TABLE.find((b) => retirementAge <= b.maxAge);
  return band ? band.rate : 0.055;
}

/**
 * Assumed-return curve: 10% at age 20, falling 0.1%/yr to a 5.5% floor \u2014 which
 * it reaches at exactly 65. A stand-in for a declining-equity glide path, and
 * fully configurable in the UI.
 */
export const DEFAULT_GLIDE_PATH = {
  anchorAge: 20,
  startReturn: 0.1,
  declinePerYear: 0.001,
  floorReturn: 0.055,
} as const;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_REPLACEMENT_RATIO = 0.8;
export const DEFAULT_INFLATION = 0.03;
export const DEFAULT_WAGE_GROWTH = 0.03;

/**
 * The conventional assumption set, used by the quick-reference grid so it stays
 * a stable comparison surface regardless of what the user has changed.
 */
export const REFERENCE_ASSUMPTIONS = {
  replacementRatio: 0.8,
  inflation: 0.03,
  wageGrowth: 0.03,
  withdrawalRate: 0.04,
  returnModel: 'flat' as const,
  contributionTiming: 'annualBegin' as const,
};

/** Retirement ages shown as columns in the quick-reference grid. */
export const REFERENCE_TARGET_AGES = [45, 50, 55, 60, 65] as const;

/** Current ages shown as rows in the quick-reference grid. */
export const REFERENCE_CURRENT_AGES = Array.from({ length: 21 }, (_, i) => 20 + i);
