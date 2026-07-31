/** Which assumed-return curve to use. See `returns.ts` for the formulas. */
export type ReturnModel = 'flat' | 'glidePath' | 'constant';

/**
 * The declining-return curve both age-based models draw on. Defaults to a
 * conventional assumption — 10% at 20, falling 0.1%/yr, floored at 5.5% — but
 * every knob is editable, because none of these numbers are laws of nature.
 */
export interface GlidePathConfig {
  /** Age at which `startReturn` applies. */
  anchorAge: number;
  /** Nominal annual return at `anchorAge`. */
  startReturn: number;
  /**
   * Age at which the curve reaches `floorReturn`, i.e. when de-risking is done.
   * `null` means "whenever I retire", which is both the sensible default and
   * how target-date funds actually work — the glide completes at the target
   * date. Pinning it to a number decouples the two deliberately.
   */
  floorAge: number | null;
  /** Floor the curve never falls below. */
  floorReturn: number;
}

/** A glide path with `floorAge` resolved and the annual decline derived. */
export interface ResolvedGlidePath {
  anchorAge: number;
  startReturn: number;
  floorAge: number;
  floorReturn: number;
  /** Derived: (startReturn - floorReturn) / (floorAge - anchorAge). */
  declinePerYear: number;
}

/** How contributions are assumed to land during the year. */
export type ContributionTiming = 'monthly' | 'annualBegin' | 'annualEnd';

export interface SocialSecurityInputs {
  enabled: boolean;
  /** Age benefits start. Clamped to [62, 70]. */
  claimAge: number;
  /**
   * Fraction by which the projected benefit is cut, e.g. 0.25 for the
   * post-trust-fund-depletion scenario. 0 assumes benefits are paid in full.
   */
  haircut: number;
  /**
   * Monthly PIA in today's dollars, taken from the user's ssa.gov statement.
   * When null, the PIA is estimated from income via the bend-point formula.
   */
  piaOverride: number | null;
}

export interface Inputs {
  currentAge: number;
  retirementAge: number;
  /** Age through which the portfolio must last, for the depletion check. */
  planToAge: number;

  /** Gross annual income today, nominal dollars. */
  income: number;
  /** Current invested retirement balance, nominal dollars. */
  currentSavings: number;
  /** Employer contribution as a fraction of income, e.g. 0.04. Counts toward the target. */
  employerMatch: number;

  /** Fraction of pre-retirement income to replace, e.g. 0.80. */
  replacementRatio: number;
  /** Nominal annual inflation, e.g. 0.03. */
  inflation: number;
  /** Nominal annual wage growth, e.g. 0.03. */
  wageGrowth: number;

  returnModel: ReturnModel;
  /** Nominal annual return used when returnModel is 'constant'. */
  constantReturn: number;
  /** Shape of the curve used by the 'flat' and 'glidePath' models. */
  glidePath: GlidePathConfig;

  /** Nominal annual withdrawal rate. When null, looked up from the age-based table. */
  withdrawalRateOverride: number | null;

  /**
   * The rate you actually invest, as a fraction of gross income, excluding any
   * employer match. When null the calculator solves for the required rate and
   * shows only that path; when set, both paths are projected side by side.
   */
  savingsRateOverride: number | null;

  contributionTiming: ContributionTiming;
  socialSecurity: SocialSecurityInputs;
}

/** One row of the projection. All dollar fields are in today's (real) dollars. */
export interface YearRow {
  age: number;
  /** Years from today. */
  year: number;
  /** Balance at the start of the year, before contributions and growth. */
  startBalance: number;
  /** Balance at the end of the year. */
  endBalance: number;
  /** Gross income during the year. Zero once retired. */
  income: number;
  /** Total invested during the year, personal plus employer. Zero once retired. */
  contribution: number;
  /** Total drawn from the portfolio during the year. Zero before retirement. */
  withdrawal: number;
  /** Social Security received during the year. */
  socialSecurity: number;
  /** Total spending funded during the year, portfolio plus Social Security. */
  spending: number;
  /** Nominal return applied during the year, for display. */
  nominalReturn: number;
  phase: 'accumulation' | 'retirement';
}

export interface SimulationResult {
  rows: YearRow[];
  /** Portfolio value at the moment of retirement, real dollars. */
  balanceAtRetirement: number;
  /** Age at which the portfolio hits zero, or null if it survives to planToAge. */
  depletionAge: number | null;
}

export interface Results {
  /** Fraction of gross income the user must invest personally. */
  requiredSavingsRate: number;
  /** requiredSavingsRate plus employerMatch — the "total invested" figure. */
  requiredTotalRate: number;
  /** Personal dollars per month in today's dollars. */
  requiredMonthly: number;

  /** Portfolio needed at retirement, real dollars. */
  targetNestEgg: number;
  /** Real dollars the withdrawal-rate target must fund each year. */
  portfolioSpend: number;
  /** Total real spending in the first year of retirement. */
  firstYearSpending: number;
  /** Real annual Social Security benefit once claimed, after the haircut. */
  socialSecurityAnnual: number;
  /** Extra target needed to bridge retirement to the Social Security claim age. */
  bridgeCost: number;

  /** Gross income in the final working year, real dollars. */
  finalIncome: number;
  withdrawalRate: number;
  /** Nominal return in the first projected year, for display. */
  firstYearReturn: number;

  /** Projection at the required rate. */
  simulation: SimulationResult;
  /** True when current savings alone already fund the target. */
  alreadyFunded: boolean;

  /** Set only when you supplied your own savings rate. */
  yours: YourPath | null;

  /** Whether the withdrawal rate and the assumed return can coexist. */
  sustainability: Sustainability;
}

/**
 * The consistency check between two independently-set inputs: how much you draw
 * each year, and how much the portfolio is assumed to earn.
 */
export interface Sustainability {
  withdrawalRate: number;

  /** Nominal and real return in the first year of retirement. */
  nominalAtRetirement: number;
  realAtRetirement: number;
  /** Nominal and real return once the curve has settled at its floor. */
  nominalTerminal: number;
  realTerminal: number;

  /** Real return minus withdrawal rate. Negative means the portfolio drains. */
  marginAtRetirement: number;
  marginTerminal: number;

  /** Balance at which growth exactly covers the withdrawal. */
  breakEvenAtRetirement: number;
  breakEvenTerminal: number;

  /** Nominal return needed for this withdrawal rate to hold its real value. */
  requiredNominalReturn: number;

  /** True when the terminal real return covers the withdrawal rate. */
  sustainable: boolean;
  /** Age the glide path reaches its floor. */
  floorAge: number;
}

/** What your own savings rate actually buys, measured against the same target. */
export interface YourPath {
  /** Your personal rate, excluding employer match. */
  rate: number;
  /** Your rate plus the employer match. */
  totalRate: number;
  /** Your dollars per month in today's dollars. */
  monthly: number;

  /** Projection at your rate. */
  simulation: SimulationResult;
  /** Portfolio at retirement on your path, real dollars. */
  balanceAtRetirement: number;
  /** balanceAtRetirement − targetNestEgg. Negative is a shortfall. */
  surplus: number;

  /** Real annual spending your path actually sustains, Social Security included. */
  sustainableSpending: number;
  /** sustainableSpending as a fraction of final working income. */
  sustainableReplacement: number;
  /** Percentage points of savings rate still missing. Zero when you are on track. */
  shortfallInRate: number;
  onTrack: boolean;
}
