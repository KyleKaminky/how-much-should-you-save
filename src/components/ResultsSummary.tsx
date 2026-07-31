import { formatCurrency, formatPercent } from '../lib/format';
import type { Inputs, Results } from '../lib/types';

/**
 * The gap between what you are actually doing and what the target needs. This
 * is the point of letting you set your own rate — replacing the answer with
 * your number would just hide the benchmark.
 */
function YourGap({ inputs, results }: { inputs: Inputs; results: Results }) {
  const y = results.yours!;
  const shortfall = -y.surplus;

  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">At your {formatPercent(y.rate, 1)}</div>
          <div className="stat-value">{formatCurrency(y.balanceAtRetirement)}</div>
          <div className="stat-note">
            {formatCurrency(y.monthly)}/mo
            {inputs.employerMatch > 0 ? `, ${formatPercent(y.totalRate, 1)} with match` : ''}
          </div>
        </div>

        <div className="stat">
          <div className="stat-label">{y.onTrack ? 'Surplus' : 'Shortfall'}</div>
          <div
            className="stat-value"
            style={{ color: y.onTrack ? 'var(--success-text)' : 'var(--status-critical)' }}
          >
            {y.onTrack ? '+' : '−'}
            {formatCurrency(Math.abs(y.surplus))}
          </div>
          <div className="stat-note">against the {formatCurrency(results.targetNestEgg)} target</div>
        </div>

        <div className="stat">
          <div className="stat-label">Income it supports</div>
          <div className="stat-value">{formatCurrency(y.sustainableSpending)}</div>
          <div className="stat-note">
            {formatPercent(y.sustainableReplacement, 0)} of final income, vs your{' '}
            {formatPercent(inputs.replacementRatio, 0)} goal
          </div>
        </div>

        <div className="stat">
          <div className="stat-label">Your money lasts to</div>
          <div className="stat-value">
            {y.simulation.depletionAge === null ? `${inputs.planToAge}+` : y.simulation.depletionAge}
          </div>
          <div className="stat-note">
            {y.simulation.depletionAge === null
              ? 'survives the whole plan'
              : 'spending the same goal amount'}
          </div>
        </div>
      </div>

      {y.onTrack ? (
        <div className="callout callout-good">
          <span className="callout-icon" aria-hidden="true">
            ✓
          </span>
          <span>
            <strong>You are on track.</strong> {formatPercent(y.rate, 1)} clears the{' '}
            {formatPercent(results.requiredSavingsRate, 1)} the target needs, leaving{' '}
            {formatCurrency(y.surplus)} of headroom at {inputs.retirementAge}.
          </span>
        </div>
      ) : (
        <div className="callout callout-critical">
          <span className="callout-icon" aria-hidden="true">
            ▲
          </span>
          <span>
            <strong>
              You are {formatPercent(y.shortfallInRate, 1)} of income short
            </strong>{' '}
            — {formatPercent(y.rate, 1)} against the{' '}
            {formatPercent(results.requiredSavingsRate, 1)} needed, which is another{' '}
            {formatCurrency((y.shortfallInRate * inputs.income) / 12)} a month. That leaves you{' '}
            {formatCurrency(shortfall)} below the target
            {y.simulation.depletionAge !== null
              ? `, and the money runs out at ${y.simulation.depletionAge}`
              : ''}
            .
          </span>
        </div>
      )}
    </>
  );
}

export function ResultsSummary({ inputs, results }: { inputs: Inputs; results: Results }) {
  const {
    requiredSavingsRate,
    requiredTotalRate,
    requiredMonthly,
    targetNestEgg,
    firstYearSpending,
    socialSecurityAnnual,
    bridgeCost,
    finalIncome,
    withdrawalRate,
    simulation,
    alreadyFunded,
  } = results;

  const unreachable = !Number.isFinite(requiredSavingsRate);
  const hasMatch = inputs.employerMatch > 0;
  const depletionAge = simulation.depletionAge;

  return (
    <section className="card">
      <h2>What you need to invest</h2>

      {unreachable ? (
        <div className="hero">
          <div className="hero-value">—</div>
          <div className="hero-caption">
            There are no working years left to contribute, and current savings fall short of the
            target.
          </div>
        </div>
      ) : alreadyFunded ? (
        <>
          <div className="hero">
            <div className="hero-value">0%</div>
            <div className="hero-caption">of gross income</div>
          </div>
          <p className="hero-sub">
            Your current savings of {formatCurrency(inputs.currentSavings)} already grow to more
            than the {formatCurrency(targetNestEgg)} you need. Anything further is upside.
          </p>
        </>
      ) : (
        <>
          <div className="hero">
            <div className="hero-value">{formatPercent(requiredSavingsRate, 1)}</div>
            <div className="hero-caption">of gross income</div>
          </div>
          <p className="hero-sub">
            {formatCurrency(requiredMonthly)} per month in today's dollars
            {hasMatch ? (
              <>
                {' '}
                from you, {formatPercent(requiredTotalRate, 1)} counting the{' '}
                {formatPercent(inputs.employerMatch, 1)} employer match
              </>
            ) : null}
            .
          </p>
        </>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Target at {inputs.retirementAge}</div>
          <div className="stat-value">{formatCurrency(targetNestEgg)}</div>
          <div className="stat-note">at a {formatPercent(withdrawalRate, 1)} withdrawal rate</div>
        </div>

        <div className="stat">
          <div className="stat-label">Income to replace</div>
          <div className="stat-value">{formatCurrency(firstYearSpending)}</div>
          <div className="stat-note">
            {formatPercent(inputs.replacementRatio, 0)} of {formatCurrency(finalIncome)}
          </div>
        </div>

        {inputs.socialSecurity.enabled ? (
          <div className="stat">
            <div className="stat-label">Social Security</div>
            <div className="stat-value">{formatCurrency(socialSecurityAnnual)}</div>
            <div className="stat-note">per year from {inputs.socialSecurity.claimAge}</div>
          </div>
        ) : null}

        {bridgeCost > 0 ? (
          <div className="stat">
            <div className="stat-label">Bridge to benefits</div>
            <div className="stat-value">{formatCurrency(bridgeCost)}</div>
            <div className="stat-note">
              extra, for ages {inputs.retirementAge}–{inputs.socialSecurity.claimAge}
            </div>
          </div>
        ) : null}

        <div className="stat">
          <div className="stat-label">Assumed return</div>
          <div className="stat-value">{formatPercent(results.firstYearReturn, 1)}</div>
          <div className="stat-note">
            {inputs.returnModel === 'glidePath'
              ? 'nominal, declining as you age'
              : 'nominal, before inflation'}
          </div>
        </div>

        <div className="stat">
          <div className="stat-label">Money lasts to</div>
          <div className="stat-value">
            {depletionAge === null ? `${inputs.planToAge}+` : depletionAge}
          </div>
          <div className="stat-note">
            {depletionAge === null ? 'survives the whole plan' : 'portfolio runs dry'}
          </div>
        </div>
      </div>

      {results.yours ? (
        <YourGap inputs={inputs} results={results} />
      ) : depletionAge !== null ? (
        <div className="callout callout-critical">
          <span className="callout-icon" aria-hidden="true">
            ▲
          </span>
          <span>
            <strong>The money runs out at {depletionAge}</strong>, short of your plan-through age
            of {inputs.planToAge}. Hitting the target is not the same as the target lasting — a{' '}
            {formatPercent(withdrawalRate, 1)} withdrawal rate is too high against this return
            assumption. Lower the withdrawal rate, retire later, or spend less.
          </span>
        </div>
      ) : (
        <div className="callout callout-good">
          <span className="callout-icon" aria-hidden="true">
            ✓
          </span>
          <span>
            Drawing {formatCurrency(firstYearSpending)} a year in today's dollars, the portfolio
            still has {formatCurrency(simulation.rows[simulation.rows.length - 1]?.endBalance ?? 0)}{' '}
            left at {inputs.planToAge}.
          </span>
        </div>
      )}
    </section>
  );
}
