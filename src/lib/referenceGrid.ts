import {
  DEFAULT_GLIDE_PATH,
  REFERENCE_ASSUMPTIONS,
  REFERENCE_CURRENT_AGES,
  REFERENCE_TARGET_AGES,
} from './constants';
import { DEFAULT_INPUTS } from './defaults';
import { solveRequiredSavingsRate } from './model';
import type { Inputs } from './types';

/**
 * A quick-reference grid: required savings rate for every combination of current
 * age and target retirement age, under one fixed set of assumptions.
 *
 * Deliberately independent of whatever the user has entered, so it stays a
 * stable point of comparison — and so a stray input change cannot silently move
 * the numbers people are reading off it.
 */
export function referenceInputs(currentAge: number, retirementAge: number): Inputs {
  const a = REFERENCE_ASSUMPTIONS;
  return {
    ...DEFAULT_INPUTS,
    currentAge,
    retirementAge,
    planToAge: Math.max(retirementAge + 1, 95),
    income: 100_000,
    currentSavings: 0,
    employerMatch: 0,
    replacementRatio: a.replacementRatio,
    inflation: a.inflation,
    wageGrowth: a.wageGrowth,
    returnModel: a.returnModel,
    glidePath: { ...DEFAULT_GLIDE_PATH, floorAge: a.floorAge },
    withdrawalRateOverride: a.withdrawalRate,
    savingsRateOverride: null,
    contributionTiming: a.contributionTiming,
    socialSecurity: { ...DEFAULT_INPUTS.socialSecurity, enabled: false },
  };
}

export interface GridCell {
  currentAge: number;
  retirementAge: number;
  /** Required savings rate in percentage points. */
  rate: number;
}

/** The full grid, row-major by current age. */
export function buildReferenceGrid(): GridCell[] {
  const cells: GridCell[] = [];
  for (const currentAge of REFERENCE_CURRENT_AGES) {
    for (const retirementAge of REFERENCE_TARGET_AGES) {
      // A retirement age at or before the current age is not a scenario.
      if (retirementAge <= currentAge) continue;
      cells.push({
        currentAge,
        retirementAge,
        rate: solveRequiredSavingsRate(referenceInputs(currentAge, retirementAge)) * 100,
      });
    }
  }
  return cells;
}
