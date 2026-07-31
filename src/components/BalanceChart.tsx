import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompact, formatCurrency } from '../lib/format';
import type { Inputs, Results } from '../lib/types';

type Dollars = 'real' | 'nominal';

interface Point {
  age: number;
  balance: number;
  contribution: number;
  withdrawal: number;
  socialSecurity: number;
  phase: 'accumulation' | 'retirement';
  /** Balance on your own savings rate. Present only when comparing. */
  yourBalance?: number;
  yourContribution?: number;
}

/**
 * Portfolio balance over time.
 *
 * With one series there is no legend — the title says what is plotted. Once you
 * supply your own savings rate a second series appears and a legend becomes
 * mandatory, so identity never rests on colour alone. The retirement marker and
 * the target line are chrome, not data, and stay in the muted ink.
 */
export function BalanceChart({ inputs, results }: { inputs: Inputs; results: Results }) {
  const [dollars, setDollars] = useState<Dollars>('real');
  const [showTable, setShowTable] = useState(false);

  const yours = results.yours;
  const comparing = yours !== null;

  const data: Point[] = useMemo(() => {
    const rows = results.simulation.rows;
    const yourRows = yours?.simulation.rows;
    const scale = (year: number) =>
      dollars === 'nominal' ? Math.pow(1 + inputs.inflation, year) : 1;

    const points: Point[] = rows.map((r, i) => ({
      age: r.age,
      balance: r.startBalance * scale(r.year),
      contribution: r.contribution * scale(r.year),
      withdrawal: r.withdrawal * scale(r.year),
      socialSecurity: r.socialSecurity * scale(r.year),
      phase: r.phase,
      ...(yourRows
        ? {
            yourBalance: yourRows[i].startBalance * scale(r.year),
            yourContribution: yourRows[i].contribution * scale(r.year),
          }
        : {}),
    }));

    // Close the series on the final end-of-year balance so the curve does not
    // stop a year short of the plan horizon.
    const last = rows[rows.length - 1];
    const yourLast = yourRows?.[yourRows.length - 1];
    if (last) {
      points.push({
        age: last.age + 1,
        balance: last.endBalance * scale(last.year + 1),
        contribution: 0,
        withdrawal: 0,
        socialSecurity: 0,
        phase: 'retirement',
        ...(yourLast ? { yourBalance: yourLast.endBalance * scale(last.year + 1) } : {}),
      });
    }
    return points;
  }, [results, yours, dollars, inputs.inflation]);

  const targetValue =
    results.targetNestEgg *
    (dollars === 'nominal'
      ? Math.pow(1 + inputs.inflation, Math.max(0, inputs.retirementAge - inputs.currentAge))
      : 1);

  const peak = data.find((p) => p.age === inputs.retirementAge);
  const depletionAge = results.simulation.depletionAge;
  const finite = Number.isFinite(results.requiredSavingsRate);

  return (
    <section className="card">
      <div className="chart-head">
        <div>
          <h3 className="chart-title">Portfolio balance, age {inputs.currentAge} to {inputs.planToAge}</h3>
          <p className="chart-subtitle">
            {comparing
              ? `Your ${(yours.rate * 100).toFixed(1)}% against the ${
                  finite ? `${(results.requiredSavingsRate * 100).toFixed(1)}%` : 'rate'
                } the target needs.`
              : finite
                ? `Investing ${(results.requiredSavingsRate * 100).toFixed(1)}% of income until ${inputs.retirementAge}, then drawing it down.`
                : 'No contribution years remain.'}{' '}
            {dollars === 'real'
              ? "Today's dollars — inflation already removed."
              : `Nominal dollars, inflated at ${(inputs.inflation * 100).toFixed(1)}%/yr.`}
          </p>
          {comparing ? (
            <div className="legend">
              <span className="legend-item">
                <span className="line-key key-yours" aria-hidden="true" />
                Your {(yours.rate * 100).toFixed(1)}%
              </span>
              <span className="legend-item">
                <span className="line-key" aria-hidden="true" />
                Required {finite ? `${(results.requiredSavingsRate * 100).toFixed(1)}%` : ''}
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="seg" role="group" aria-label="Dollar basis">
            <button
              type="button"
              aria-pressed={dollars === 'real'}
              onClick={() => setDollars('real')}
            >
              Today's $
            </button>
            <button
              type="button"
              aria-pressed={dollars === 'nominal'}
              onClick={() => setDollars('nominal')}
            >
              Nominal $
            </button>
          </div>
          <div className="seg" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={!showTable}
              onClick={() => setShowTable(false)}
            >
              Chart
            </button>
            <button type="button" aria-pressed={showTable} onClick={() => setShowTable(true)}>
              Table
            </button>
          </div>
        </div>
      </div>

      {showTable ? (
        <TableView data={data} comparing={comparing} />
      ) : (
        <div className="chart-body" style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 24, right: 16, bottom: 24, left: 8 }}>
              <defs>
                <linearGradient id="balanceWash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid
                vertical={false}
                stroke="var(--gridline)"
                strokeWidth={1}
              />

              <XAxis
                dataKey="age"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--baseline)' }}
                tickCount={9}
                allowDecimals={false}
              >
                <Label
                  value="Age"
                  position="insideBottom"
                  offset={-14}
                  style={{ fill: 'var(--text-muted)', fontSize: 11 }}
                />
              </XAxis>

              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={formatCompact}
              />

              <Tooltip
                content={<BalanceTooltip />}
                cursor={{ stroke: 'var(--baseline)', strokeWidth: 1 }}
              />

              {/* Chrome: where the curve turns over. */}
              <ReferenceLine
                x={inputs.retirementAge}
                stroke="var(--baseline)"
                strokeWidth={1}
              >
                <Label
                  value={`Retire at ${inputs.retirementAge}`}
                  position="top"
                  style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                />
              </ReferenceLine>

              {/* A threshold, so it is dashed — never the grid. */}
              <ReferenceLine
                y={targetValue}
                stroke="var(--text-muted)"
                strokeWidth={1}
                strokeDasharray="4 4"
              >
                <Label
                  value={`Target ${formatCompact(targetValue)}`}
                  position="insideTopLeft"
                  style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                />
              </ReferenceLine>

              <Area
                type="monotone"
                dataKey="balance"
                name="Required"
                stroke="var(--series-1)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                /* When comparing, drop the wash — two overlapping fills muddy
                   both curves and the comparison is what matters. */
                fill={comparing ? 'none' : 'url(#balanceWash)'}
                isAnimationActive={false}
                activeDot={{
                  r: 4,
                  fill: 'var(--series-1)',
                  stroke: 'var(--surface-1)',
                  strokeWidth: 2,
                }}
              />

              {comparing ? (
                <Area
                  type="monotone"
                  dataKey="yourBalance"
                  name="Yours"
                  stroke="var(--series-2)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  isAnimationActive={false}
                  activeDot={{
                    r: 4,
                    fill: 'var(--series-2)',
                    stroke: 'var(--surface-1)',
                    strokeWidth: 2,
                  }}
                />
              ) : null}

              {/* Direct-label the one point that matters. */}
              {peak ? (
                <ReferenceDot
                  x={peak.age}
                  y={peak.balance}
                  r={4}
                  fill="var(--series-1)"
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                >
                  <Label
                    value={formatCompact(peak.balance)}
                    position="top"
                    offset={10}
                    style={{ fill: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}
                  />
                </ReferenceDot>
              ) : null}

              {comparing && peak?.yourBalance !== undefined ? (
                <ReferenceDot
                  x={peak.age}
                  y={peak.yourBalance}
                  r={4}
                  fill="var(--series-2)"
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                >
                  <Label
                    value={formatCompact(peak.yourBalance)}
                    position="bottom"
                    offset={10}
                    style={{ fill: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}
                  />
                </ReferenceDot>
              ) : null}

              {comparing && yours.simulation.depletionAge !== null ? (
                <ReferenceLine
                  x={yours.simulation.depletionAge}
                  stroke="var(--status-critical)"
                  strokeWidth={1}
                >
                  <Label
                    value={`Yours runs dry at ${yours.simulation.depletionAge}`}
                    position="insideTopRight"
                    style={{ fill: 'var(--status-critical)', fontSize: 11, fontWeight: 600 }}
                  />
                </ReferenceLine>
              ) : null}

              {depletionAge !== null ? (
                <ReferenceLine
                  x={depletionAge}
                  stroke="var(--status-critical)"
                  strokeWidth={1}
                >
                  <Label
                    value={`Runs dry at ${depletionAge}`}
                    /* Yields the top slot to your own path when comparing —
                       your rate is the one that usually runs dry. */
                    position={comparing ? 'insideBottomRight' : 'insideTopRight'}
                    style={{ fill: 'var(--status-critical)', fontSize: 11, fontWeight: 600 }}
                  />
                </ReferenceLine>
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
}

function BalanceTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;

  return (
    <div className="tooltip">
      <div className="tooltip-age">Age {p.age}</div>
      {p.yourBalance !== undefined ? (
        <div className="tooltip-row">
          <span className="tooltip-label">
            <span className="line-key key-yours" aria-hidden="true" />
            Yours
          </span>
          <span className="tooltip-value">{formatCurrency(p.yourBalance)}</span>
        </div>
      ) : null}
      <div className="tooltip-row">
        <span className="tooltip-label">
          <span className="line-key" aria-hidden="true" />
          {p.yourBalance !== undefined ? 'Required' : 'Balance'}
        </span>
        <span className="tooltip-value">{formatCurrency(p.balance)}</span>
      </div>
      {p.contribution > 0 ? (
        <div className="tooltip-row">
          <span className="tooltip-label">Invested</span>
          <span className="tooltip-value">{formatCurrency(p.contribution)}</span>
        </div>
      ) : null}
      {p.withdrawal > 0 ? (
        <div className="tooltip-row">
          <span className="tooltip-label">Withdrawn</span>
          <span className="tooltip-value">{formatCurrency(p.withdrawal)}</span>
        </div>
      ) : null}
      {p.socialSecurity > 0 ? (
        <div className="tooltip-row">
          <span className="tooltip-label">Social Security</span>
          <span className="tooltip-value">{formatCurrency(p.socialSecurity)}</span>
        </div>
      ) : null}
    </div>
  );
}

/** The table-view twin: every value the chart shows, reachable without hovering. */
function TableView({ data, comparing }: { data: Point[]; comparing: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Age</th>
            {comparing ? <th scope="col">Yours</th> : null}
            <th scope="col">{comparing ? 'Required' : 'Balance'}</th>
            <th scope="col">Invested</th>
            <th scope="col">Withdrawn</th>
            <th scope="col">Social Security</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.age}>
              <td>{p.age}</td>
              {comparing ? (
                <td>{p.yourBalance !== undefined ? formatCurrency(p.yourBalance) : '—'}</td>
              ) : null}
              <td>{formatCurrency(p.balance)}</td>
              <td>
                {comparing
                  ? p.yourContribution
                    ? formatCurrency(p.yourContribution)
                    : '—'
                  : p.contribution > 0
                    ? formatCurrency(p.contribution)
                    : '—'}
              </td>
              <td>{p.withdrawal > 0 ? formatCurrency(p.withdrawal) : '—'}</td>
              <td>{p.socialSecurity > 0 ? formatCurrency(p.socialSecurity) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
