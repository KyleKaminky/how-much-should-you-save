import {
  DEFAULT_GLIDE_PATH,
  DEFAULT_INFLATION,
  DEFAULT_REPLACEMENT_RATIO,
  DEFAULT_SS_HAIRCUT,
  DEFAULT_WAGE_GROWTH,
  FULL_RETIREMENT_AGE,
} from './constants';
import type { Inputs } from './types';

export const DEFAULT_INPUTS: Inputs = {
  currentAge: 30,
  retirementAge: 60,
  planToAge: 95,

  income: 100_000,
  currentSavings: 0,
  employerMatch: 0,

  replacementRatio: DEFAULT_REPLACEMENT_RATIO,
  inflation: DEFAULT_INFLATION,
  wageGrowth: DEFAULT_WAGE_GROWTH,

  returnModel: 'flat',
  constantReturn: 0.08,
  glidePath: { ...DEFAULT_GLIDE_PATH },

  withdrawalRateOverride: null,
  savingsRateOverride: null,

  contributionTiming: 'monthly',

  socialSecurity: {
    enabled: false,
    claimAge: FULL_RETIREMENT_AGE,
    haircut: DEFAULT_SS_HAIRCUT,
    piaOverride: null,
  },
};
