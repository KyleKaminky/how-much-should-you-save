import {
  PIA_BEND_POINTS,
  SSA_YEAR,
  TAXABLE_MAXIMUM,
  WITHDRAWAL_RATE_TABLE,
} from '../lib/constants';
import { formatCurrency, formatPercent } from '../lib/format';

/**
 * A calculator that will not show its work is not trustworthy. Every formula and
 * constant the model uses is stated here in plain language.
 */
export function MethodologyNotes() {
  return (
    <section className="card">
      <h2>How this works</h2>

      <details className="method">
        <summary>Everything is in today's dollars</summary>
        <div>
          <p>
            The model runs entirely in real terms. Nominal rates are converted with the Fisher
            relation, <code>(1 + nominal) / (1 + inflation) − 1</code>, not by subtracting
            inflation — the shortcut is off by roughly <code>real × inflation</code>, which
            compounds into a real error over forty years.
          </p>
          <p>
            It matters because the conventional assumption set puts inflation and wage growth
            both at 3%, so they cancel and the question "80% of your income in{' '}
            <em>today's</em> dollars" never has to be pinned down. The moment you can set them
            independently it does. Retirement spending is therefore a flat line in today's
            purchasing power, which is also why the chart is legible.
          </p>
        </div>
      </details>

      <details className="method">
        <summary>The target: what you need at retirement</summary>
        <div>
          <p>
            Income grows at the real wage-growth rate to your retirement age. Multiply the final
            year by your replacement ratio to get the spending the portfolio must fund. Subtract
            any Social Security, divide by the safe withdrawal rate, then add the bridge:
          </p>
          <p>
            <code>target = (spending − social security) / withdrawal rate + bridge</code>
          </p>
          <p>
            The <strong>bridge</strong> is the piece most versions of this calculation leave
            out. If you retire at 55 but benefits do not start until 67, the portfolio carries
            the <em>entire</em> spend for twelve years. Sizing it only for the post-benefit level
            leaves you short, so the model adds the present value of those missing benefit years,
            discounted at the real return prevailing at retirement.
          </p>
        </div>
      </details>

      <details className="method">
        <summary>Solving for the savings rate</summary>
        <div>
          <p>
            The balance at retirement is <em>linear</em> in the savings rate — contributions
            scale with it and nothing else does. So the model projects the portfolio twice, at 0%
            and at 100%, and reads the answer straight off the line. No search, no tolerance, no
            iteration limit.
          </p>
          <p>
            Contributions default to monthly, which is how payroll deferrals actually land. The
            yearly options exist because the conventional version of this calculation assumes a
            single deposit each year, and it is useful to be able to reproduce that.
          </p>
        </div>
      </details>

      <details className="method">
        <summary>The two return models, and why they differ so much</summary>
        <div>
          <p>
            Both draw on the same curve: 10% for a 20-year-old, falling 0.1% a year, floored at
            5.5% (which it reaches at 65). They differ in how it is applied.
          </p>
          <ul>
            <li>
              <strong>Flat</strong> picks one rate from your age <em>today</em> and holds it for
              the entire projection. It is the usual simplification, and it means a 20-year-old
              and a 40-year-old investing in the same calendar year are assumed to earn different
              returns — a glide path applied at the wrong granularity.
            </li>
            <li>
              <strong>Glide path</strong> applies the curve year by year as you age, which is
              what a declining-equity allocation actually looks like. It is the more defensible
              assumption, and it produces materially higher required savings rates.
            </li>
          </ul>
          <p>
            Flat is the default only because it is the familiar convention. If you want the more
            defensible number, use the glide path.
          </p>
        </div>
      </details>

      <details className="method">
        <summary>Withdrawal rate</summary>
        <div>
          <p>
            Defaults to an age-banded guideline, keyed on the age you retire — retire earlier and
            the money has to last longer, so you can take less:
          </p>
          <ul>
            {WITHDRAWAL_RATE_TABLE.map((b) => (
              <li key={b.label}>
                {b.label}: <strong>{formatPercent(b.rate, 1)}</strong>
              </li>
            ))}
          </ul>
          <p>
            The familiar 4% rule applies one number to everyone; this uses the age bands above
            and lets you override them. Either way the rate is only a rule of thumb, which is why
            the model also runs the drawdown forward year by year and reports the age the
            portfolio actually runs dry. Hitting the target and the target lasting are two
            different claims.
          </p>
        </div>
      </details>

      <details className="method">
        <summary>Social Security</summary>
        <div>
          <p>
            Benefits are estimated with the real SSA formula, using {SSA_YEAR} figures:
          </p>
          <ul>
            <li>
              Earnings are projected across a career starting at 22, capped each year at the{' '}
              {formatCurrency(TAXABLE_MAXIMUM)} taxable maximum. The highest 35 years, divided by
              420 months, give the AIME.
            </li>
            <li>
              The benefit replaces 90% of AIME up to {formatCurrency(PIA_BEND_POINTS[0])}, 32% up
              to {formatCurrency(PIA_BEND_POINTS[1])}, and 15% above — the bend-point formula.
            </li>
            <li>
              Claiming before full retirement age (67) costs 5/9 of 1% per month for the first 36
              months and 5/12 of 1% beyond; delaying earns 8% a year to 70. Claiming at 62 pays
              70% of the full benefit; at 70, 124%.
            </li>
          </ul>
          <p>
            Working in real dollars is what makes this tractable: SSA indexes both the wage base
            and the bend points to the national Average Wage Index, so in real terms they hold
            still. Past earnings are projected backward from your current income, since we have
            no actual earnings record — if you have your real number from ssa.gov, override it.
          </p>
          <p>
            The default 25% cut reflects the trust fund's projected 2035 depletion, after which
            benefits fall to what incoming payroll tax revenue supports absent legislation. It is
            an assumption, not a forecast, and the slider is there because nobody knows.
          </p>
        </div>
      </details>

      <details className="method">
        <summary>What this deliberately ignores</summary>
        <div>
          <ul>
            <li>
              <strong>Taxes.</strong> Everything is pre-tax. "25% of gross" means quite different
              things in a traditional 401(k), a Roth, and a brokerage account, and the model does
              not distinguish them.
            </li>
            <li>
              <strong>Sequence-of-returns risk.</strong> Returns are smooth. A real portfolio is
              not, and a bad first decade of retirement hurts far more than the same losses
              later. There is no Monte Carlo here.
            </li>
            <li>
              <strong>Spousal and survivor Social Security</strong>, and any pension income.
            </li>
            <li>
              <strong>Healthcare and long-term care</strong>, which do not follow general
              inflation.
            </li>
          </ul>
          <p>
            All of these push in the direction of saving more, not less.
          </p>
        </div>
      </details>

      <p className="method-note">
        Social Security figures verified against ssa.gov for {SSA_YEAR}. This is a planning tool,
        not financial advice.
      </p>
    </section>
  );
}
