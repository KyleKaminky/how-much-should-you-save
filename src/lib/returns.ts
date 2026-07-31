import { DEFAULT_GLIDE_PATH } from './constants';
import type { GlidePathConfig, Inputs, ResolvedGlidePath, ReturnModel } from './types';

/**
 * Resolves a glide path against a retirement age.
 *
 * The curve is defined by where it starts and where it lands: `startReturn` at
 * `anchorAge`, falling to `floorReturn` by `floorAge`. The annual decline is
 * derived rather than entered, because the decline rate is the least meaningful
 * of the four numbers — what people actually have an opinion about is when
 * de-risking finishes, and that is normally when they retire.
 */
export function resolveGlidePath(
  config: GlidePathConfig,
  retirementAge: number,
): ResolvedGlidePath {
  const floorAge = config.floorAge ?? retirementAge;
  const span = floorAge - config.anchorAge;

  // A floor at or before the anchor means there is no glide to speak of — the
  // curve is already there. Infinity makes returnForAge clamp immediately.
  const declinePerYear =
    span > 0 ? Math.max(0, config.startReturn - config.floorReturn) / span : Infinity;

  return {
    anchorAge: config.anchorAge,
    startReturn: config.startReturn,
    floorAge,
    floorReturn: config.floorReturn,
    declinePerYear,
  };
}

/** The declining-return curve, evaluated at an age. */
export function returnForAge(age: number, g: ResolvedGlidePath): number {
  // Guard an inverted configuration (floor above the start), which would
  // otherwise let clamp ordering decide the answer.
  const floor = Math.min(g.floorReturn, g.startReturn);
  if (age <= g.anchorAge) return g.startReturn;
  if (!Number.isFinite(g.declinePerYear)) return floor;

  const raw = g.startReturn - g.declinePerYear * (age - g.anchorAge);
  return Math.max(floor, Math.min(g.startReturn, raw));
}

/**
 * Builds the nominal return for a given year of the projection.
 *
 * `flat` picks a single rate from the user's age *today* and applies it for the
 * entire projection. It is the conventional simplification, but it means two
 * people investing in the same calendar year are assumed to earn different
 * returns purely because of their ages.
 *
 * `glidePath` walks the curve year by year as the investor ages, which is what a
 * declining-equity allocation actually looks like. It produces materially higher
 * required savings rates.
 *
 * Neither touches the withdrawal rate — that is set independently from the
 * retirement-age table or an explicit override.
 */
export function makeReturnFn(
  model: ReturnModel,
  currentAge: number,
  constantReturn: number,
  g: ResolvedGlidePath,
): (yearIndex: number) => number {
  switch (model) {
    case 'flat': {
      const rate = returnForAge(currentAge, g);
      return () => rate;
    }
    case 'glidePath':
      return (yearIndex: number) => returnForAge(currentAge + yearIndex, g);
    case 'constant':
      return () => constantReturn;
  }
}

export function glidePathFor(inputs: Inputs): ResolvedGlidePath {
  return resolveGlidePath(inputs.glidePath, inputs.retirementAge);
}

export function returnFnFor(inputs: Inputs): (yearIndex: number) => number {
  return makeReturnFn(
    inputs.returnModel,
    inputs.currentAge,
    inputs.constantReturn,
    glidePathFor(inputs),
  );
}

/** The default curve resolved against a given retirement age. */
export function defaultGlidePath(retirementAge: number): ResolvedGlidePath {
  return resolveGlidePath(DEFAULT_GLIDE_PATH, retirementAge);
}

/**
 * Fisher conversion. Subtracting inflation from the nominal rate is the common
 * shortcut and it is wrong by roughly `real * inflation` — enough to matter over
 * a 40-year compounding horizon.
 */
export function toReal(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1;
}
