import { DEFAULT_GLIDE_PATH } from './constants';
import type { GlidePathConfig, Inputs, ReturnModel } from './types';

/**
 * The declining-return curve, evaluated at an age.
 *
 * With the default configuration: 10% for a 20-year-old, falling 0.1%/yr,
 * floored at 5.5% (which it reaches at 65).
 */
export function returnForAge(
  age: number,
  config: GlidePathConfig = DEFAULT_GLIDE_PATH,
): number {
  const raw = config.startReturn - config.declinePerYear * (age - config.anchorAge);
  // Guard against an inverted configuration (floor above the start), which would
  // otherwise make the clamp order decide the answer.
  const floor = Math.min(config.floorReturn, config.startReturn);
  return Math.max(floor, Math.min(config.startReturn, raw));
}

/** The age at which the curve first hits its floor, or null if it never does. */
export function ageAtFloor(config: GlidePathConfig): number | null {
  if (config.declinePerYear <= 0) return null;
  if (config.floorReturn >= config.startReturn) return config.anchorAge;
  return config.anchorAge + (config.startReturn - config.floorReturn) / config.declinePerYear;
}

/**
 * Builds the nominal return for a given year of the projection.
 *
 * `flat` picks a single rate from the user's age *today* and applies it for the
 * entire projection. It is the conventional simplification, but it means two
 * people investing in the same calendar year are assumed to earn different
 * returns purely because of their ages.
 *
 * `glidePath` applies the same curve year by year as the investor ages, which is
 * what a declining-equity allocation actually looks like. It produces materially
 * higher required savings rates.
 *
 * Neither touches the withdrawal rate — that is set independently from the
 * retirement-age table or an explicit override.
 */
export function makeReturnFn(
  model: ReturnModel,
  currentAge: number,
  constantReturn: number,
  config: GlidePathConfig = DEFAULT_GLIDE_PATH,
): (yearIndex: number) => number {
  switch (model) {
    case 'flat': {
      const rate = returnForAge(currentAge, config);
      return () => rate;
    }
    case 'glidePath':
      return (yearIndex: number) => returnForAge(currentAge + yearIndex, config);
    case 'constant':
      return () => constantReturn;
  }
}

export function returnFnFor(inputs: Inputs): (yearIndex: number) => number {
  return makeReturnFn(
    inputs.returnModel,
    inputs.currentAge,
    inputs.constantReturn,
    inputs.glidePath,
  );
}

/**
 * Fisher conversion. Subtracting inflation from the nominal rate is the common
 * shortcut and it is wrong by roughly `real * inflation` — enough to matter over
 * a 40-year compounding horizon.
 */
export function toReal(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1;
}
