import { useMemo } from 'react';
import { formatPercent } from '../lib/format';
import { buildReturnSchedule } from '../lib/returnSchedule';
import { glidePathFor } from '../lib/returns';
import type { Inputs, Results } from '../lib/types';

const MODEL_LABEL: Record<Inputs['returnModel'], string> = {
  flat: 'Flat',
  glidePath: 'Glide path',
  constant: 'Custom',
};

/**
 * The assumed-return curve, spelled out.
 *
 * Everything downstream depends on these numbers, and until now they were only
 * described in a sentence. Showing nominal beside real is the point: the floor,
 * the withdrawal rate and every rule of thumb are quoted in different terms, and
 * that mismatch is what makes the results surprising.
 */
export function ReturnAssumptions({ inputs, results }: { inputs: Inputs; results: Results }) {
  const rows = useMemo(() => buildReturnSchedule(inputs), [inputs]);
  const glide = glidePathFor(inputs);
  const s = results.sustainability;
  const retired = rows.some((r) => r.phase === 'retirement');

  return (
    <section className="card">
      <h2>Return assumptions</h2>

      <p className="chart-subtitle" style={{ marginBottom: 4 }}>
        What the model assumes you earn, year by year, under the{' '}
        <strong>{MODEL_LABEL[inputs.returnModel]}</strong> setting.
      </p>
      <p className="chart-subtitle" style={{ marginBottom: 14 }}>
        {inputs.returnModel === 'flat' ? (
          <>
            Flat takes one point off the curve — your age today — and holds it for the whole
            projection, which is why every row is identical.
          </>
        ) : inputs.returnModel === 'constant' ? (
          <>A single rate you chose, applied to every year.</>
        ) : (
          <>
            The curve falls {formatPercent(glide.declinePerYear, 2)} a year as you age, reaching
            its {formatPercent(glide.floorReturn, 1)} floor at {glide.floorAge}, then holding
            there.
          </>
        )}{' '}
        <strong>Real</strong> is the same return after {formatPercent(inputs.inflation, 1)}{' '}
        inflation — the one that actually buys anything.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Age</th>
              <th scope="col">Nominal</th>
              <th scope="col">Real</th>
              {retired ? (
                <th scope="col">vs {formatPercent(s.withdrawalRate, 2)} draw</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.age}>
                <td>
                  {r.age}
                  {r.markers.length ? (
                    <span className="row-marker"> {r.markers.join(' · ')}</span>
                  ) : null}
                </td>
                <td>{formatPercent(r.nominal, 2)}</td>
                <td>{formatPercent(r.real, 2)}</td>
                {retired ? (
                  <td
                    style={
                      r.margin === null
                        ? undefined
                        : { color: r.margin >= 0 ? 'var(--success-text)' : 'var(--status-critical)' }
                    }
                  >
                    {r.margin === null
                      ? '—'
                      : `${r.margin >= 0 ? '+' : '−'}${formatPercent(Math.abs(r.margin), 2)}`}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="callout callout-info">
        <span className="callout-icon" aria-hidden="true">
          ⓘ
        </span>
        <span>
          The last column is the whole ballgame in retirement: positive and the portfolio grows in
          real terms, negative and it drains no matter how large it started. Sampled every five
          years plus the ages that matter — the model itself runs every year.
        </span>
      </div>
    </section>
  );
}
