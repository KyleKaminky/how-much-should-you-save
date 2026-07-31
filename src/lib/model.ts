import { withdrawalRateForAge } from './constants';
import { glidePathFor, returnFnFor, returnForAge, toReal } from './returns';
import { estimateSocialSecurity } from './socialSecurity';
import type { Inputs, Results, SimulationResult, Sustainability, YearRow, YourPath } from './types';

/**
 * The whole model runs in real (today's) dollars.
 *
 * The conventional version of this calculation gets away without committing to a
 * frame because it assumes inflation and wage growth are both 3%, so they
 * cancel. The moment those become independent inputs, "replace 80% of your
 * income in today's dollars" is ambiguous unless you pick one. Working in real
 * terms also means the retirement spending target is a flat line rather than an
 * exponential, which makes the chart legible.
 */

/** Real return in projection year `yearIndex`. */
function realReturnAt(inputs: Inputs, yearIndex: number): number {
  return toReal(returnFnFor(inputs)(yearIndex), inputs.inflation);
}

/** Real wage growth — the rate at which income outpaces (or trails) inflation. */
export function realWageGrowth(inputs: Inputs): number {
  return toReal(inputs.wageGrowth, inputs.inflation);
}

export function effectiveWithdrawalRate(inputs: Inputs): number {
  return inputs.withdrawalRateOverride ?? withdrawalRateForAge(inputs.retirementAge);
}

/** Gross income in projection year `yearIndex`, real dollars. */
function incomeAt(inputs: Inputs, yearIndex: number): number {
  return inputs.income * Math.pow(1 + realWageGrowth(inputs), yearIndex);
}

/** Grow a balance across one year, adding `contribution` at the chosen timing. */
function accumulateYear(
  startBalance: number,
  contribution: number,
  realReturn: number,
  timing: Inputs['contributionTiming'],
): number {
  switch (timing) {
    case 'annualBegin':
      return (startBalance + contribution) * (1 + realReturn);
    case 'annualEnd':
      return startBalance * (1 + realReturn) + contribution;
    case 'monthly': {
      // Convert to an equivalent monthly rate rather than dividing by 12, so the
      // year still compounds to exactly (1 + realReturn).
      const monthlyRate = Math.pow(1 + realReturn, 1 / 12) - 1;
      const monthly = contribution / 12;
      let balance = startBalance;
      for (let m = 0; m < 12; m++) {
        balance = (balance + monthly) * (1 + monthlyRate);
      }
      return balance;
    }
  }
}

/**
 * Projects the portfolio from today through `planToAge` at a given personal
 * savings rate. Employer match is added on top.
 */
export function simulate(inputs: Inputs, savingsRate: number): SimulationResult {
  const rows: YearRow[] = [];
  const timing = inputs.contributionTiming;
  const ss = socialSecurityAnnual(inputs);

  const accumulationYears = Math.max(0, inputs.retirementAge - inputs.currentAge);
  const totalYears = Math.max(accumulationYears, inputs.planToAge - inputs.currentAge);

  // Retirement spending is a flat line in real terms: a fixed share of the
  // final working year's income, held constant in today's purchasing power.
  const finalIncome = incomeAt(inputs, accumulationYears);
  const spendingNeed = inputs.replacementRatio * finalIncome;

  let balance = inputs.currentSavings;
  let balanceAtRetirement = inputs.currentSavings;
  let depletionAge: number | null = null;

  for (let year = 0; year < totalYears; year++) {
    const age = inputs.currentAge + year;
    const nominalReturn = returnFnFor(inputs)(year);
    const realReturn = realReturnAt(inputs, year);
    const startBalance = balance;

    if (year < accumulationYears) {
      const income = incomeAt(inputs, year);
      const contribution = (savingsRate + inputs.employerMatch) * income;
      balance = accumulateYear(startBalance, contribution, realReturn, timing);

      rows.push({
        age,
        year,
        startBalance,
        endBalance: balance,
        income,
        contribution,
        withdrawal: 0,
        socialSecurity: 0,
        spending: 0,
        nominalReturn,
        phase: 'accumulation',
      });

      if (year === accumulationYears - 1) balanceAtRetirement = balance;
    } else {
      const ssThisYear = age >= ss.claimAge ? ss.annual : 0;
      const needed = Math.max(0, spendingNeed - ssThisYear);
      // Withdraw at the start of the year, then grow what is left. Cannot spend
      // money that is not there.
      const withdrawal = Math.min(needed, Math.max(0, startBalance));
      balance = (startBalance - withdrawal) * (1 + realReturn);

      if (depletionAge === null && withdrawal < needed - 1e-6) {
        depletionAge = age;
      }

      rows.push({
        age,
        year,
        startBalance,
        endBalance: balance,
        income: 0,
        contribution: 0,
        withdrawal,
        socialSecurity: ssThisYear,
        spending: withdrawal + ssThisYear,
        nominalReturn,
        phase: 'retirement',
      });
    }
  }

  if (accumulationYears === 0) balanceAtRetirement = inputs.currentSavings;

  return { rows, balanceAtRetirement, depletionAge };
}

/** Projected Social Security, or a zeroed stub when the toggle is off. */
function socialSecurityAnnual(inputs: Inputs): { annual: number; claimAge: number } {
  if (!inputs.socialSecurity.enabled) {
    return { annual: 0, claimAge: Infinity };
  }
  const est = estimateSocialSecurity({
    currentAge: inputs.currentAge,
    retirementAge: inputs.retirementAge,
    income: inputs.income,
    realWageGrowth: realWageGrowth(inputs),
    claimAge: inputs.socialSecurity.claimAge,
    haircut: inputs.socialSecurity.haircut,
    piaOverride: inputs.socialSecurity.piaOverride,
  });
  return { annual: est.annual, claimAge: est.claimAge };
}

/**
 * The portfolio needed at retirement, in real dollars.
 *
 * Two pieces. The first is the classic rule of thumb: whatever the portfolio
 * must fund each year, divided by the safe withdrawal rate. The second is the
 * bridge — if you retire at 55 but Social Security does not start until 67, the
 * portfolio carries the *entire* spend for twelve years, and sizing it only for
 * the post-Social-Security level would leave you short.
 */
export function computeTarget(inputs: Inputs): {
  target: number;
  portfolioSpend: number;
  spendingNeed: number;
  ssAnnual: number;
  bridgeCost: number;
  finalIncome: number;
  withdrawalRate: number;
} {
  const accumulationYears = Math.max(0, inputs.retirementAge - inputs.currentAge);
  const finalIncome = incomeAt(inputs, accumulationYears);
  const spendingNeed = inputs.replacementRatio * finalIncome;
  const withdrawalRate = effectiveWithdrawalRate(inputs);

  const ss = socialSecurityAnnual(inputs);
  const portfolioSpend = Math.max(0, spendingNeed - ss.annual);

  const bridgeYears =
    ss.claimAge === Infinity ? 0 : Math.max(0, ss.claimAge - inputs.retirementAge);

  // Discount the bridge at the real return prevailing at retirement.
  const discountRate = realReturnAt(inputs, accumulationYears);
  let bridgeCost = 0;
  for (let i = 0; i < bridgeYears; i++) {
    bridgeCost += ss.annual / Math.pow(1 + discountRate, i);
  }

  return {
    target: portfolioSpend / withdrawalRate + bridgeCost,
    portfolioSpend,
    spendingNeed,
    ssAnnual: ss.annual,
    bridgeCost,
    finalIncome,
    withdrawalRate,
  };
}

/**
 * Solves for the personal savings rate that hits the target.
 *
 * The balance at retirement is linear in the savings rate — contributions scale
 * with it and nothing else does — so two projections pin the line exactly. No
 * bisection, no tolerance, no iteration count to tune.
 */
export function solveRequiredSavingsRate(inputs: Inputs): number {
  const { target } = computeTarget(inputs);
  const atZero = simulate(inputs, 0).balanceAtRetirement;
  const atOne = simulate(inputs, 1).balanceAtRetirement;

  const slope = atOne - atZero;
  if (slope <= 0) {
    // No years left to contribute: either you are already there or you cannot get there.
    return target <= atZero ? 0 : Infinity;
  }

  return Math.max(0, (target - atZero) / slope);
}

/**
 * Inverts the target formula: given a portfolio, what flat real spending does it
 * sustain? `target = (spend − ss) / wr + bridge`, so
 * `spend = (balance − bridge) × wr + ss`. Doing it this way rather than
 * `balance × wr` keeps the Social Security bridge accounted for.
 */
export function sustainableSpending(inputs: Inputs, balance: number): number {
  const t = computeTarget(inputs);
  return Math.max(0, (balance - t.bridgeCost) * t.withdrawalRate + t.ssAnnual);
}

/**
 * Whether the withdrawal rate and the assumed return can coexist.
 *
 * A portfolio holds its real value only while it earns at least what it pays
 * out. The break-even balance — `spending x (1 + r) / r` — is where growth
 * exactly covers the withdrawal, and it is hyperbolic in r: as the real return
 * falls, the pile you need explodes. Halving the real return roughly doubles it.
 *
 * The two inputs are set independently on purpose, which means they can be set
 * in contradiction. This surfaces that rather than letting it show up forty
 * years later as a curve bending toward zero.
 */
export function computeSustainability(inputs: Inputs, spending: number): Sustainability {
  const g = glidePathFor(inputs);
  const withdrawalRate = effectiveWithdrawalRate(inputs);

  const nominalAtRetirement =
    inputs.returnModel === 'constant'
      ? inputs.constantReturn
      : inputs.returnModel === 'flat'
        ? returnForAge(inputs.currentAge, g)
        : returnForAge(inputs.retirementAge, g);

  // The rate the portfolio settles at for the long run: the floor for a glide
  // path, the single rate for the other two models.
  const nominalTerminal =
    inputs.returnModel === 'glidePath'
      ? returnForAge(Math.max(inputs.planToAge, g.floorAge), g)
      : nominalAtRetirement;

  const realAtRetirement = toReal(nominalAtRetirement, inputs.inflation);
  const realTerminal = toReal(nominalTerminal, inputs.inflation);

  const breakEven = (real: number) =>
    real > 0 ? (spending * (1 + real)) / real : Infinity;

  // The nominal return a portfolio must earn for this withdrawal rate to hold
  // its real value: the Fisher inverse of the withdrawal rate.
  const requiredNominal = (1 + withdrawalRate) * (1 + inputs.inflation) - 1;

  return {
    withdrawalRate,
    nominalAtRetirement,
    realAtRetirement,
    nominalTerminal,
    realTerminal,
    marginAtRetirement: realAtRetirement - withdrawalRate,
    marginTerminal: realTerminal - withdrawalRate,
    breakEvenAtRetirement: breakEven(realAtRetirement),
    breakEvenTerminal: breakEven(realTerminal),
    requiredNominalReturn: requiredNominal,
    sustainable: realTerminal >= withdrawalRate,
    floorAge: g.floorAge,
  };
}

/** Everything the UI needs, from one set of inputs. */
export function computeResults(inputs: Inputs): Results {
  const t = computeTarget(inputs);
  const requiredSavingsRate = solveRequiredSavingsRate(inputs);

  const finite = Number.isFinite(requiredSavingsRate);
  const simulation = simulate(inputs, finite ? requiredSavingsRate : 0);

  const atZero = simulate(inputs, 0).balanceAtRetirement;

  const yours = buildYourPath(inputs, t, requiredSavingsRate);
  const sustainability = computeSustainability(inputs, t.spendingNeed);

  return {
    yours,
    sustainability,
    requiredSavingsRate,
    requiredTotalRate: requiredSavingsRate + inputs.employerMatch,
    requiredMonthly: finite ? (requiredSavingsRate * inputs.income) / 12 : Infinity,

    targetNestEgg: t.target,
    portfolioSpend: t.portfolioSpend,
    firstYearSpending: t.spendingNeed,
    socialSecurityAnnual: t.ssAnnual,
    bridgeCost: t.bridgeCost,

    finalIncome: t.finalIncome,
    withdrawalRate: t.withdrawalRate,
    firstYearReturn: returnFnFor(inputs)(0),

    simulation,
    alreadyFunded: requiredSavingsRate === 0 && atZero >= t.target,
  };
}

/**
 * Projects your own savings rate against the same target, so the gap between
 * what you are doing and what the goal needs is visible rather than implied.
 */
function buildYourPath(
  inputs: Inputs,
  t: ReturnType<typeof computeTarget>,
  requiredSavingsRate: number,
): YourPath | null {
  if (inputs.savingsRateOverride === null) return null;

  const rate = Math.max(0, inputs.savingsRateOverride);
  const sim = simulate(inputs, rate);
  const balanceAtRetirement = sim.balanceAtRetirement;

  const spending = sustainableSpending(inputs, balanceAtRetirement);
  const required = Number.isFinite(requiredSavingsRate) ? requiredSavingsRate : Infinity;

  return {
    rate,
    totalRate: rate + inputs.employerMatch,
    monthly: (rate * inputs.income) / 12,

    simulation: sim,
    balanceAtRetirement,
    surplus: balanceAtRetirement - t.target,

    sustainableSpending: spending,
    sustainableReplacement: t.finalIncome > 0 ? spending / t.finalIncome : 0,
    shortfallInRate: Math.max(0, required - rate),
    onTrack: balanceAtRetirement >= t.target - 1e-6,
  };
}
