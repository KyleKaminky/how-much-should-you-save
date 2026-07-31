import { DEFAULT_INPUTS } from './defaults';
import type { ContributionTiming, Inputs, ReturnModel } from './types';

/**
 * Scenarios live in the query string, so a link carries the whole calculation.
 *
 * Only values that differ from the defaults are written, which keeps a typical
 * link short and readable — `?age=32&inc=210000&repl=0.65` rather than a wall of
 * base64. Readable also means debuggable, and a user can hand-edit one.
 */

const RETURN_MODELS: ReturnModel[] = ['flat', 'glidePath', 'constant'];
const TIMINGS: ContributionTiming[] = ['monthly', 'annualBegin', 'annualEnd'];

/** Trims float noise so 0.30000000000000004 does not end up in a URL. */
function num(v: number): string {
  return String(Number(v.toFixed(6)));
}

function parseNum(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

export function encodeInputs(inputs: Inputs): string {
  const p = new URLSearchParams();
  const d = DEFAULT_INPUTS;

  const put = (key: string, value: number, fallback: number) => {
    if (value !== fallback) p.set(key, num(value));
  };

  put('age', inputs.currentAge, d.currentAge);
  put('ret', inputs.retirementAge, d.retirementAge);
  put('plan', inputs.planToAge, d.planToAge);
  put('inc', inputs.income, d.income);
  put('sav', inputs.currentSavings, d.currentSavings);
  put('match', inputs.employerMatch, d.employerMatch);
  put('repl', inputs.replacementRatio, d.replacementRatio);
  put('infl', inputs.inflation, d.inflation);
  put('wage', inputs.wageGrowth, d.wageGrowth);

  if (inputs.returnModel !== d.returnModel) p.set('rm', inputs.returnModel);
  put('cr', inputs.constantReturn, d.constantReturn);

  const g = inputs.glidePath;
  const gd = d.glidePath;
  put('gpa', g.anchorAge, gd.anchorAge);
  put('gps', g.startReturn, gd.startReturn);
  put('gpd', g.declinePerYear, gd.declinePerYear);
  put('gpf', g.floorReturn, gd.floorReturn);

  if (inputs.withdrawalRateOverride !== null) p.set('wr', num(inputs.withdrawalRateOverride));
  if (inputs.savingsRateOverride !== null) p.set('sr', num(inputs.savingsRateOverride));
  if (inputs.contributionTiming !== d.contributionTiming) p.set('ct', inputs.contributionTiming);

  const ss = inputs.socialSecurity;
  const ssd = d.socialSecurity;
  if (ss.enabled !== ssd.enabled) p.set('ss', ss.enabled ? '1' : '0');
  put('ssc', ss.claimAge, ssd.claimAge);
  put('ssh', ss.haircut, ssd.haircut);
  if (ss.piaOverride !== null) p.set('ssp', num(ss.piaOverride));

  return p.toString();
}

/**
 * Rebuilds inputs from a query string, falling back to the default for anything
 * missing or unparseable. A malformed link degrades to the default scenario
 * rather than a blank page.
 */
export function decodeInputs(search: string): Inputs {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const d = DEFAULT_INPUTS;

  const get = (key: string, fallback: number) => parseNum(p.get(key)) ?? fallback;

  const rm = p.get('rm');
  const ct = p.get('ct');
  const ss = p.get('ss');

  return {
    currentAge: get('age', d.currentAge),
    retirementAge: get('ret', d.retirementAge),
    planToAge: get('plan', d.planToAge),

    income: get('inc', d.income),
    currentSavings: get('sav', d.currentSavings),
    employerMatch: get('match', d.employerMatch),

    replacementRatio: get('repl', d.replacementRatio),
    inflation: get('infl', d.inflation),
    wageGrowth: get('wage', d.wageGrowth),

    returnModel: rm && (RETURN_MODELS as string[]).includes(rm) ? (rm as ReturnModel) : d.returnModel,
    constantReturn: get('cr', d.constantReturn),
    glidePath: {
      anchorAge: get('gpa', d.glidePath.anchorAge),
      startReturn: get('gps', d.glidePath.startReturn),
      declinePerYear: get('gpd', d.glidePath.declinePerYear),
      floorReturn: get('gpf', d.glidePath.floorReturn),
    },

    withdrawalRateOverride: parseNum(p.get('wr')),
    savingsRateOverride: parseNum(p.get('sr')),

    contributionTiming:
      ct && (TIMINGS as string[]).includes(ct) ? (ct as ContributionTiming) : d.contributionTiming,

    socialSecurity: {
      enabled: ss === null ? d.socialSecurity.enabled : ss === '1',
      claimAge: get('ssc', d.socialSecurity.claimAge),
      haircut: get('ssh', d.socialSecurity.haircut),
      piaOverride: parseNum(p.get('ssp')),
    },
  };
}

/** The full shareable URL for the current scenario. */
export function shareUrl(inputs: Inputs): string {
  const qs = encodeInputs(inputs);
  const { origin, pathname } = window.location;
  return qs ? `${origin}${pathname}?${qs}` : `${origin}${pathname}`;
}
