import { effectiveWithdrawalRate } from './model';
import { glidePathFor, returnFnFor, toReal } from './returns';
import type { Inputs } from './types';

export interface ScheduleRow {
  age: number;
  /** Nominal assumed return for the year beginning at this age. */
  nominal: number;
  /** The same return net of inflation — what actually buys anything. */
  real: number;
  /** Real return minus the withdrawal rate. Null before retirement. */
  margin: number | null;
  phase: 'accumulation' | 'retirement';
  /** Short labels for the ages that mean something: now, retirement, floor. */
  markers: string[];
}

/**
 * The assumed-return curve laid out as a table.
 *
 * Prose can say "falling 0.14% a year to a 5.5% floor at 55" and still leave
 * people unable to answer "so what am I earning at 70?". Sampling the curve at
 * five-year intervals, plus every age that carries meaning, makes the whole
 * assumption legible at a glance — including the flat model's oddity, where
 * every row shows the same number.
 */
export function buildReturnSchedule(inputs: Inputs): ScheduleRow[] {
  const g = glidePathFor(inputs);
  const returnAt = returnFnFor(inputs);
  const withdrawalRate = effectiveWithdrawalRate(inputs);

  const first = inputs.currentAge;
  const last = inputs.planToAge;

  const ages = new Set<number>();
  for (let age = first; age <= last; age += 5) ages.add(age);
  ages.add(first);
  ages.add(inputs.retirementAge);
  ages.add(last);
  // The floor only matters where the curve actually walks to it.
  if (inputs.returnModel === 'glidePath' && g.floorAge > first && g.floorAge <= last) {
    ages.add(g.floorAge);
  }

  return [...ages]
    .filter((age) => age >= first && age <= last)
    .sort((a, b) => a - b)
    .map((age) => {
      const nominal = returnAt(age - first);
      const real = toReal(nominal, inputs.inflation);
      const retired = age >= inputs.retirementAge;

      const markers: string[] = [];
      if (age === first) markers.push('now');
      if (age === inputs.retirementAge) markers.push('retire');
      if (inputs.returnModel === 'glidePath' && age === g.floorAge) markers.push('floor');
      if (age === last) markers.push('plan ends');

      return {
        age,
        nominal,
        real,
        margin: retired ? real - withdrawalRate : null,
        phase: retired ? 'retirement' : 'accumulation',
        markers,
      };
    });
}
