import { useMemo } from 'react';
import { REFERENCE_ASSUMPTIONS, REFERENCE_TARGET_AGES } from '../lib/constants';
import { buildReferenceGrid } from '../lib/referenceGrid';
import { formatPercent } from '../lib/format';

/**
 * A standing reference: what the model asks of every starting age, under one
 * fixed set of assumptions. Independent of the inputs above, so it does not
 * shift underfoot while someone is reading it.
 */
export function ReferenceGrid({ currentAge }: { currentAge: number }) {
  const { cells, ages } = useMemo(() => {
    const cells = buildReferenceGrid();
    const ages = [...new Set(cells.map((c) => c.currentAge))].sort((a, b) => a - b);
    return { cells, ages };
  }, []);

  const lookup = new Map(cells.map((c) => [`${c.currentAge}:${c.retirementAge}`, c]));
  const a = REFERENCE_ASSUMPTIONS;

  return (
    <section className="card">
      <h2>Quick reference</h2>

      <p className="chart-subtitle" style={{ marginBottom: 14 }}>
        Percentage of gross income you would need to invest, by the age you start and the age you
        retire — holding a {formatPercent(a.replacementRatio, 0)} income replacement target,{' '}
        {formatPercent(a.inflation, 0)} inflation, {formatPercent(a.wageGrowth, 0)} wage growth and
        a {formatPercent(a.withdrawalRate, 0)} withdrawal rate, with nothing saved yet and no
        Social Security. Your own numbers are above; this is the shape of the problem.
      </p>

      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th scope="col">Age</th>
              {REFERENCE_TARGET_AGES.map((t) => (
                <th key={t} scope="col">
                  Retire {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ages.map((age) => (
              <tr key={age} className={age === currentAge ? 'row-current' : undefined}>
                <th scope="row" style={{ textAlign: 'left', position: 'static' }}>
                  {age}
                </th>
                {REFERENCE_TARGET_AGES.map((t) => {
                  const c = lookup.get(`${age}:${t}`);
                  if (!c) {
                    return (
                      <td key={t} style={{ color: 'var(--text-muted)' }}>
                        —
                      </td>
                    );
                  }
                  return <td key={t}>{c.rate.toFixed(0)}%</td>;
                })}
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
          Every row is the same problem at a later start. Waiting is the single most expensive
          thing on this page — the cost of a decade is far more than a decade's worth of
          contributions, because it is compounding you cannot buy back.
        </span>
      </div>
    </section>
  );
}
