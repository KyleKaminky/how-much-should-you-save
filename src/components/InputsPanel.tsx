import { DEFAULT_GLIDE_PATH, withdrawalRateForAge } from '../lib/constants';
import { glidePathFor, returnForAge } from '../lib/returns';
import { formatCurrency, formatPercent } from '../lib/format';
import { estimateSocialSecurity } from '../lib/socialSecurity';
import { realWageGrowth } from '../lib/model';
import type { Inputs, Results } from '../lib/types';
import {
  Checkbox,
  CurrencyField,
  DraftInput,
  Field,
  NumberField,
  PercentField,
  Segmented,
} from './fields';
import { SustainabilityNote } from './SustainabilityNote';

interface Props {
  inputs: Inputs;
  /** Drives the sustainability check beside the withdrawal rate. */
  results: Results;
  /** The solved rate, shown read-only until you set your own. */
  requiredRate: number;
  onChange: (patch: Partial<Inputs>) => void;
  onReset: () => void;
}

/**
 * The shape of the declining-return curve. Applies to both age-based models —
 * `flat` reads a single point off it, `glidePath` walks along it — and to
 * neither the withdrawal rate nor anything else.
 */
function GlidePathFields({ inputs, onChange }: { inputs: Inputs; onChange: Props['onChange'] }) {
  const g = inputs.glidePath;
  const set = (patch: Partial<typeof g>) => onChange({ glidePath: { ...g, ...patch } });
  const resolved = glidePathFor(inputs);

  const isDefault =
    g.anchorAge === DEFAULT_GLIDE_PATH.anchorAge &&
    g.startReturn === DEFAULT_GLIDE_PATH.startReturn &&
    g.floorAge === DEFAULT_GLIDE_PATH.floorAge &&
    g.floorReturn === DEFAULT_GLIDE_PATH.floorReturn;

  const followsRetirement = g.floorAge === null;
  const nowRate = returnForAge(inputs.currentAge, resolved);
  const retireRate = returnForAge(inputs.retirementAge, resolved);

  return (
    <>
      <details className="method" style={{ borderTop: 'none', margin: 0, paddingTop: 0 }}>
        <summary style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
          Return curve {isDefault ? '(default)' : '(edited)'}
        </summary>
        <div style={{ paddingBottom: 0 }}>
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="row-2">
              <PercentField
                label="Return at anchor age"
                value={g.startReturn}
                step={0.1}
                max={30}
                onChange={(startReturn) => set({ startReturn })}
              />
              <NumberField
                label="Anchor age"
                value={g.anchorAge}
                min={0}
                max={90}
                onChange={(anchorAge) => set({ anchorAge })}
              />
            </div>
            <div className="row-2">
              <PercentField
                label="Floor"
                value={g.floorReturn}
                step={0.1}
                max={30}
                onChange={(floorReturn) => set({ floorReturn })}
              />
              <Field
                label="Floor reached at"
                htmlFor="floor-age"
                hint={
                  followsRetirement ? (
                    <button type="button" className="link-button" onClick={() => set({ floorAge: inputs.retirementAge })}>
                      pin
                    </button>
                  ) : (
                    <button type="button" className="link-button" onClick={() => set({ floorAge: null })}>
                      follow retirement
                    </button>
                  )
                }
              >
                {followsRetirement ? (
                  <input id="floor-age" type="text" readOnly value={resolved.floorAge} />
                ) : (
                  <DraftInput
                    id="floor-age"
                    min={g.anchorAge + 1}
                    max={110}
                    value={g.floorAge as number}
                    onChange={(floorAge) => set({ floorAge })}
                  />
                )}
              </Field>
            </div>
            <span className="hint">
              De-risking finishes at this age, then the return holds at the floor.{' '}
              {followsRetirement
                ? 'Tracking your retirement age, the way a target-date fund glides to its target date.'
                : `Pinned. Your retirement age is ${inputs.retirementAge}.`}
            </span>
            {!isDefault ? (
              <button
                type="button"
                className="link-button"
                onClick={() => onChange({ glidePath: { ...DEFAULT_GLIDE_PATH } })}
              >
                Reset the curve to 10% at 20 falling to a 5.5% floor at retirement
              </button>
            ) : null}
          </div>
        </div>
      </details>

      <div className="callout callout-info">
        <span className="callout-icon" aria-hidden="true">
          ⓘ
        </span>
        <span>
          {formatPercent(g.startReturn, 1)} at age {g.anchorAge}, falling{' '}
          {formatPercent(resolved.declinePerYear, 2)} a year to a{' '}
          {formatPercent(g.floorReturn, 1)} floor at age {resolved.floorAge}
          {!followsRetirement && resolved.floorAge !== inputs.retirementAge
            ? ` — ${
                resolved.floorAge > inputs.retirementAge
                  ? `${resolved.floorAge - inputs.retirementAge} years after you retire`
                  : `${inputs.retirementAge - resolved.floorAge} years before you retire`
              }`
            : ''}
          .{' '}
          {inputs.returnModel === 'flat' ? (
            <>
              <strong>Flat</strong> reads one point off that curve — {formatPercent(nowRate, 1)} at
              your age today — and holds it for the whole projection.
            </>
          ) : (
            <>
              <strong>Glide path</strong> walks along it: {formatPercent(nowRate, 1)} now,{' '}
              {formatPercent(retireRate, 1)} by {inputs.retirementAge}. This affects investment
              returns only — never the withdrawal rate.
            </>
          )}
        </span>
      </div>
    </>
  );
}

export function InputsPanel({ inputs, results, requiredRate, onChange, onReset }: Props) {
  const tableRate = withdrawalRateForAge(inputs.retirementAge);
  const ss = inputs.socialSecurity;

  const ssEstimate = ss.enabled
    ? estimateSocialSecurity({
        currentAge: inputs.currentAge,
        retirementAge: inputs.retirementAge,
        income: inputs.income,
        realWageGrowth: realWageGrowth(inputs),
        claimAge: ss.claimAge,
        haircut: ss.haircut,
        piaOverride: ss.piaOverride,
      })
    : null;

  return (
    <div>
      <section className="card">
        <h2>About you</h2>
        <div className="stack">
          <div className="row-2">
            <NumberField
              label="Current age"
              value={inputs.currentAge}
              min={16}
              max={90}
              onChange={(currentAge) => onChange({ currentAge })}
            />
            <NumberField
              label="Retire at"
              value={inputs.retirementAge}
              min={inputs.currentAge + 1}
              max={95}
              onChange={(retirementAge) => onChange({ retirementAge })}
            />
          </div>

          <CurrencyField
            label="Gross annual income"
            value={inputs.income}
            onChange={(income) => onChange({ income })}
          />

          <CurrencyField
            label="Current retirement savings"
            hint="invested balance today"
            value={inputs.currentSavings}
            onChange={(currentSavings) => onChange({ currentSavings })}
          />

          <PercentField
            label="Employer match"
            hint="of gross income"
            value={inputs.employerMatch}
            step={0.5}
            max={30}
            onChange={(employerMatch) => onChange({ employerMatch })}
          />

          <Field
            label="Your savings rate"
            htmlFor="savings-rate"
            hint={
              inputs.savingsRateOverride === null ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    onChange({
                      savingsRateOverride: Number.isFinite(requiredRate)
                        ? Math.round(requiredRate * 1000) / 1000
                        : 0.1,
                    })
                  }
                >
                  set your own
                </button>
              ) : (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onChange({ savingsRateOverride: null })}
                >
                  back to solved
                </button>
              )
            }
          >
            {inputs.savingsRateOverride === null ? (
              <div className="input-suffix">
                <span aria-hidden="true">%</span>
                <input
                  id="savings-rate"
                  type="text"
                  readOnly
                  value={Number.isFinite(requiredRate) ? (requiredRate * 100).toFixed(1) : '—'}
                />
              </div>
            ) : (
              <div className="input-suffix">
                <span aria-hidden="true">%</span>
                <DraftInput
                  id="savings-rate"
                  step={0.5}
                  min={0}
                  max={100}
                  value={inputs.savingsRateOverride}
                  toDisplay={(v) => v * 100}
                  fromDisplay={(v) => v / 100}
                  onChange={(savingsRateOverride) => onChange({ savingsRateOverride })}
                />
              </div>
            )}
            <span className="hint">
              {inputs.savingsRateOverride === null
                ? 'Solved for you. Set your own to project what you are actually doing against it.'
                : 'Your rate. The chart now shows both paths so you can see the gap.'}
            </span>
          </Field>

          <NumberField
            label="Plan through age"
            hint="for the depletion check"
            value={inputs.planToAge}
            min={inputs.retirementAge}
            max={110}
            onChange={(planToAge) => onChange({ planToAge })}
          />
        </div>
      </section>

      <section className="card">
        <h2>Social Security</h2>
        <div className="stack">
          <Checkbox
            checked={ss.enabled}
            onChange={(enabled) => onChange({ socialSecurity: { ...ss, enabled } })}
          >
            Count Social Security toward retirement income
          </Checkbox>

          {ss.enabled ? (
            <>
              <NumberField
                label="Claim benefits at age"
                hint="full retirement age is 67"
                value={ss.claimAge}
                min={62}
                max={70}
                onChange={(claimAge) => onChange({ socialSecurity: { ...ss, claimAge } })}
              />

              <Field
                label="Assumed benefit cut"
                hint={formatPercent(ss.haircut, 0)}
                htmlFor="ss-haircut"
              >
                <input
                  id="ss-haircut"
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.05}
                  value={ss.haircut}
                  onChange={(e) =>
                    onChange({ socialSecurity: { ...ss, haircut: e.target.valueAsNumber } })
                  }
                />
                <span className="hint">
                  The trust fund is projected to deplete in 2035. Absent legislation, benefits
                  fall to what payroll tax revenue supports — roughly a 25% cut.
                </span>
              </Field>

              <Field
                label="Monthly benefit at 67"
                htmlFor="ss-pia"
                hint={
                  ss.piaOverride === null ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        onChange({
                          socialSecurity: {
                            ...ss,
                            piaOverride: Math.round(ssEstimate?.pia ?? 0),
                          },
                        })
                      }
                    >
                      override
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onChange({ socialSecurity: { ...ss, piaOverride: null } })}
                    >
                      re-estimate
                    </button>
                  )
                }
              >
                {ss.piaOverride === null ? (
                  <div className="input-prefix">
                    <span>$</span>
                    <input
                      id="ss-pia"
                      type="text"
                      readOnly
                      value={Math.round(ssEstimate?.pia ?? 0)}
                    />
                  </div>
                ) : (
                  <div className="input-prefix">
                    <span>$</span>
                    <DraftInput
                      id="ss-pia"
                      min={0}
                      step={50}
                      value={ss.piaOverride}
                      onChange={(piaOverride) =>
                        onChange({ socialSecurity: { ...ss, piaOverride } })
                      }
                    />
                  </div>
                )}
                <span className="hint">
                  {ss.piaOverride === null
                    ? 'Estimated from your income with the SSA bend-point formula. Use the real figure from ssa.gov if you have it.'
                    : 'Your figure, taken as the benefit at full retirement age.'}
                </span>
              </Field>

              {ssEstimate ? (
                <div className="callout callout-info">
                  <span className="callout-icon" aria-hidden="true">
                    →
                  </span>
                  <span>
                    {formatCurrency(ssEstimate.annual)}/yr from age {ssEstimate.claimAge}, after
                    the {formatPercent(ss.haircut, 0)} cut.
                    {ssEstimate.claimAge > inputs.retirementAge
                      ? ` Your portfolio covers everything for the ${
                          ssEstimate.claimAge - inputs.retirementAge
                        } years in between.`
                      : ''}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2>Assumptions</h2>
        <div className="stack">
          <PercentField
            label="Income to replace"
            hint="common guideline: 80%"
            value={inputs.replacementRatio}
            step={1}
            max={200}
            onChange={(replacementRatio) => onChange({ replacementRatio })}
          />

          <div className="row-2">
            <PercentField
              label="Inflation"
              value={inputs.inflation}
              step={0.1}
              max={20}
              onChange={(inflation) => onChange({ inflation })}
            />
            <PercentField
              label="Wage growth"
              value={inputs.wageGrowth}
              step={0.1}
              max={20}
              onChange={(wageGrowth) => onChange({ wageGrowth })}
            />
          </div>

          <Segmented
            label="Assumed return"
            value={inputs.returnModel}
            options={[
              {
                value: 'flat',
                label: 'Flat',
                title:
                  "One rate picked from your age today, then applied for life.",
              },
              {
                value: 'glidePath',
                label: 'Glide path',
                title: 'The same curve, applied year by year as you age.',
              },
              { value: 'constant', label: 'Custom', title: 'A single rate you choose.' },
            ]}
            onChange={(returnModel) => onChange({ returnModel })}
          />

          {inputs.returnModel === 'constant' ? (
            <PercentField
              label="Nominal annual return"
              value={inputs.constantReturn}
              step={0.1}
              max={30}
              onChange={(constantReturn) => onChange({ constantReturn })}
            />
          ) : (
            <GlidePathFields inputs={inputs} onChange={onChange} />
          )}

          <Field
            label="Withdrawal rate"
            htmlFor="withdrawal-rate"
            hint={
              inputs.withdrawalRateOverride === null ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onChange({ withdrawalRateOverride: tableRate })}
                >
                  override
                </button>
              ) : (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onChange({ withdrawalRateOverride: null })}
                >
                  use table
                </button>
              )
            }
          >
            {inputs.withdrawalRateOverride === null ? (
              <div className="input-suffix">
                <span>%</span>
                <input
                  id="withdrawal-rate"
                  type="text"
                  readOnly
                  value={(tableRate * 100).toFixed(1)}
                />
              </div>
            ) : (
              <div className="input-suffix">
                <span>%</span>
                <DraftInput
                  id="withdrawal-rate"
                  step={0.1}
                  min={0.1}
                  max={20}
                  value={inputs.withdrawalRateOverride}
                  toDisplay={(v) => v * 100}
                  fromDisplay={(v) => v / 100}
                  onChange={(withdrawalRateOverride) => onChange({ withdrawalRateOverride })}
                />
              </div>
            )}
            <span className="hint">
              {inputs.withdrawalRateOverride === null
                ? `From the age-based guideline for retiring at ${inputs.retirementAge}.`
                : 'Your rate, overriding the age-based guideline.'}
            </span>
          </Field>

          <SustainabilityNote inputs={inputs} results={results} />

          <Segmented
            label="Contributions"
            value={inputs.contributionTiming}
            options={[
              { value: 'monthly', label: 'Monthly', title: 'How payroll deferrals actually work.' },
              {
                value: 'annualBegin',
                label: 'Yearly (start)',
                title: 'Contributions land in one lump at the start of each year.',
              },
              { value: 'annualEnd', label: 'Yearly (end)', title: 'Most conservative.' },
            ]}
            onChange={(contributionTiming) => onChange({ contributionTiming })}
          />

          <button type="button" className="link-button" onClick={onReset}>
            Reset everything to defaults
          </button>
        </div>
      </section>
    </div>
  );
}
